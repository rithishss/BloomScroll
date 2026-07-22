import { describe, expect, it } from "vitest";
import { buildDemoAnswer, scoreChunks, tokenize } from "@/lib/demo/retrieval";
import { buildDemoChunks } from "@/lib/demo/seed";

const chunks = buildDemoChunks();

describe("tokenize", () => {
  it("lowercases and strips stopwords", () => {
    expect(tokenize("What is the Nyquist rate?")).toEqual(["nyquist", "rate"]);
  });

  it("drops single-character tokens", () => {
    expect(tokenize("a b cd")).toEqual(["cd"]);
  });
});

describe("scoreChunks", () => {
  it("ranks the chunk that actually discusses the question topic highest", () => {
    const scored = scoreChunks("What is the Nyquist rate for sampling?", chunks);
    expect(scored.length).toBeGreaterThan(0);
    expect(scored[0].chunk.content).toContain("Nyquist");
  });

  it("returns no results for a query with no meaningful terms", () => {
    expect(scoreChunks("the a of", chunks)).toEqual([]);
  });
});

describe("buildDemoAnswer — grounded answers", () => {
  it("answers a well-covered question with citations", () => {
    const result = buildDemoAnswer("Why does SJF minimize average waiting time?", chunks);
    expect(result.insufficientEvidence).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.answer).toContain("SJF");
  });

  it("every citation excerpt is real text from the cited chunk", () => {
    const result = buildDemoAnswer("What is the Nyquist rate?", chunks);
    for (const citation of result.citations) {
      const chunk = chunks.find((c) => c.id === citation.chunkId);
      expect(chunk).toBeDefined();
      expect(chunk!.content).toContain(citation.excerpt);
    }
  });

  it("cites page numbers that belong to the source document", () => {
    const result = buildDemoAnswer("What is a race condition?", chunks);
    for (const citation of result.citations) {
      const chunk = chunks.find((c) => c.id === citation.chunkId)!;
      expect(citation.pageStart).toBe(chunk.pageStart);
      expect(citation.documentId).toBe(chunk.documentId);
    }
  });
});

describe("buildDemoAnswer — insufficient evidence", () => {
  it("honestly declines when the question is unrelated to any seeded document", () => {
    const result = buildDemoAnswer(
      "What is the boiling point of mercury on Jupiter's moon Europa?",
      chunks,
    );
    expect(result.insufficientEvidence).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.answer.toLowerCase()).toContain("don't contain enough information");
  });

  it("declines rather than fabricating an answer for a very short, vague question", () => {
    const result = buildDemoAnswer("hmm okay so", chunks);
    expect(result.insufficientEvidence).toBe(true);
  });
});
