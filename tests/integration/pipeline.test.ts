import { describe, expect, it, vi } from "vitest";
import {
  processDocument,
  PipelineUserError,
  type PipelineDb,
  type PipelineDeps,
  type RenderedVideo,
} from "@/lib/documents/pipeline";
import type { GeneratedCardWithSource } from "@/lib/ai/generate-cards";

/**
 * Integration tests for the ingestion pipeline, using an in-memory fake for
 * the database seam (PipelineDb) and stubbed extraction/embedding/generation/
 * video-rendering dependencies. Exercises the same orchestration code the
 * real job runner uses (lib/documents/job-runner.ts wires the real
 * Supabase/LangChain/ffmpeg implementations behind this same interface).
 */

function fakeCard(overrides: Partial<GeneratedCardWithSource> = {}): GeneratedCardWithSource {
  return {
    card_type: "concept",
    topic: "Test Topic",
    title: "Test card",
    explanation: "A sufficiently long explanation of the concept for testing purposes here.",
    question: null,
    answer: null,
    takeaway: null,
    difficulty: "core",
    source_chunk_indexes: [0],
    sourceChunkIds: ["chunk-0"],
    sourceExcerpt: "Test excerpt.",
    pageStart: 1,
    pageEnd: 1,
    ...overrides,
  };
}

function fakeVideo(overrides: Partial<RenderedVideo> = {}): RenderedVideo {
  return {
    mp4: Buffer.from("fake-mp4-bytes"),
    durationSeconds: 12,
    narrationScript: "A sufficiently long explanation of the concept for testing purposes here.",
    ...overrides,
  };
}

class FakeDb implements PipelineDb {
  documents = new Map<
    string,
    { status: string; processingProgress: number; errorMessage: string | null; pageCount?: number }
  >();
  chunks = new Map<string, unknown[]>();
  cards = new Map<string, unknown[]>();
  videos = new Map<string, RenderedVideo>();
  claimAttempts: string[] = [];
  private nextCardId = 0;

  constructor(initialStatus: string = "queued") {
    this.documents.set("doc-1", {
      status: initialStatus,
      processingProgress: 0,
      errorMessage: null,
    });
  }

  async claimDocument(documentId: string) {
    this.claimAttempts.push(documentId);
    const doc = this.documents.get(documentId);
    if (!doc) return false;
    if (!["queued", "failed", "ready"].includes(doc.status)) return false;
    doc.status = "extracting";
    return true;
  }

  async updateDocument(documentId: string, patch: Parameters<PipelineDb["updateDocument"]>[1]) {
    const doc = this.documents.get(documentId);
    if (!doc) return;
    if (patch.status !== undefined) doc.status = patch.status;
    if (patch.processingProgress !== undefined) doc.processingProgress = patch.processingProgress;
    if (patch.errorMessage !== undefined) doc.errorMessage = patch.errorMessage;
    if (patch.pageCount !== undefined) doc.pageCount = patch.pageCount;
  }

  async deleteDerivedData(documentId: string) {
    this.chunks.delete(documentId);
    this.cards.delete(documentId);
  }

  async insertChunks(documentId: string, chunks: Parameters<PipelineDb["insertChunks"]>[1]) {
    this.chunks.set(documentId, chunks);
    return chunks.map((c) => ({ id: `chunk-${c.chunkIndex}`, chunkIndex: c.chunkIndex }));
  }

  async insertCards(documentId: string, cards: GeneratedCardWithSource[]) {
    this.cards.set(documentId, cards);
    return cards.map(() => ({ id: `card-${this.nextCardId++}` }));
  }

  async saveCardVideo(cardId: string, video: RenderedVideo) {
    this.videos.set(cardId, video);
  }
}

function fakeDeps(db: FakeDb, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    db,
    downloadPdf: vi.fn(async () => new Blob(["fake pdf bytes"])),
    extractPages: vi.fn(async () => ({
      pages: [{ pageNumber: 1, text: "Some real extracted text about scheduling." }],
      pageCount: 1,
    })),
    embedTexts: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0.01))),
    generateCards: vi.fn(async () => [fakeCard()]),
    renderVideo: vi.fn(async () => fakeVideo()),
    ...overrides,
  };
}

const TITLE = "Test Document";

