-- Adds narrated-video-reel support to study cards. Videos are stored in the
-- existing private `documents` bucket (same per-user folder scoping, so no
-- new storage policies are needed) at
--   {userId}/{documentId}/reels/{cardId}.mp4

alter table public.study_cards
  add column video_storage_path text,
  add column video_duration_seconds real check (video_duration_seconds is null or video_duration_seconds > 0),
  add column narration_script text;

-- Postgres CHECK constraints can't be altered in place; drop and recreate
-- with the new 'rendering' stage inserted between card generation and ready.
alter table public.documents drop constraint documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('queued', 'extracting', 'chunking', 'embedding', 'generating', 'rendering', 'ready', 'failed'));
