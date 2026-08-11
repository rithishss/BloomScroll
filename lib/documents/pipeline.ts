import type { PageText } from "@/lib/documents/normalize";
import { chunkPages, type ChunkWithPages } from "@/lib/documents/chunking";
import type {
  GeneratedCardWithSource,
  GeneratedContent,
  GeneratedQuizQuestionWithSource,
  GenerationChunk,
} from "@/lib/ai/generate-cards";

/**
 * The ingestion pipeline as a pure orchestration over injected dependencies.
 * The job runner (lib/documents/job-runner.ts) wires in Supabase, LangChain
 * PDF extraction, embeddings, script generation, and video rendering;
 * integration tests wire in fakes. Swapping the inline runner for a queue
 * worker means re-hosting this function, not rewriting it.
 *
 * Lifecycle (with progress milestones):
 *   claim (guards double-processing) → cleanup partial rows (retry safety)
 *   → extract (10%) → chunk (25%) → embed in batches (40→70%)
 *   → write card scripts (75→80%) → render a narrated reel per card,
 *   still image + TTS + ffmpeg (80→98%) → ready (100%)
 */

export interface RenderedVideo {
  mp4: Buffer;
  durationSeconds: number;
  narrationScript: string;
}

export interface PipelineDb {
  /** Atomically claims the document for processing. Returns false when the
   * document is already being processed (double-processing guard). */
  claimDocument(documentId: string): Promise<boolean>;
  updateDocument(
    documentId: string,
    patch: {
      status?: string;
      processingProgress?: number;
      errorMessage?: string | null;
      pageCount?: number;
    },
  ): Promise<void>;
  /** Removes chunks + cards from any previous partial run (idempotent retry). */
  deleteDerivedData(documentId: string): Promise<void>;
  insertChunks(
    documentId: string,
    chunks: (ChunkWithPages & { embedding: number[] | null })[],
  ): Promise<{ id: string; chunkIndex: number }[]>;
  /** Returns the inserted rows' ids in the same order as the input cards. */
  insertCards(documentId: string, cards: GeneratedCardWithSource[]): Promise<{ id: string }[]>;
  insertQuizQuestions(
    documentId: string,
    questions: GeneratedQuizQuestionWithSource[],
  ): Promise<void>;
  /** Uploads the rendered mp4 to storage and records its path/duration/script on the card. */
  saveCardVideo(cardId: string, video: RenderedVideo): Promise<void>;
}

export interface PipelineDeps {
  db: PipelineDb;
  downloadPdf(documentId: string): Promise<Blob>;
  extractPages(data: Blob): Promise<{ pages: PageText[]; pageCount: number }>;
  /** Batched with retries by the implementation. */
  embedTexts(texts: string[]): Promise<number[][]>;
  /** Produces the document's cards and its quiz in a single pass. */
  generateContent(chunks: GenerationChunk[]): Promise<GeneratedContent>;
  /** Renders one narrated reel (slide + TTS + ffmpeg compose) for a card. */
  renderVideo(card: GeneratedCardWithSource, documentTitle: string): Promise<RenderedVideo>;
}

export class PipelineUserError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "PipelineUserError";
  }
}

export type PipelineResult =
  | { status: "ready"; chunkCount: number; cardCount: number; quizCount: number }
  | { status: "already_processing" }
  | { status: "failed"; message: string };

export async function processDocument(
  documentId: string,
  documentTitle: string,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const { db } = deps;

  const claimed = await db.claimDocument(documentId);
  if (!claimed) {
    return { status: "already_processing" };
  }

  try {
    // A retry may leave partial chunks/cards behind — clear them first so
    // reprocessing is idempotent.
    await db.deleteDerivedData(documentId);
    await db.updateDocument(documentId, {
      status: "extracting",
      processingProgress: 5,
      errorMessage: null,
    });

    const pdf = await deps.downloadPdf(documentId);
    const { pages, pageCount } = await deps.extractPages(pdf);
    await db.updateDocument(documentId, {
      status: "chunking",
      processingProgress: 20,
      pageCount,
    });

    const chunks = await chunkPages(pages);
    if (chunks.length === 0) {
      throw new PipelineUserError("No usable text was found in this PDF.");
    }
    await db.updateDocument(documentId, { status: "embedding", processingProgress: 35 });

    // Embed in bounded batches; progress advances per batch.
    const BATCH_SIZE = 32;
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const vectors = await deps.embedTexts(batch.map((c) => c.content));
      embeddings.push(...vectors);
      const progress = 35 + Math.round(((i + batch.length) / chunks.length) * 25);
      await db.updateDocument(documentId, { processingProgress: Math.min(60, progress) });
    }

    const inserted = await db.insertChunks(
      documentId,
      chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] ?? null })),
    );
    await db.updateDocument(documentId, { status: "generating", processingProgress: 65 });

    // Map inserted chunk ids back onto generation inputs by chunk index.
    const idByIndex = new Map(inserted.map((row) => [row.chunkIndex, row.id]));
    const generationChunks: GenerationChunk[] = chunks.map((chunk) => ({
      id: idByIndex.get(chunk.chunkIndex) ?? "",
      content: chunk.content,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
    }));

    const { cards, quiz } = await deps.generateContent(generationChunks);
    if (cards.length === 0) {
      throw new PipelineUserError(
        "Generation produced no valid cards for this document. Try reprocessing.",
      );
    }
    await db.updateDocument(documentId, { status: "rendering", processingProgress: 78 });
    const insertedCards = await db.insertCards(documentId, cards);
    // A document with cards but no usable quiz is still a good document, so
    // an empty quiz is stored as-is rather than failing the run.
    await db.insertQuizQuestions(documentId, quiz);

    // Render one narrated reel per card. Sequential, not parallel: ffmpeg
    // and TTS are both CPU/rate-limit sensitive, and progress needs to
    // advance smoothly per card rather than jump at the end.
    for (let i = 0; i < cards.length; i++) {
      const cardRow = insertedCards[i];
      if (!cardRow) continue;
      const video = await deps.renderVideo(cards[i], documentTitle);
      await db.saveCardVideo(cardRow.id, video);
      const progress = 78 + Math.round(((i + 1) / cards.length) * 20);
      await db.updateDocument(documentId, { processingProgress: Math.min(98, progress) });
    }

    await db.updateDocument(documentId, { status: "ready", processingProgress: 100 });
    return {
      status: "ready",
      chunkCount: chunks.length,
      cardCount: cards.length,
      quizCount: quiz.length,
    };
  } catch (err) {
    const userMessage =
      err instanceof PipelineUserError
        ? err.userMessage
        : err instanceof Error && "userMessage" in err && typeof err.userMessage === "string"
          ? err.userMessage
          : "Processing failed unexpectedly. You can retry from the library.";
    await db
      .updateDocument(documentId, { status: "failed", errorMessage: userMessage })
      .catch(() => {
        /* status write is best-effort once we're already failing */
      });
    return { status: "failed", message: userMessage };
  }
}
