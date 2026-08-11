-- Per-document multiple-choice quiz, generated during ingestion in the same
-- model call as that document's study cards (so both are grounded in the same
-- retrieved passages).

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  question text not null,
  -- Exactly four options; correct_index points into this array (0-based).
  options text[] not null check (array_length(options, 1) = 4),
  correct_index integer not null check (correct_index between 0 and 3),
  rationale text not null,
  -- Nullable: the supporting chunk may be cleaned up by a later reprocess,
  -- but the denormalized excerpt/page range below always survive so a wrong
  -- answer can still show its source.
  source_chunk_id uuid references public.document_chunks (id) on delete set null,
  source_excerpt text not null,
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index quiz_questions_document_idx on public.quiz_questions (document_id, position);
create index quiz_questions_user_idx on public.quiz_questions (user_id);

alter table public.quiz_questions enable row level security;
create policy "quiz_questions own all" on public.quiz_questions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

comment on table public.quiz_questions is
  'Multiple-choice questions generated per document during ingestion, alongside study_cards and from the same source passages.';
