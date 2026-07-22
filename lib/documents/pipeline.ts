import type { PageText } from "@/lib/documents/normalize";
import { chunkPages, type ChunkWithPages } from "@/lib/documents/chunking";
import type { GeneratedCardWithSource, GenerationChunk } from "@/lib/ai/generate-cards";

/**
 * The ingestion pipeline as a pure orchestration over injected dependencies.
 * The job runner (lib/documents/job-runner.ts) wires in Supabase, LangChain
 * PDF extraction, embeddings, and generation; integration tests wire in
 * fakes. Swapping the inline runner for a queue worker means re-hosting this
 * function, not rewriting it.
 *
 * Lifecycle (with progress milestones):
 *   claim (guards double-processing) → cleanup partial rows (retry safety)
 *   → extract (10%) → chunk (35%) → embed in batches (40→70%)
 *   → generate + validate + dedupe cards (75→95%) → ready (100%)
 */

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
  insertCards(documentId: string, cards: GeneratedCardWithSource[]): Promise<void>;
}

export interface PipelineDeps {
  db: PipelineDb;
  downloadPdf(documentId: string): Promise<Blob>;
  extractPages(data: Blob): Promise<{ pages: PageText[]; pageCount: number }>;
  /** Batched with retries by the implementation. */
  embedTexts(texts: string[]): Promise<number[][]>;
  generateCards(chunks: GenerationChunk[]): Promise<GeneratedCardWithSource[]>;
}

export class PipelineUserError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "PipelineUserError";
  }
}

export type PipelineResult =
  | { status: "ready"; chunkCount: number; cardCount: number }
  | { status: "already_processing" }
  | { status: "failed"; message: string };

export async function processDocument(
  documentId: string,
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
      processingProgress: 25,
      pageCount,
    });

    const chunks = await chunkPages(pages);
    if (chunks.length === 0) {
      throw new PipelineUserError("No usable text was found in this PDF.");
    }
    await db.updateDocument(documentId, { status: "embedding", processingProgress: 40 });

    // Embed in bounded batches; progress advances per batch.
    const BATCH_SIZE = 32;
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const vectors = await deps.embedTexts(batch.map((c) => c.content));
      embeddings.push(...vectors);
      const progress = 40 + Math.round(((i + batch.length) / chunks.length) * 30);
      await db.updateDocument(documentId, { processingProgress: Math.min(70, progress) });
    }

    const inserted = await db.insertChunks(
      documentId,
      chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] ?? null })),
    );
    await db.updateDocument(documentId, { status: "generating", processingProgress: 75 });

    // Map inserted chunk ids back onto generation inputs by chunk index.
    const idByIndex = new Map(inserted.map((row) => [row.chunkIndex, row.id]));
    const generationChunks: GenerationChunk[] = chunks.map((chunk) => ({
      id: idByIndex.get(chunk.chunkIndex) ?? "",
      content: chunk.content,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
    }));

    const cards = await deps.generateCards(generationChunks);
    if (cards.length === 0) {
      throw new PipelineUserError(
        "Card generation produced no valid cards for this document. Try reprocessing.",
      );
    }
    await db.updateDocument(documentId, { processingProgress: 95 });
    await db.insertCards(documentId, cards);

    await db.updateDocument(documentId, { status: "ready", processingProgress: 100 });
    return { status: "ready", chunkCount: chunks.length, cardCount: cards.length };
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
