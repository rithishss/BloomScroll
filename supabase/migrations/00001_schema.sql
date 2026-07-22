-- BloomScroll schema. Applies cleanly to a fresh Supabase project:
--   supabase db push   (or run in the SQL editor in order 00001 → 00003)

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Student',
  avatar_url text,
  study_goal text not null default 'understand'
    check (study_goal in ('understand', 'exam', 'memorize')),
  preferred_difficulty text not null default 'core'
    check (preferred_difficulty in ('intro', 'core', 'advanced')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── topic_preferences ────────────────────────────────────────────────────
create table public.topic_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 80),
  explicit_weight real not null default 0.5 check (explicit_weight between 0 and 1),
  learned_weight real not null default 0.3 check (learned_weight between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic)
);

-- ── documents ────────────────────────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  original_filename text not null,
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null check (file_size_bytes > 0),
  page_count integer,
  status text not null default 'queued'
    check (status in ('queued', 'extracting', 'chunking', 'embedding', 'generating', 'ready', 'failed')),
  processing_progress integer not null default 0
    check (processing_progress between 0 and 100),
  error_message text,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_created_idx on public.documents (user_id, created_at desc);
create index documents_user_status_idx on public.documents (user_id, status);

-- ── document_chunks ──────────────────────────────────────────────────────
-- embedding dimension matches OPENAI_EMBEDDING_MODEL=text-embedding-3-small.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null,
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  content text not null,
  token_count integer not null default 0,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index document_chunks_document_idx on public.document_chunks (document_id, chunk_index);
create index document_chunks_user_idx on public.document_chunks (user_id);
-- HNSW cosine index for semantic search; matches match_document_chunks below.
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- ── study_cards ──────────────────────────────────────────────────────────
create table public.study_cards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_type text not null
    check (card_type in ('concept', 'key_point', 'example', 'question', 'memory_hook')),
  topic text not null,
  title text not null,
  explanation text not null,
  question text,
  answer text,
  takeaway text,
  difficulty text not null default 'core'
    check (difficulty in ('intro', 'core', 'advanced')),
  source_chunk_ids uuid[] not null default '{}',
  source_excerpt text not null,
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  generation_version integer not null default 1,
  created_at timestamptz not null default now()
);

create index study_cards_user_idx on public.study_cards (user_id, created_at desc);
create index study_cards_document_idx on public.study_cards (document_id);
create index study_cards_user_topic_idx on public.study_cards (user_id, topic);

-- ── card_events (append-only) ────────────────────────────────────────────
create table public.card_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.study_cards (id) on delete cascade,
  event_type text not null
    check (event_type in ('impression', 'understood', 'review_again', 'save', 'unsave', 'source_open', 'skip')),
  dwell_ms integer check (dwell_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index card_events_user_created_idx on public.card_events (user_id, created_at desc);
create index card_events_card_idx on public.card_events (card_id);

-- ── card_states (one row per user/card) ──────────────────────────────────
create table public.card_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.study_cards (id) on delete cascade,
  saved boolean not null default false,
  mastery_score real not null default 0 check (mastery_score between 0 and 1),
  times_seen integer not null default 0 check (times_seen >= 0),
  last_seen_at timestamptz,
  next_review_at timestamptz,
  last_action text
    check (last_action in ('impression', 'understood', 'review_again', 'save', 'unsave', 'source_open', 'skip')),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index card_states_saved_idx on public.card_states (user_id) where saved;
create index card_states_review_idx on public.card_states (user_id, next_review_at);

-- ── chat_threads / chat_messages ─────────────────────────────────────────
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  selected_document_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- ── updated_at maintenance ───────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger topic_preferences_touch before update on public.topic_preferences
  for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
create trigger card_states_touch before update on public.card_states
  for each row execute function public.touch_updated_at();
create trigger chat_threads_touch before update on public.chat_threads
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────
-- Every table is owner-scoped: users read and write only their own rows,
-- and WITH CHECK clauses make user_id spoofing impossible on insert/update.

alter table public.profiles enable row level security;
create policy "profiles own select" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles own update" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.topic_preferences enable row level security;
create policy "topic_preferences own all" on public.topic_preferences
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.documents enable row level security;
create policy "documents own all" on public.documents
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.document_chunks enable row level security;
create policy "document_chunks own all" on public.document_chunks
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.study_cards enable row level security;
create policy "study_cards own all" on public.study_cards
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.card_events enable row level security;
create policy "card_events own select" on public.card_events
  for select using (user_id = (select auth.uid()));
-- Append-only: no update/delete policies exist on purpose.
create policy "card_events own insert" on public.card_events
  for insert with check (user_id = (select auth.uid()));

alter table public.card_states enable row level security;
create policy "card_states own all" on public.card_states
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.chat_threads enable row level security;
create policy "chat_threads own all" on public.chat_threads
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.chat_messages enable row level security;
create policy "chat_messages own all" on public.chat_messages
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
