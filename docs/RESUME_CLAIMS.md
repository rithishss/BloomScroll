# Resume claims → implementation

Each claim below maps to the exact files, database objects, and demo steps that make it true.

---

## Claim 1

> Built a full-stack web app where students upload PDFs of textbooks or notes and receive short, swipeable summary cards generated from the source material.

**Full-stack:**
- Frontend: `components/screens/feed-screen.tsx`, `components/feed/card-stack.tsx`, `components/feed/study-card-face.tsx` (Next.js App Router, TypeScript, Tailwind, Motion).
- Backend: `app/api/documents/route.ts` (upload), `app/api/documents/[documentId]/process/route.ts` (processing trigger), `lib/documents/job-runner.ts` + `lib/documents/pipeline.ts` (extraction → chunking → embedding → generation).
- Database: `supabase/migrations/00001_schema.sql` — `documents`, `document_chunks`, `study_cards` tables.

**Upload → cards, generated from source material (not invented):**
- Validation: `lib/validation/upload.ts` (`validatePdfUpload`, extension/MIME/size/`%PDF-` header check).
- Extraction: `lib/documents/pdf.ts` (LangChain `PDFLoader`, page-by-page, honest scanned-PDF detection).
- Chunking: `lib/documents/chunking.ts` (`RecursiveCharacterTextSplitter`, page-range tracking).
- Generation: `lib/ai/generate-cards.ts` — structured output validated by Zod (`lib/ai/schemas.ts`), every card's `sourceExcerpt` derived from the real chunk text (`excerptFromChunk`), not the model's own words.

**Swipeable:**
- `components/feed/card-stack.tsx` — Motion drag gestures, keyboard controls (←/→/Space/S), visible buttons for every action, `prefers-reduced-motion` handling, impression logging only after the card has been visible for 700ms.

**Demo steps to see it live:** `/demo/feed` → drag or click a card → `/demo/upload` to see the (simulated, honestly labeled) processing timeline; with real credentials, `/app/upload` runs the identical pipeline against a live Supabase project and OpenAI.

---

## Claim 2

> Implemented Retrieval-Augmented Generation with semantic search over uploaded documents so generated summaries and answers remain grounded in the source.

**Semantic search:**
- `document_chunks.embedding vector(1536)` (`supabase/migrations/00001_schema.sql`), HNSW cosine index.
- `match_document_chunks` RPC (`supabase/migrations/00003_functions.sql`) — ownership-scoped (`auth.uid()` filter inside the SQL function), returns similarity + page metadata.
- Retrieval call site: `lib/ai/ask.ts`'s `retrieveChunks`.

**Grounded generation (cards):**
- `lib/ai/generate-cards.ts` — every card cites `source_chunk_indexes` into the exact passages provided; `validateChunkIndexes` rejects out-of-range citations; `dedupeCards` removes near-duplicates.

**Grounded generation (Ask Bloom):**
- `lib/ai/ask.ts`'s `answerFromChunks` — the model answers strictly from retrieved chunks, sets `insufficient_evidence: true` honestly when they don't cover the question, and citations are validated against the actual retrieval set before being trusted.
- Untrusted-content guardrail in both system prompts: `lib/ai/prompts.ts`.

**Demo steps to see it live:** `/demo/ask` → ask "Why does SJF minimize average waiting time?" (grounded, cited answer) → ask an off-topic question (honest "insufficient evidence" response). The demo's retrieval is a real lexical/TF-rarity algorithm (`lib/demo/retrieval.ts`), not a mock — it's the same *shape* of retrieve-then-answer pipeline as real mode, just without a model call, and is labeled as such.

---

## Claim 3

> Built authentication, private file storage, and personalized feed APIs on Supabase, ranking cards using user activity and topic preferences.

**Authentication:**
- `lib/supabase/server.ts`, `lib/supabase/browser.ts` (Supabase Auth via `@supabase/ssr`).
- `proxy.ts` — session refresh + route gating.
- `app/(auth)/login`, `app/(auth)/signup`, `app/auth/callback/route.ts`, `components/auth/auth-form.tsx`.
- `supabase/migrations/00001_schema.sql` — `handle_new_user()` trigger auto-creates a `profiles` row on signup.

**Private file storage:**
- `supabase/migrations/00002_storage.sql` — private `documents` bucket, storage policies scoping reads/writes/deletes to `{userId}/...` paths.
- `app/api/documents/route.ts` (upload to storage), `app/api/documents/[documentId]/signed-url/route.ts` (short-lived signed URLs for viewing, never public access).

**Personalized feed APIs:**
- `app/api/feed/route.ts` → `lib/api/feed-service.ts`'s `buildFeedPage`.
- `app/api/events/route.ts` → `lib/api/events-service.ts`'s `recordCardEvent`.
- Ranking: `lib/feed/ranking.ts` (topic relevance, review urgency, novelty, engagement, difficulty fit, deterministic exploration — six weighted components, documented formula).
- Activity tracking: `card_events` (append-only), `card_states` (mastery/scheduling per user+card), `topic_preferences` (explicit + learned weight per topic) — all in `supabase/migrations/00001_schema.sql`.
- Mastery/scheduling logic: `lib/feed/mastery.ts` (`applyCardEvent`, `reviewIntervalMs`, rapid-skip topic suppression).

**Demo steps to see it live:** `/demo/feed` → click the "Why this card?" info icon on any card to see the actual ranking reasons → `/demo/settings` → adjust a topic-interest slider and return to the feed to see the ranking respond. With real credentials, the identical ranking module (`lib/feed/ranking.ts`) runs server-side in `buildFeedPage`, provably the same code via `tests/unit/ranking.test.ts` and the fact both providers import the same file.

---

## Verifying these claims yourself

```bash
npm run test        # 156 unit + integration tests, including ownership/RLS-simulation tests
npm run typecheck    # strict TypeScript, zero errors
npm run lint         # zero errors
npm run build        # succeeds with zero environment variables set
npm run e2e          # Playwright smoke suite against the demo workspace
```
