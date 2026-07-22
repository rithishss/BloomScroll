import { describe, expect, it } from "vitest";
import { DEMO_DOCS } from "@/lib/demo/content";
import {
  buildDemoCards,
  buildDemoChunks,
  buildDemoDocuments,
  buildInitialCardStates,
} from "@/lib/demo/seed";

describe("demo seed integrity", () => {
  it("generates between 18 and 24 cards as required for a believable demo", () => {
    const cards = buildDemoCards();
    expect(cards.length).toBeGreaterThanOrEqual(18);
    expect(cards.length).toBeLessThanOrEqual(24);
  });

  it("every card's stored source excerpt is an exact substring of the real page text", () => {
    const cards = buildDemoCards();
    const pageTextByDoc = new Map(DEMO_DOCS.map((doc) => [doc.id, doc.pages.map((p) => p.body)]));
    for (const c of cards) {
      const pages = pageTextByDoc.get(c.documentId);
      expect(pages, `unknown document ${c.documentId}`).toBeDefined();
      const foundOnAnyPage = pages!.some((body) => body.includes(c.sourceExcerpt));
      expect(foundOnAnyPage, `excerpt for "${c.title}" is not real source text`).toBe(true);
    }
  });

  it("every card cites a chunk id that actually exists in the seeded chunk list", () => {
    const cards = buildDemoCards();
    const chunkIds = new Set(buildDemoChunks().map((c) => c.id));
    for (const c of cards) {
      for (const chunkId of c.sourceChunkIds) {
        expect(chunkIds.has(chunkId), `missing chunk ${chunkId} for card ${c.id}`).toBe(true);
      }
    }
  });

  it("every card has a page range within its document's real page count", () => {
    const cards = buildDemoCards();
    const pageCounts = new Map(DEMO_DOCS.map((d) => [d.id, d.pages.length]));
    for (const c of cards) {
      const max = pageCounts.get(c.documentId)!;
      expect(c.pageStart).toBeGreaterThanOrEqual(1);
      expect(c.pageEnd).toBeLessThanOrEqual(max);
      expect(c.pageStart).toBeLessThanOrEqual(c.pageEnd);
    }
  });

  it("covers both seeded documents", () => {
    const cards = buildDemoCards();
    const docIds = new Set(cards.map((c) => c.documentId));
    expect(docIds.size).toBe(2);
  });

  it("varies card types rather than repeating a single type", () => {
    const cards = buildDemoCards();
    const types = new Set(cards.map((c) => c.cardType));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
});

describe("buildDemoDocuments", () => {
  it("reports a card count matching the seeded cards per document", () => {
    const docs = buildDemoDocuments();
    const cards = buildDemoCards();
    for (const doc of docs) {
      const expected = cards.filter((c) => c.documentId === doc.id).length;
      expect(doc.cardCount).toBe(expected);
    }
  });

  it("marks every seeded document as ready with full progress", () => {
    for (const doc of buildDemoDocuments()) {
      expect(doc.status).toBe("ready");
      expect(doc.processingProgress).toBe(100);
    }
  });
});

describe("buildInitialCardStates", () => {
  it("only pre-seeds states for cards that actually exist", () => {
    const cardIds = new Set(buildDemoCards().map((c) => c.id));
    const states = buildInitialCardStates();
    for (const cardId of Object.keys(states)) {
      expect(cardIds.has(cardId)).toBe(true);
    }
  });

  it("keeps every mastery score within [0, 1]", () => {
    const states = buildInitialCardStates();
    for (const state of Object.values(states)) {
      expect(state.masteryScore).toBeGreaterThanOrEqual(0);
      expect(state.masteryScore).toBeLessThanOrEqual(1);
    }
  });
});
