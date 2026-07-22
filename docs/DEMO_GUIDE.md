# Demo Guide

## 90-second recruiter demo flow

1. **Land on `/`.** Point out the headline and the two CTAs — "Upload your first PDF" (real mode) and "Try the interactive demo" (no signup, no keys). Scroll to the "Grounded by design" section to show a real source excerpt turning into a card.
2. **Click "Try the interactive demo."** You land on `/demo/feed` with a "Demo workspace" badge visible in the sidebar/topbar — never hidden, always honest about what you're looking at.
3. **Swipe or click through 2–3 cards.** Show:
   - Dragging the card left/right (or clicking "Review again" / "Got it").
   - The "Why this card?" info button — a real, inspectable ranking reason, not a canned string.
   - Saving a card with the bookmark button or the `S` key.
4. **Click "View source" on any card.** This is the credibility moment: the drawer shows the *exact stored excerpt*, the full passage as stored, the document title, page number, and a working "Open PDF at page N" link into a real (repository-owned, generated) PDF.
5. **Go to `/demo/saved`.** The card you just saved is there, with filters by document/type/difficulty.
6. **Go to `/demo/ask`.** Ask: *"Why does SJF minimize average waiting time?"* — get a cited answer with clickable source chips referencing real pages. Then ask something off-topic (e.g., *"What's the capital of France?"*) to show the honest "insufficient evidence" behavior — it does not hallucinate an answer.
7. **Resize to mobile width (or open on your phone).** Same feed, same source drawer, bottom tab navigation — one codebase, no separate mobile build.

Total: under two minutes, zero setup.

## Deeper technical walkthrough

For an engineering audience, layer in:

- **One `DataProvider` interface, two implementations.** Open `lib/data/provider.ts`, then `lib/demo/provider.ts` (localStorage) and `lib/data/real-provider.ts` (fetch wrapper over `/api/*`). Every screen component in `components/screens/` is written once and works in both modes — that's what makes the demo a faithful preview of real mode, not a separate mock UI.
- **The ranking formula is real and testable.** Open `lib/feed/ranking.ts` — six weighted components, a documented formula, and a diversity pass that's a hard constraint (not a soft penalty) once you understand why: `tests/unit/ranking.test.ts` has a test that specifically exercises the case where a soft penalty would fail.
- **The ingestion pipeline is pure orchestration.** Open `lib/documents/pipeline.ts` — no Supabase or LangChain imports, just an interface (`PipelineDeps`) it's called with. `lib/documents/job-runner.ts` wires in the real implementations; `tests/integration/pipeline.test.ts` wires in fakes to test retry/idempotency/double-processing without a live database.
- **RLS is tested, not just declared.** Open `tests/integration/ownership.test.ts` — a fake Supabase client (`tests/integration/fakes/fake-supabase.ts`) that actually simulates row-level security (any row with a `user_id` column is invisible unless it matches the session), used to prove `recordCardEvent`, `listUserDocuments`, `getDocumentDetail`, `deleteDocumentCompletely`, and `buildFeedPage` never leak or mutate another user's data — against the real service code, not a description of the SQL.
- **The demo's source excerpts are provably real.** `tests/unit/demo-seed.test.ts` asserts every seeded card's `sourceExcerpt` is an exact substring of the underlying page text in `lib/demo/content.ts` — the seed data can't drift into inventing quotes.
- Switch on real mode with a Supabase project + OpenAI key (see the README) and upload an actual PDF to show the live processing timeline (extracting → chunking → generating cards → ready) and a freshly generated card set.

## Five likely interview questions

**1. "Why not just use cosine similarity + a fixed threshold for ranking diversity instead of a hard filter?"**
A fixed score penalty is a soft preference — it can always be outweighed by a large enough gap in another scoring component. I found this empirically while testing: with an extreme topic-preference gap (explicit weight 1.0 vs 0.0), a fixed penalty of 0.15 wasn't enough to prevent three consecutive same-topic cards, because the raw score gap between the two topics exceeded the penalty. The spec's wording — "avoid repetition when alternatives exist" — is actually a hard constraint, so I implemented it as one: a candidate that would create a third consecutive same-topic/document card is only eligible when nothing else in the remaining pool avoids it. That's `lib/feed/ranking.ts`, and the reasoning is in the file comment plus the test that caught the original bug.

**2. "How do you keep the demo and real mode from drifting apart?"**
They share one `DataProvider` interface and one domain type vocabulary (`lib/types.ts`). Screen components never know which mode they're in. The ranking and mastery modules (`lib/feed/ranking.ts`, `lib/feed/mastery.ts`) are imported by both `DemoProvider` and the real `buildFeedPage`/`recordCardEvent` — not reimplemented twice. If they drifted, a single ranking unit test would catch it because both providers call the exact same function.

**3. "What happens if the LLM returns malformed JSON or hallucinates a citation?"**
Structured output is validated against a Zod schema (`lib/ai/schemas.ts`) before anything is trusted. For card generation, `validateChunkIndexes` rejects any card citing a chunk index outside the range actually provided in the prompt; the stored excerpt is derived from the real chunk text, never copied from the model's output, so even if the model "quoted" something wrong, what's persisted is always genuine source text. For Ask Bloom, if the model's cited indexes don't parse, the code falls back to citing the top retrieved chunks rather than showing an uncited claim. Generation retries up to 3 times with backoff before the document is marked `failed` with a message the user can act on.

**4. "Why is the ingestion pipeline inline instead of a queue?"**
It's a documented trade-off for a portfolio deployment: no separate worker infrastructure to run. But `lib/documents/pipeline.ts`'s `processDocument` takes its dependencies as an injected interface (`PipelineDeps`) and does no I/O of its own — it's already shaped for a queue worker to call. Moving to SQS/BullMQ/etc. would mean writing a worker entry point that constructs `PipelineDeps` and calls `processDocument`, not rewriting the pipeline logic. The double-processing guard (an atomic status-transition claim) and idempotent retry (clearing prior partial chunks/cards) were both built with a queue's at-least-once delivery semantics in mind, even though the current runner is synchronous.

**5. "How do you know RLS actually works, versus just trusting the SQL policies?"**
Two ways. First, integration tests (`tests/integration/ownership.test.ts`) run the actual service functions against a fake Supabase client that enforces the same row-visibility rule RLS would (`tests/integration/fakes/fake-supabase.ts`) — proving the application code never depends on client-side filtering for security, since even ownership *lookup* queries (like the card check in `recordCardEvent`) rely on rows simply not existing for another user. Second, the `match_document_chunks` RPC filters by `auth.uid()` *inside the SQL function itself*, not just via a parameter the caller could omit — so even a route handler bug that forgot to check ownership couldn't leak cross-user chunk data through that specific path.
