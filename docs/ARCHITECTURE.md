# Architecture

## Table of contents

1. [Two modes, one domain model](#two-modes-one-domain-model)
2. [Two card faces, one feed engine](#two-card-faces-one-feed-engine)
3. [Project layout](#project-layout)
4. [Database schema](#database-schema)
5. [PDF ingestion pipeline](#pdf-ingestion-pipeline)
6. [Video-rendering pipeline](#video-rendering-pipeline)
7. [RAG: Ask Bloom](#rag-ask-bloom)
8. [Feed ranking](#feed-ranking)
9. [Auth and security](#auth-and-security)
10. [Reliability and performance](#reliability-and-performance)

## Two modes, one domain model

`lib/types.ts` defines the shared vocabulary — `StudyCard` (now carrying `videoDurationSeconds`/`narrationScript` alongside the original text fields), `DocumentSummary`, `FeedItem`, `Citation`, etc. — used by every screen component regardless of mode. `lib/data/provider.ts` defines the `DataProvider` interface every screen depends on:

```ts
interface DataProvider {
  readonly mode: "demo" | "real";
  getFeed(opts): Promise<FeedPage>;
  recordEvent(input): Promise<CardState | null>;
  getCardVideoUrl(cardId): Promise<{ url: string | null; note: string | null }>;
  ask(input): Promise<AskResult>;
  // ... documents, saved cards, search, settings, auth
}
```

Two implementations:

- **`lib/demo/provider.ts` (`DemoProvider`)** — backed by `localStorage` via `lib/demo/storage.ts`'s `DemoStore`, seeded from `lib/demo/seed.ts`. Uploads are validated for real (same `validatePdfUpload` the real pipeline uses) but "processing" is a labeled, timed simulation (`lib/demo/provider.ts`'s `runSimulatedPipeline`) — it never claims an external API call happened, and no reel is generated for a demo upload. The 23 seeded cards each point at a real, pre-rendered `.mp4` in `public/demo-videos/`, served directly by `getCardVideoUrl`. Ask Bloom uses real lexical retrieval (`lib/demo/retrieval.ts`) over the seeded chunk text: TF × inverse-chunk-frequency scoring, then an extractive answer built from the actual matched sentences (never model-generated text, since there's no model in demo mode).
- **`lib/data/real-provider.ts` (`RealProvider`)** — a thin typed client over `/api/*` routes. Every route re-derives the authenticated user server-side; the client never sends a `user_id`. `getCardVideoUrl` resolves a short-lived signed URL to the card's rendered reel in Supabase Storage.

`components/screens/*` (FeedScreen, LibraryScreen, DocumentScreen, UploadScreen, AskScreen, SavedScreen, SettingsScreen, OnboardingScreen) are mode-agnostic — they call `useDataProvider()` and render identically either way. `app/demo/*` and `app/app/*` are thin route files that mount the right provider (`DemoProviders` / `RealProviders`) around the same `AppShell` and screens.

## Two card faces, one feed engine

A `StudyCard` is one unit of study material. It has exactly one set of generated content — type, topic, title, explanation, optional question/answer/takeaway, source chunks, page range — and *two ways of being presented*:

| | `StudyCardFace` (text) | `VideoReelFace` (video) |
| --- | --- | --- |
| Renders | HTML: badges, title, explanation, reveal-answer, takeaway | The card's rendered `.mp4`, content baked into the frame |
| Needs | nothing beyond the card row | a rendered video (`video_storage_path`) + a signed URL or bundled file |
| Extra chrome | "Why this card?" | progress bar, mute toggle, transcript, tap-to-play fallback |
| Shape | width-driven, reading measure | 9:16 portrait |

Everything *around* the face is owned once by `components/feed/card-stack.tsx`: Motion drag gestures and swipe thresholds, keyboard shortcuts (←/→/Space/S), the 700ms impression delay, the mastery actions, save state, and the exit animation. `CardStack` takes a `face` prop and swaps only what fills the frame (plus that face's preferred sizing and peek-stack styling). Neither face knows anything about ranking, mastery, or the queue.

The choice lives in `lib/feed/use-feed-face.ts` and is persisted to `localStorage`, mirroring the existing mute preference. It uses `useSyncExternalStore` rather than `useState` + a hydration effect, specifically *because* it decides which component renders: the server snapshot is pinned to the default (`text`), so SSR and the first client render always agree and the stored value is adopted on subscribe without a hydration mismatch. (The mute preference can get away with plain `useState` since it only feeds a video property, never markup.)

**Text is the default deliberately.** It's the face that works with zero credentials, no TTS spend, and no rendered video — so a fresh visitor, a demo upload with no reels, or a document still mid-render all still have a working feed. The video pipeline is an optional layer on top of the same cards, not a prerequisite for using the app.

## Project layout

```
app/
  (marketing)/            landing page lives at app/page.tsx directly
  (auth)/login,signup      shared AuthForm, degrades gracefully with no Supabase
  auth/callback/           OAuth/email-confirmation code exchange
  demo/                    seeded workspace route tree (DemoProvider)
  app/                     authenticated route tree (RealProvider), server-gated
  api/                     route handlers — one per resource, Zod-validated
    cards/[cardId]/video-url/   signed URL for a card's rendered reel
components/
  bloomscroll/             brand: BloomMark (original SVG), Wordmark, DemoBadge
  shell/                   AppShell (sidebar+mobile nav), search command palette, theme toggle
  feed/                    CardStack (motion/drag), StudyCardFace + VideoReelFace (the two
                           interchangeable faces), FeedFaceToggle, ReelModal, SourceDrawer
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
  video/                   slide.ts (SVG→PNG), tts.ts, compose.ts (ffmpeg), narration.ts
  feed/                    ranking.ts, mastery.ts, use-feed-face.ts, use-reel-mute.ts
  api/                     server-side services used by route handlers (feed/events/documents), auth guard, rate limiting, typed errors
  database/                hand-maintained Supabase types + row↔domain mappers
  supabase/                server/browser/admin client factories
  validation/               Zod schemas for uploads and API inputs
supabase/
  migrations/               00001_schema.sql .. 00004_video_reels.sql
tests/
  unit/, integration/, e2e/
scripts/
  generate-demo-pdfs.ts     builds the two seeded PDFs from lib/demo/content.ts
  generate-demo-videos.ts   builds the 23 seeded reels (macOS `say` + the real render pipeline)
```

Domain logic never lives in page components — pages are thin wrappers that mount a screen component, which in turn calls `useDataProvider()`.

## Database schema

Nine tables (see `supabase/migrations/00001_schema.sql` for full DDL, comments, and indexes; `00004_video_reels.sql` for the reel columns added afterward):

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; study goal, preferred difficulty, onboarding flag |
| `topic_preferences` | explicit (onboarding/settings) + learned (from behavior) weight per topic |
| `documents` | one row per upload; status/progress drive the visible processing timeline (`queued → extracting → chunking → embedding → generating → rendering → ready`) |
| `document_chunks` | chunked source text + `vector(1536)` embedding + page range |
| `study_cards` | generated cards; `source_chunk_ids` + `source_excerpt` + page range for citations, plus `video_storage_path` / `video_duration_seconds` / `narration_script` for the rendered reel |
| `card_events` | append-only interaction log (impression, understood, review_again, save, unsave, source_open, skip) |
| `card_states` | one row per (user, card): mastery, times seen, next review, saved flag |
| `chat_threads` / `chat_messages` | Ask Bloom conversation history, with `citations` as JSONB |

Every table has RLS enabled with `user_id = auth.uid()` policies (read) and matching `WITH CHECK` clauses (write), so a client cannot spoof another user's `user_id` even on insert. `card_events` intentionally has no update/delete policy — it's append-only by design.

The `documents` private Storage bucket (`00002_storage.sql`) holds both source PDFs and rendered reels, under two path shapes: `{userId}/{documentId}/{sanitizedFilename}` for PDFs and `{userId}/{documentId}/reels/{cardId}.mp4` for videos. Storage policies check `(storage.foldername(name))[1] = auth.uid()::text` — only the first path segment matters, so both content types are covered by the same per-user-folder policies without a second bucket.

`match_document_chunks` (`00003_functions.sql`) is the one RPC: cosine similarity search via pgvector's HNSW index, filtered by `auth.uid()` inside the function body (not just by caller-supplied parameters), so it cannot be used to search another user's chunks under any circumstances — even a buggy caller can't leak cross-user data through this path.

## PDF ingestion pipeline

Real code, not a mock behind a button. Flow (`lib/documents/pipeline.ts`'s `processDocument`, orchestrating injected dependencies):

1. **Claim** — an atomic status-transition update (`queued|failed|ready → extracting`) that fails if another request already claimed the document; this is the double-processing guard, tested in `tests/integration/pipeline.test.ts`.
2. **Clean up** — deletes any chunks/cards (and their rendered reel files in storage) from a prior partial run, making retries idempotent.
3. **Extract** (`lib/documents/pdf.ts`) — LangChain's `PDFLoader`, page-by-page, with an honest "this looks scanned" error when <20% of pages have substantial text (no OCR is implemented, and none is claimed).
4. **Normalize** (`lib/documents/normalize.ts`) — strips control characters and collapses whitespace without touching math notation or Unicode symbols; drops empty pages while preserving their original page numbers.
5. **Chunk** (`lib/documents/chunking.ts`) — `RecursiveCharacterTextSplitter`, ~3600 chars (≈900 tokens) with ~500 char (≈125 token) overlap; each chunk is mapped back to the page span its characters came from.
6. **Embed** — batches of 32 texts, 3 retries with exponential backoff (`lib/documents/job-runner.ts`).
7. **Generate cards** (`lib/ai/generate-cards.ts`) — structured output validated against `cardBatchSchema` (Zod); every card's `source_chunk_indexes` must reference chunks actually provided in the prompt (`validateChunkIndexes`); near-duplicates removed via token-Jaccard similarity (`dedupeCards`, threshold 0.6); the stored `sourceExcerpt` is derived from the real chunk text, not the model's output. Up to 3 attempts with backoff before the document is marked `failed` with a useful message.
8. **Render reels** — one narrated video per card, sequentially (see [Video-rendering pipeline](#video-rendering-pipeline)); progress advances per card. A card whose render exhausts its own retries fails the whole document with a message naming that card, rather than silently shipping a card that can be read but never watched.
9. **Ready** — progress hits 100, cards are queryable and their reels playable.

`lib/documents/job-runner.ts` wires real Supabase (service-role client, used only after the calling route already verified ownership with the user's RLS-scoped client), real LangChain calls, and the real video-rendering pipeline into `PipelineDeps`; `tests/integration/pipeline.test.ts` wires in fakes (including a fake `renderVideo`) to test retry/idempotency/failure handling without touching a real database, model, or ffmpeg. Swapping the inline runner for a queue worker means writing a new adapter for `PipelineDeps`/`PipelineDb` and calling `processDocument` from the worker — the orchestration itself doesn't change.

## Video-rendering pipeline

Each generated card becomes one short vertical reel, rendered by `lib/video/*` and orchestrated as the pipeline's last stage:

1. **Narration script** (`narration.ts`) — `buildNarrationScript` joins the card's explanation and (if present) takeaway into one spoken-style string. This is reused verbatim as the on-screen caption text, so what's read aloud always matches what a transcript viewer shows — no separate "write a script" model call.
2. **Slide** (`slide.ts`) — `buildSlideSvg` lays out a 1080×1920 SVG in the app's palette: topic/type badges, title, explanation, an optional takeaway callout, and a document+page footer, with a hand-rolled word-wrap and baseline-aware vertical centering (font ascent/descent are accounted for explicitly — SVG `<text>` `y` is a baseline, not a box top, which bit us once during development; see the git history / code comment). `renderSlidePng` rasterizes it via `sharp` — no headless browser.
3. **Narrate** (`tts.ts`) — `synthesizeNarration` calls the configured OpenAI TTS model/voice and returns an MP3 buffer.
4. **Compose** (`compose.ts`) — `composeReel` writes the slide PNG and narration MP3 to a temp dir, probes the narration's duration with `ffprobe`, then runs `ffmpeg` with a `zoompan` filter (a slow, deterministic Ken Burns zoom) sized to exactly that duration, muxing in the audio and encoding H.264/AAC with `+faststart`. Both binaries come from `ffmpeg-static`/`ffprobe-static` (no system install, no Puppeteer/Chromium).
5. `job-runner.ts` uploads the resulting MP4 to the private `documents` bucket at `{userId}/{documentId}/reels/{cardId}.mp4` and records `video_storage_path`, `video_duration_seconds`, and `narration_script` on the card.

Playback is on-demand and short-lived: `VideoReelFace` and `ReelModal` call `getCardVideoUrl(cardId)`, which resolves a 5-minute signed URL in real mode or a static `/demo-videos/*.mp4` path in demo mode. Autoplay is muted-by-default (a persisted preference, `lib/feed/use-reel-mute.ts`) with an explicit imperative `play()`/`muted` sync on mount, since a bare `<video autoPlay muted>` JSX attribute doesn't reliably reflect onto the DOM node before the browser evaluates autoplay eligibility. If the browser still refuses (e.g. a backgrounded tab, or an aggressive power saver), a tap-to-play overlay appears — the reel never just looks silently frozen.

**Demo reels are pre-rendered, not simulated.** `scripts/generate-demo-videos.ts` runs this exact pipeline once, offline, for all 23 seeded cards — the only difference is narration comes from macOS's built-in `say` command instead of a paid OpenAI TTS call, so the one-time content-authoring step needs no API key. The resulting `public/demo-videos/*.mp4` files are real, playable, checked-in videos; nothing about their rendering is faked at runtime.

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
- The rendered video is content-addressed by card, not by rank — ranking only decides *order*, never regenerates or re-renders anything.

## Auth and security

- `proxy.ts` (Next's proxy/middleware) refreshes the Supabase session cookie and redirects signed-out users away from `/app/*`; the `/app` layout re-checks server-side as defense in depth.
- Every API route starts with `requireUser()` (`lib/api/auth.ts`), which 503s if Supabase isn't configured and 401s if there's no session, otherwise hands back an RLS-scoped `supabase` client plus the verified `user`.
- The service-role client (`lib/supabase/admin.ts`) is `server-only`-guarded and used only for three things: the ingestion pipeline (after ownership is already verified), uploading rendered reels, and deleting storage objects (PDFs and reels) on document/account deletion.
- Rate limiting (`lib/api/rate-limit.ts`, in-memory sliding window) guards `/api/ask` (10/min), `/api/documents/:id/process` (4/10min), and uploads (10/10min) against accidental repeated AI/render requests.

## Reliability and performance

- Server components by default; `"use client"` only where interactivity is needed (feed gestures, forms, the search palette, the video player).
- Feed and library data are paginated (`limit`/`cursor`), never fetched in full.
- Impressions are deduplicated (5-second window) both client-side (React-rerender safe, `impressedRef` in `CardStack`) and server-side (`recordCardEvent` checks the most recent impression event before inserting another).
- The event-recording path uses an in-flight `Set` keyed by `${cardId}:${eventType}` so rapid double-clicks/swipes can't double-submit the same action.
- Each swipeable reel's drag/rotate motion values (`x`, `rotate`, verdict-opacity) are created fresh per card inside a small `DraggableCard` subcomponent, rather than hoisted and shared across the whole stack. An earlier version shared one `useMotionValue` across all cards at the `CardStack` level and reset it to 0 in an effect on every card change; that reset raced against the *same* motion value being simultaneously driven by the previous card's exit animation, intermittently leaving the newly entered card visually stuck mid-exit-transform. Giving each card its own fresh motion values (naturally starting at 0 on mount, since Framer Motion tears down the old instance via `AnimatePresence` before the new one's `useMotionValue(0)` runs) removes the race entirely.
- Route-level error boundaries (`app/error.tsx`, `app/not-found.tsx`) and a consistent typed API error envelope (`lib/api/errors.ts`) throughout.
