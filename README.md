# BloomScroll

**Turn your notes into a study feed.**

BloomScroll is a full-stack AI study app: upload PDF lecture notes or a textbook chapter, and it turns them into a swipeable feed of concise, source-grounded study cards — ranked by what you actually need to review, not by upload order. Ask questions across your uploaded material and get answers with page-level citations, never a guess.

The whole product runs in two modes from one codebase: a **demo workspace** with seeded content that needs zero credentials, and a **real mode** backed by Supabase (Postgres + pgvector + Auth + Storage) and an OpenAI-compatible model.

- Live-in-repo demo: `/demo` (see [Quick start](#quick-start))
- Recruiter walkthrough: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)
- Architecture deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Resume-claim → code mapping: [docs/RESUME_CLAIMS.md](docs/RESUME_CLAIMS.md)

## Screenshots

Run the app locally (see below) and visit `/demo/feed`, `/demo/library`, and `/demo/ask` — the swipeable card stack, the library grid, and Ask Bloom's cited answers are the three views worth a look first.

## Product overview

1. A visitor lands on `/`, and can create an account or jump straight into `/demo`.
2. New users complete a short onboarding flow (name, topic interests, study goal, preferred difficulty).
3. They upload a PDF. It's validated, stored privately, and processed through a visible pipeline: extracting → organizing concepts → generating cards → ready.
4. Once ready, the document's cards join the personalized feed.
5. The user studies the feed: swipe or use buttons for "Got it" / "Review again" / "Save"; every action adjusts future ranking and spaced review.
6. Every card has a source drawer showing the exact stored excerpt, page number, and (when available) a deep link into the source PDF.
7. Ask Bloom answers questions using only retrieved passages from the user's own documents, with citations — and says so honestly when the material doesn't cover the question.

## Architecture summary

- **Next.js App Router**, TypeScript strict mode, Tailwind CSS v4, Radix-based UI primitives, Motion for the card-stack gestures.
- **One domain model, two data providers.** `lib/data/provider.ts` defines a `DataProvider` interface; `lib/demo/provider.ts` implements it over `localStorage`, `lib/data/real-provider.ts` implements it over `/api/*` routes backed by Supabase. Every screen component is written once against the interface and works unmodified in both modes.
- **Supabase**: Postgres with RLS on every table, pgvector for embeddings, private Storage bucket for PDFs, a SQL RPC (`match_document_chunks`) for ownership-scoped semantic search.
- **LangChain** (`@langchain/community`, `@langchain/textsplitters`, `@langchain/openai`) for PDF loading, recursive chunking, and embedding/generation orchestration.
- **Ingestion pipeline** (`lib/documents/pipeline.ts`) is a pure orchestration function over an injected `PipelineDb` + extraction/embedding/generation dependencies — the same function is unit-tested with fakes and wired to real Supabase/LangChain in `lib/documents/job-runner.ts`. Swapping the inline runner for a queue worker means rehosting one file.
- **Feed ranking** (`lib/feed/ranking.ts`) is a documented, deterministic scoring function shared byte-for-byte between demo and real mode.

Full detail, including the database schema, RAG pipeline, and ranking formula, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Try the interactive demo** — no environment variables, no Supabase project, no OpenAI key required. The demo workspace seeds two course documents (Operating Systems, Signals & Systems) with 22 study cards, realistic mastery/review state, and a lexical (non-AI) Ask Bloom implementation that's honest about what it is: extractive answers over the same seeded text, not a live model call.

## Demo-mode setup

Nothing to configure. `NEXT_PUBLIC_DEMO_MODE` defaults to `true` and the `/demo` route tree never touches Supabase or OpenAI. All state lives in `localStorage` under the key `bloomscroll-demo-v1`; reset it from Settings → "Reset demo workspace", or clear it manually in devtools.

The two seeded PDFs are generated from repository-owned text (`lib/demo/content.ts`) — regenerate them any time with:

```bash
npm run demo:pdfs
```

## Real-mode (Supabase + OpenAI) setup

1. Create a Supabase project.
2. Apply the migrations in order (SQL editor, or the CLI):
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This runs `supabase/migrations/00001_schema.sql` (tables, RLS, triggers), `00002_storage.sql` (private `documents` bucket + storage policies), and `00003_functions.sql` (`match_document_chunks` RPC).
3. Copy `.env.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only, never exposed to the client
   OPENAI_API_KEY=<key>
   OPENAI_CHAT_MODEL=gpt-4o-mini                   # any OpenAI-compatible chat model
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small    # must produce 1536-dim vectors (see below)
   NEXT_PUBLIC_DEMO_MODE=true                       # keep /demo working alongside real mode
   MAX_PDF_SIZE_MB=20
   ```
4. `npm run dev`, sign up at `/signup`, and upload a PDF from `/app/upload`.

If you swap `OPENAI_EMBEDDING_MODEL` for one with a different output dimension, update the `vector(1536)` columns in `00001_schema.sql` and the `match_document_chunks` RPC's `query_embedding vector(1536)` parameter in `00003_functions.sql` to match, then re-run migrations against a fresh project (pgvector columns aren't dimension-agnostic).

### Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Real mode | Public; safe in the client bundle |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Real mode | Public anon key; RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingestion pipeline | **Server-only.** Never imported by a client component |
| `OPENAI_API_KEY` | Real mode | Enables card generation, embeddings, Ask Bloom |
| `OPENAI_BASE_URL` | Optional | Point at any OpenAI-compatible endpoint |
| `OPENAI_CHAT_MODEL` | Optional | Default `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | Optional | Default `text-embedding-3-small` (1536-dim) |
| `NEXT_PUBLIC_DEMO_MODE` | — | Gate for surfacing the demo CTA; demo route works regardless |
| `MAX_PDF_SIZE_MB` | Optional | Default 20 |

## AI model configuration

Model names are never hardcoded — everything funnels through `lib/config.server.ts` (parsed once from env) and `lib/ai/models.ts` (`getChatModel()`, `getEmbeddings()`). To change providers or models, edit environment variables only.

## Running tests

```bash
npm run test          # Vitest: unit + integration (156 tests)
npm run test:e2e       # Playwright smoke suite against a production build
npm run e2e            # build + test:e2e in one step
```

- **Unit tests** (`tests/unit/`): PDF/filename validation, text normalization, chunking + page-number preservation, AI output schemas + citation/dedup logic, ranking score + diversity, mastery/review scheduling, demo persistence, config parsing, demo seed integrity (every card's excerpt is verified to be a real substring of the source text).
- **Integration tests** (`tests/integration/`): the ingestion pipeline's retry/idempotency/double-processing guards against a fake DB; ownership enforcement (`recordCardEvent`, `listUserDocuments`, `getDocumentDetail`, `deleteDocumentCompletely`, `buildFeedPage`) against a fake Supabase client that simulates Row Level Security; the demo provider's card interactions, saved cards, search, and Ask Bloom (including honest insufficient-evidence responses).
- **E2E** (`tests/e2e/`): landing → demo → feed (swipe actions, save) → saved screen → source drawer → Ask Bloom → mobile nav, asserting no console errors, on both a desktop and a mobile viewport.

## Production build

```bash
npm run build   # succeeds with zero environment variables set
npm run start
```

`npm run lint` and `npx tsc --noEmit` are both clean (strict TypeScript, no suppressed rules).

## Deployment notes

- Any Next.js host (Vercel, etc.) works; the ingestion pipeline runs inline inside the `/api/documents/:id/process` route handler during the request, so pick a host/runtime with a request timeout comfortably above your expected processing time (the route sets `maxDuration = 300`).
- Set the environment variables above in your host's dashboard. The service-role key must only ever be set as a server environment variable, never `NEXT_PUBLIC_*`.
- Run the Supabase migrations against your production project before first use.

## Known limitations (stated honestly)

- **No OCR.** Scanned/image-only PDFs are detected and rejected with an honest message; they are not processed.
- **Inline job runner.** Ingestion runs synchronously inside the API request that triggers it, not on a queue. This is a documented portfolio trade-off (see `lib/documents/job-runner.ts`) — `lib/documents/pipeline.ts` is already written as a pure function over injected dependencies, so hosting it on a queue worker instead is a rewiring, not a rewrite.
- **In-memory rate limiting** (`lib/api/rate-limit.ts`) is per-server-instance, adequate for a single-instance portfolio deployment but not for a multi-instance production fleet — swap in Redis/Upstash for that.
- **Demo Ask Bloom is intentionally not AI.** It's a real lexical/extractive search (TF + rarity weighting) over the seeded text, honestly labeled as such — it never calls a model, by design, so the demo needs no credentials.
- **Single embedding dimension.** The schema hardcodes `vector(1536)`; switching embedding models to a different output size requires a migration change, noted above.

## Security decisions

- Every table has Row Level Security; policies are `user_id = auth.uid()` on read and `WITH CHECK` on write, so a client can never spoof another user's `user_id` even if it tried.
- The `match_document_chunks` RPC filters by `auth.uid()` inside the SQL function itself (`security invoker`), not just via caller-supplied filters — it cannot be used to search another user's chunks regardless of what the client passes.
- The service-role key (`lib/supabase/admin.ts`) is `server-only`-guarded and used exclusively by the ingestion pipeline and storage cleanup, always after an RLS-scoped ownership check.
- Uploads are validated server-side: extension, declared MIME type, byte size, and the literal `%PDF-` file header; filenames are sanitized against path traversal before being used in a storage key.
- Document text is treated as untrusted input: the AI system prompts (`lib/ai/prompts.ts`) explicitly instruct the model that instructions embedded in uploaded documents are content, not commands.
- PDF downloads use short-lived signed URLs (5 minutes), never public bucket access.
- API routes return a consistent typed error envelope and never leak internal error messages to the client.

## RAG pipeline explanation

1. **Extract** — LangChain's `PDFLoader` extracts text page-by-page (`lib/documents/pdf.ts`), preserving original page numbers and detecting scanned/no-text PDFs honestly.
2. **Chunk** — `RecursiveCharacterTextSplitter` (`lib/documents/chunking.ts`) splits into ~700–1000 token chunks with ~125 token overlap, mapping each chunk back to the page range its characters came from.
3. **Embed** — chunks are embedded in batches of 32 with retry/backoff (`lib/documents/job-runner.ts`) and stored in `document_chunks.embedding` (pgvector).
4. **Generate cards** — the chat model is called with structured-output validation against a Zod schema (`lib/ai/schemas.ts`); cards must cite in-range source-chunk indexes, near-duplicates are removed by token-Jaccard similarity, and the stored excerpt is derived from the actual chunk text — never from the model's own words.
5. **Ask Bloom** — the question is embedded, `match_document_chunks` retrieves the top ~8 owned chunks above a similarity threshold, a lightweight rerank caps any one document at 3 chunks for diversity, and the model answers strictly from that context — with `insufficient_evidence: true` returned honestly when the retrieved chunks don't support an answer.

Full detail (including the exact prompts and the untrusted-content guardrail) is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Feed ranking explanation

Every candidate card scores in `[0, 1]`:

```
score = 0.30 · topicRelevance   (explicit onboarding weight + learned interest)
      + 0.22 · reviewUrgency    (mastery gap × how overdue the spaced review is)
      + 0.18 · novelty          (unseen cards first, then 1/(1+timesSeen))
      + 0.12 · engagement       (recent saves/opens/dwell for the topic)
      + 0.10 · difficultyFit    (distance from the user's preferred difficulty)
      + 0.08 · exploration      (deterministic hash of user+day+cardId)
```

A diversity pass then orders candidates so that a third consecutive card from the same topic or document is only allowed when literally no alternative remains in the candidate pool — implemented as a hard filter rather than a score penalty, since a fixed penalty can always be outweighed by a strong enough preference gap (see the comment in `lib/feed/ranking.ts` for the reasoning and the edge case that motivated it). "Got it" raises mastery and schedules a farther-out review on an expanding ladder (4h → 30d); "Review again" cuts mastery and schedules a 10-minute near-term review; rapid skips (<1.5s dwell) suppress a topic for 30 minutes without permanently hiding it. The full formula, mastery/scheduling rules, and diversity logic are unit-tested in `tests/unit/ranking.test.ts` and `tests/unit/mastery.test.ts`.