describe("processDocument — happy path", () => {
  it("processes a document end to end and marks it ready", async () => {
    const db = new FakeDb();
    const result = await processDocument("doc-1", TITLE, fakeDeps(db));
    expect(result).toMatchObject({ status: "ready", chunkCount: 1, cardCount: 1 });
    expect(db.documents.get("doc-1")).toMatchObject({ status: "ready", processingProgress: 100 });
  });

  it("renders and saves a video for every generated card", async () => {
    const db = new FakeDb();
    const deps = fakeDeps(db, {
      generateCards: vi.fn(async () => [fakeCard({ title: "A" }), fakeCard({ title: "B" })]),
    });
    await processDocument("doc-1", TITLE, deps);
    expect(db.videos.size).toBe(2);
    for (const video of db.videos.values()) {
      expect(video.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("advances progress through meaningful milestones, ending at 100", async () => {
    const db = new FakeDb();
    const progressSnapshots: number[] = [];
    const originalUpdate = db.updateDocument.bind(db);
    db.updateDocument = async (id, patch) => {
      if (patch.processingProgress !== undefined) progressSnapshots.push(patch.processingProgress);
      return originalUpdate(id, patch);
    };
    await processDocument("doc-1", TITLE, fakeDeps(db));
    for (let i = 1; i < progressSnapshots.length; i++) {
      expect(progressSnapshots[i]).toBeGreaterThanOrEqual(progressSnapshots[i - 1]);
    }
    expect(progressSnapshots.at(-1)).toBe(100);
  });

  it("passes the document title through to video rendering", async () => {
    const db = new FakeDb();
    const renderVideo = vi.fn(async () => fakeVideo());
    await processDocument("doc-1", TITLE, fakeDeps(db, { renderVideo }));
    expect(renderVideo).toHaveBeenCalledWith(expect.anything(), TITLE);
  });
});

describe("processDocument — double-processing guard", () => {
  it("refuses to process a document that's already mid-flight", async () => {
    const db = new FakeDb("extracting"); // simulate a run already in progress
    const result = await processDocument("doc-1", TITLE, fakeDeps(db));
    expect(result).toEqual({ status: "already_processing" });
  });

  it("allows reprocessing a previously failed document", async () => {
    const db = new FakeDb("failed");
    const result = await processDocument("doc-1", TITLE, fakeDeps(db));
    expect(result.status).toBe("ready");
  });

  it("allows reprocessing an already-ready document (manual reprocess)", async () => {
    const db = new FakeDb("ready");
    const result = await processDocument("doc-1", TITLE, fakeDeps(db));
    expect(result.status).toBe("ready");
  });
});

describe("processDocument — retry / idempotency", () => {
  it("clears prior chunks and cards before reprocessing", async () => {
    const db = new FakeDb("failed");
    db.chunks.set("doc-1", [{ stale: true }]);
    db.cards.set("doc-1", [{ stale: true }]);
    await processDocument("doc-1", TITLE, fakeDeps(db));
    // Stale data was cleared, then repopulated by this run — not appended to.
    expect(db.chunks.get("doc-1")).toHaveLength(1);
    expect(db.cards.get("doc-1")).toHaveLength(1);
  });

  it("is safe to run twice in a row and reach the same ready state", async () => {
    const db = new FakeDb();
    await processDocument("doc-1", TITLE, fakeDeps(db));
    db.documents.set("doc-1", { ...db.documents.get("doc-1")!, status: "ready" });
    const second = await processDocument("doc-1", TITLE, fakeDeps(db));
    expect(second.status).toBe("ready");
  });
});

describe("processDocument — failure handling", () => {
  it("records a user-friendly message and 'failed' status on extraction failure", async () => {
    const db = new FakeDb();
    const deps = fakeDeps(db, {
      extractPages: vi.fn(async () => {
        throw new PipelineUserError("This PDF looks scanned; no text could be extracted.");
      }),
    });
    const result = await processDocument("doc-1", TITLE, deps);
    expect(result).toEqual({
      status: "failed",
      message: "This PDF looks scanned; no text could be extracted.",
    });
    expect(db.documents.get("doc-1")).toMatchObject({
      status: "failed",
      errorMessage: "This PDF looks scanned; no text could be extracted.",
    });
  });

  it("falls back to a generic message for unexpected errors", async () => {
    const db = new FakeDb();
    const deps = fakeDeps(db, {
      embedTexts: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });
    const result = await processDocument("doc-1", TITLE, deps);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.message).toMatch(/retry/i);
    }
  });

  it("fails cleanly when card generation produces nothing", async () => {
    const db = new FakeDb();
    const deps = fakeDeps(db, { generateCards: vi.fn(async () => []) });
    const result = await processDocument("doc-1", TITLE, deps);
    expect(result.status).toBe("failed");
  });

  it("fails the document when video rendering keeps failing", async () => {
    // Retries live in job-runner.ts's renderVideoWithRetries, which wraps an
    // exhausted retry in a PipelineUserError — simulate that shape here.
    const db = new FakeDb();
    const deps = fakeDeps(db, {
      renderVideo: vi.fn(async () => {
        throw new PipelineUserError('Rendering "Test card" as a reel failed after 3 attempts.');
      }),
    });
    const result = await processDocument("doc-1", TITLE, deps);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.message).toMatch(/reel/i);
    }
  });
});
