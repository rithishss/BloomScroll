# Architecture

## Table of contents

1. [Two modes, one domain model](#two-modes-one-domain-model)
2. [Project layout](#project-layout)
3. [Database schema](#database-schema)
4. [PDF ingestion pipeline](#pdf-ingestion-pipeline)
5. [RAG: Ask Bloom](#rag-ask-bloom)
6. [Feed ranking](#feed-ranking)
7. [Auth and security](#auth-and-security)
8. [Reliability and performance](#reliability-and-performance)

## Two modes, one domain model

`lib/types.ts` defines the shared vocabulary — `StudyCard`, `DocumentSummary`, `FeedItem`, `Citation`, etc. — used by every screen component regardless of mode. `lib/data/provider.ts` defines the `DataProvider` interface every screen depends on:

```ts
interface DataProvider {
  readonly mode: "demo" | "real";
  getFeed(opts): Promise<FeedPage>;
  recordEvent(input): Promise<CardState | null>;
  ask(input): Promise<AskResult>;
  // ... documents, saved cards, search, settings, auth
}
```

Two implementations:

- **`lib/demo/provider.ts` (`DemoProvider`)** — backed by `localStorage` via `lib/demo/storage.ts`'s `DemoStore`, seeded from `lib/demo/seed.ts`. Uploads are validated for real (same `validatePdfUpload` the real pipeline uses) but "processing" is a labeled, timed simulation (`lib/demo/provider.ts`'s `runSimulatedPipeline`) — it never claims an external API call happened. Ask Bloom uses real lexical retrieval (`lib/demo/retrieval.ts`) over the seeded chunk text: TF × inverse-chunk-frequency scoring, then an extractive answer built from the actual matched sentences (never model-generated text, since there's no model in demo mode).
- **`lib/data/real-provider.ts` (`RealProvider`)** — a thin typed client over `/api/*` routes. Every route re-derives the authenticated user server-side; the client never sends a `user_id`.

`components/screens/*` (FeedScreen, LibraryScreen, DocumentScreen, UploadScreen, AskScreen, SavedScreen, SettingsScreen, OnboardingScreen) are mode-agnostic — they call `useDataProvider()` and render identically either way. `app/demo/*` and `app/app/*` are thin route files that mount the right provider (`DemoProviders` / `RealProviders`) around the same `AppShell` and screens.

## Project layout

```
app/
  (marketing)/            landing page lives at app/page.tsx directly
  (auth)/login,signup      shared AuthForm, degrades gracefully with no Supabase
  auth/callback/           OAuth/email-confirmation code exchange
  demo/                    seeded workspace route tree (DemoProvider)
  app/                     authenticated route tree (RealProvider), server-gated
  api/                     route handlers — one per resource, Zod-validated
components/
  bloomscroll/             brand: BloomMark (original SVG), Wordmark, DemoBadge
  shell/                   AppShell (sidebar+mobile nav), search command palette, theme toggle
  feed/                    CardStack (motion/drag), StudyCardFace, SourceDrawer
  screens/                 one file per route, shared by demo + real
  auth/                    AuthForm
  marketing/               HeroStack (landing page card preview)
  ui/                      Radix-based primitives (button, dialog, select, ...)
lib/
  types.ts                 shared domain types
  config.ts / config.server.ts   env parsing (pure function + server cache)
  data/                    DataProvider interface, React context, RealProvider
  demo/                    seed content, storage, lexical retrieval, DemoProvider
  documents/                normalize, chunking, pdf extraction, pipeline, job-runner
  ai/                      models (provider abstraction), prompts, schemas, generate-cards, ask
  feed/                    ranking.ts, mastery.ts
  api/                     server-side services used by route handlers (feed/events/documents), auth guard, rate limiting, typed errors
  database/                hand-maintained Supabase types + row↔domain mappers
  supabase/                server/browser/admin client factories
  validation/               Zod schemas for uploads and API inputs
supabase/
  migrations/               00001_schema.sql, 00002_storage.sql, 00003_functions.sql
tests/
  unit/, integration/, e2e/
scripts/
  generate-demo-pdfs.ts     builds the two seeded PDFs from lib/demo/content.ts
```

Domain logic never lives in page components — pages are thin wrappers that mount a screen component, which in turn calls `useDataProvider()`.

## Database schema

Nine tables (see `supabase/migrations/00001_schema.sql` for full DDL, comments, and indexes):

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; study goal, preferred difficulty, onboarding flag |
| `topic_preferences` | explicit (onboarding/settings) + learned (from behavior) weight per topic |
| `documents` | one row per upload; status/progress drive the visible processing timeline |
| `document_chunks` | chunked source text + `vector(1536)` embedding + page range |
| `study_cards` | generated cards; `source_chunk_ids` + `source_excerpt` + page range for citations |
| `card_events` | append-only interaction log (impression, understood, review_again, save, unsave, source_open, skip) |
| `card_states` | one row per (user, card): mastery, times seen, next review, saved flag |
| `chat_threads` / `chat_messages` | Ask Bloom conversation history, with `citations` as JSONB |

Every table has RLS enabled with `user_id = auth.uid()` policies (read) and matching `WITH CHECK` clauses (write), so a client cannot spoof another user's `user_id` even on insert. `card_events` intentionally has no update/delete policy — it's append-only by design.

The `documents` private Storage bucket (`00002_storage.sql`) uses object paths `{userId}/{documentId}/{sanitizedFilename}`; storage policies check `(storage.foldername(name))[1] = auth.uid()::text`, so a user can only read/write inside their own folder.

`match_document_chunks` (`00003_functions.sql`) is the one RPC: cosine similarity search via pgvector's HNSW index, filtered by `auth.uid()` inside the function body (not just by caller-supplied parameters), so it cannot be used to search another user's chunks under any circumstances — even a buggy caller can't leak cross-user data through this path.

## PDF ingestion pipeline

Real code, not a mock behind a button. Flow (`lib/documents/pipeline.ts`'s `processDocument`, orchestrating injected dependencies):

1. **Claim** — an atomic status-transition update (`queued|failed|ready → extracting`) that fails if another request already claimed the document; this is the double-processing guard, tested in `tests/integration/pipeline.test.ts`.
2. **Clean up** — deletes any chunks/cards from a prior partial run, making retries idempotent.
3. **Extract** (`lib/documents/pdf.ts`) — LangChain's `PDFLoader`, page-by-page, with an honest "this looks scanned" error when <20% of pages have substantial text (no OCR is implemented, and none is claimed).
4. **Normalize** (`lib/documents/normalize.ts`) — strips control characters and collapses whitespace without touching math notation or Unicode symbols; drops empty pages while preserving their original page numbers.
5. **Chunk** (`lib/documents/chunking.ts`) — `RecursiveCharacterTextSplitter`, ~3600 chars (≈900 tokens) with ~500 char (≈125 token) overlap; each chunk is mapped back to the page span its characters came from.
6. **Embed** — batches of 32 texts, 3 retries with exponential backoff (`lib/documents/job-runner.ts`).
7. **Generate cards** (`lib/ai/generate-cards.ts`) — structured output validated against `cardBatchSchema` (Zod); every card's `source_chunk_indexes` must reference chunks actually provided in the prompt (`validateChunkIndexes`); near-duplicates removed via token-Jaccard similarity (`dedupeCards`, threshold 0.6); the stored `sourceExcerpt` is derived from the real chunk text, not the model's output. Up to 3 attempts with backoff before the document is marked `failed` with a useful message.
8. **Ready** — progress hits 100, cards and chunks are queryable.

`lib/documents/job-runner.ts` wires real Supabase (service-role client, used only after the calling route already verified ownership with the user's RLS-scoped client) and real LangChain calls into `PipelineDeps`; `tests/integration/pipeline.test.ts` wires in fakes to test retry/idempotency/failure handling without touching a real database. Swapping the inline runner for a queue worker means writing a new adapter for `PipelineDeps`/`PipelineDb` and calling `processDocument` from the worker — the orchestration itself doesn't change.

## RAG: Ask Bloom

`app/api/ask/route.ts` → `lib/ai/ask.ts`:

1. Validate the question (`askSchema`) and confirm every `documentId` in the request actually belongs to the caller (checked against `documents` with the user's RLS-scoped client — never trusted from the client).
2. Embed the question, call `match_document_chunks` (ownership-scoped inside the SQL function itself).
3. `rerankForDiversity` caps any single document at 3 of the returned chunks so a multi-document question doesn't get answered from only one source.
4. `answerFromChunks` calls the chat model with structured output (`askAnswerSchema`): the model must set `insufficient_evidence: true` when the passages don't support an answer, and must cite `cited_chunk_indexes` into the numbered context it was given. If the model claims cited indexes that don't parse, the code falls back to citing the retrieval set — it never lets an answer stand with a citation to an index that doesn't exist.
5. The exchange is persisted to `chat_threads`/`chat_messages` (`citations` as JSONB).

Both the card-generation and Ask Bloom system prompts (`lib/ai/prompts.ts`) include an explicit guardrail: text inside uploaded documents is untrusted content, and any text that looks like an instruction to the model is just content to study, never a command to follow.

Only the retrieved chunks are ever sent to the model — never the full PDF, and never all of a document's chunks.

## Feed ranking

See the [README's ranking section](../README.md#feed-ranking-explanation) for the formula. Implementation notes:

- `lib/feed/ranking.ts`'s `scoreCard` and `rankCards` are pure functions of `(cards, RankingContext)` — no I/O, fully unit-tested (`tests/unit/ranking.test.ts`), and shared verbatim between `DemoProvider.getFeed` and `lib/api/feed-service.ts`'s `buildFeedPage`.
- The diversity pass is a **hard filter**, not a score penalty: at each step, a candidate that would create a third consecutive same-topic-or-document card is only eligible if literally no other candidate remains in the pool. An earlier implementation used a fixed subtraction penalty; testing found that a strong enough topic-preference gap (e.g., explicit weight 1.0 vs 0.0) could outweigh any fixed penalty, silently breaking the "avoid repetition when alternatives exist" guarantee — the fix and the reasoning are documented directly in the file.
- `lib/feed/mastery.ts` holds the spaced-review ladder (`reviewIntervalMs`) and the rapid-skip topic-suppression tracker (`trackSkip`/`isTopicSuppressed`), shared the same way.
- Real mode fetches candidates in one bounded query (`CANDIDATE_LIMIT = 400`) plus the user's card states and last 200 events, then ranks and pages in memory — no N+1 queries, no full-table scan.

## Auth and security

- `proxy.ts` (Next's proxy/middleware) refreshes the Supabase session cookie and redirects signed-out users away from `/app/*`; the `/app` layout re-checks server-side as defense in depth.
- Every API route starts with `requireUser()` (`lib/api/auth.ts`), which 503s if Supabase isn't configured and 401s if there's no session, otherwise hands back an RLS-scoped `supabase` client plus the verified `user`.
- The service-role client (`lib/supabase/admin.ts`) is `server-only`-guarded and used only for two things: the ingestion pipeline (after ownership is already verified) and deleting storage objects on document/account deletion.
- Rate limiting (`lib/api/rate-limit.ts`, in-memory sliding window) guards `/api/ask` (10/min), `/api/documents/:id/process` (4/10min), and uploads (10/10min) against accidental repeated AI requests.

## Reliability and performance

- Server components by default; `"use client"` only where interactivity is needed (feed gestures, forms, the search palette).
- Feed and library data are paginated (`limit`/`cursor`), never fetched in full.
- Impressions are deduplicated (5-second window) both client-side (React-rerender safe, `impressedRef` in `CardStack`) and server-side (`recordCardEvent` checks the most recent impression event before inserting another).
- The event-recording path uses an in-flight `Set` keyed by `${cardId}:${eventType}` so rapid double-clicks/swipes can't double-submit the same action.
- Route-level error boundaries (`app/error.tsx`, `app/not-found.tsx`) and a consistent typed API error envelope (`lib/api/errors.ts`) throughout.
