-- Semantic search over the caller's own chunks. SECURITY INVOKER + an
-- explicit auth.uid() filter: even if RLS were misconfigured, the WHERE
-- clause pins results to the authenticated user, so one user can never
-- retrieve another user's chunks through this RPC.

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  selected_document_ids uuid[] default null,
  match_threshold real default 0.15,
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  chunk_index integer,
  page_start integer,
  page_end integer,
  content text,
  similarity real
)
language sql
security invoker
stable
as $$
  select
    c.id as chunk_id,
    c.document_id,
    d.title as document_title,
    c.chunk_index,
    c.page_start,
    c.page_end,
    c.content,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = (select auth.uid())
    and c.embedding is not null
    and (selected_document_ids is null or c.document_id = any (selected_document_ids))
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

comment on function public.match_document_chunks is
  'Cosine-similarity search across the authenticated user''s document chunks. '
  'Results are always limited to auth.uid(); selected_document_ids further narrows within ownership.';
