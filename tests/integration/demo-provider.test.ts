import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider } from "@/lib/demo/provider";
import { MemoryKV } from "@/lib/demo/storage";

function provider() {
  return new DemoProvider(new MemoryKV());
}

describe("DemoProvider — card interaction updates", () => {
  it("marking a card understood raises its mastery and schedules a review", async () => {
    const p = provider();
    const feed = await p.getFeed({ limit: 50 });
    const target = feed.items[0];
    const state = await p.recordEvent({ cardId: target.card.id, eventType: "understood" });
    expect(state).not.toBeNull();
    expect(state!.masteryScore).toBeGreaterThan(0);
    expect(state!.nextReviewAt).not.toBeNull();
  });

  it("review_again lowers mastery relative to understood", async () => {
    const p = provider();
    const feed = await p.getFeed({ limit: 50 });
    const target = feed.items.find((i) => i.card.id !== "card-os-sjf")!.card.id;

    const understood = await p.recordEvent({ cardId: target, eventType: "understood" });
    const reviewed = await p.recordEvent({ cardId: target, eventType: "review_again" });
    expect(reviewed!.masteryScore).toBeLessThan(understood!.masteryScore);
  });

  it("deduplicates rapid-fire impressions for the same card", async () => {
    const p = provider();
    const feed = await p.getFeed({ limit: 50 });
    const cardId = feed.items[0].card.id;
    const first = await p.recordEvent({ cardId, eventType: "impression" });
    const second = await p.recordEvent({ cardId, eventType: "impression" });
    expect(first?.timesSeen).toBe(second?.timesSeen);
  });

  it("returns null for an event on a card id that doesn't exist", async () => {
    const p = provider();
    const state = await p.recordEvent({ cardId: "not-a-real-card", eventType: "understood" });
    expect(state).toBeNull();
  });
});

describe("DemoProvider — saved cards", () => {
  it("saving a card makes it appear in listSavedCards", async () => {
    const p = provider();
    const feed = await p.getFeed({ limit: 50 });
    const target = feed.items.find((i) => !i.state?.saved)!.card.id;

    await p.recordEvent({ cardId: target, eventType: "save" });
    const saved = await p.listSavedCards();
    expect(saved.some((i) => i.card.id === target)).toBe(true);
  });

  it("unsaving removes it from listSavedCards", async () => {
    const p = provider();
    const feed = await p.getFeed({ limit: 50 });
    const target = feed.items[0].card.id;

    await p.recordEvent({ cardId: target, eventType: "save" });
    await p.recordEvent({ cardId: target, eventType: "unsave" });
    const saved = await p.listSavedCards();
    expect(saved.some((i) => i.card.id === target)).toBe(false);
  });

  it("starts with the seeded saved cards from initial demo state", async () => {
    const p = provider();
    const saved = await p.listSavedCards();
    expect(saved.length).toBeGreaterThan(0);
  });
});

describe("DemoProvider — search", () => {
  it("finds cards whose title/topic/explanation match every query term", async () => {
    const p = provider();
    const results = await p.searchCards("SJF waiting");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((i) => /SJF|shortest/i.test(`${i.card.title} ${i.card.explanation}`)),
    ).toBe(true);
  });

  it("returns nothing for a nonsense query", async () => {
    const p = provider();
    const results = await p.searchCards("zzzz_no_such_term_qqqq");
    expect(results).toEqual([]);
  });
});

describe("DemoProvider — Ask Bloom", () => {
  it("answers a well-covered question with citations, grounded in real source text", async () => {
    const p = provider();
    const docs = await p.listDocuments();
    const result = await p.ask({
      question: "Why does SJF minimize average waiting time?",
      documentIds: docs.map((d) => d.id),
    });
    expect(result.insufficientEvidence).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it("honestly reports insufficient evidence for an out-of-scope question", async () => {
    const p = provider();
    const docs = await p.listDocuments();
    const result = await p.ask({
      question: "What is the capital of France?",
      documentIds: docs.map((d) => d.id),
    });
    expect(result.insufficientEvidence).toBe(true);
    expect(result.citations).toEqual([]);
  });

  it("persists the thread so getThreadMessages returns the exchange", async () => {
    const p = provider();
    const docs = await p.listDocuments();
    const result = await p.ask({
      question: "What is a race condition?",
      documentIds: docs.map((d) => d.id),
    });
    const messages = await p.getThreadMessages(result.threadId);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("rejects a too-short question", async () => {
    const p = provider();
    const docs = await p.listDocuments();
    await expect(p.ask({ question: "hi", documentIds: docs.map((d) => d.id) })).rejects.toThrow();
  });
});

describe("DemoProvider — upload validation", () => {
  it("rejects a non-PDF file", async () => {
    const p = provider();
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(p.uploadDocument(file)).rejects.toThrow();
  });

  it("accepts a well-formed PDF and creates a queued document", async () => {
    const p = provider();
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    const file = new File([pdfBytes], "my-notes.pdf", { type: "application/pdf" });
    const doc = await p.uploadDocument(file);
    expect(doc.status).toBe("queued");
    const docs = await p.listDocuments();
    expect(docs.some((d) => d.id === doc.id)).toBe(true);
  });
});

describe("DemoProvider — simulated processing pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances a queued upload through to ready without calling any real API", async () => {
    const p = provider();
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([pdfBytes], "notes.pdf", { type: "application/pdf" });
    const doc = await p.uploadDocument(file);

    await vi.advanceTimersByTimeAsync(10_000);

    const detail = await p.getDocument(doc.id);
    expect(detail.status).toBe("ready");
    expect(detail.processingProgress).toBe(100);
  });
});

describe("DemoProvider — document deletion", () => {
  it("hides a seeded document after deletion without mutating other users' concerns", async () => {
    const p = provider();
    const before = await p.listDocuments();
    const target = before[0];
    await p.deleteDocument(target.id);
    const after = await p.listDocuments();
    expect(after.some((d) => d.id === target.id)).toBe(false);
  });
});
