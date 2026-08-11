import { describe, expect, it } from "vitest";
import { DEMO_DOCS } from "@/lib/demo/content";
import { buildDemoQuizzes } from "@/lib/demo/quiz-seed";
import { buildDemoChunks } from "@/lib/demo/seed";
import { hasDistinctOptions } from "@/lib/ai/schemas";

const quizzes = buildDemoQuizzes();
const allQuestions = Object.values(quizzes).flat();

describe("demo quiz seed integrity", () => {
  it("covers both seeded documents", () => {
    expect(Object.keys(quizzes).sort()).toEqual(DEMO_DOCS.map((d) => d.id).sort());
  });

  it("gives each document 5–10 questions, as specified", () => {
    for (const [documentId, questions] of Object.entries(quizzes)) {
      expect(questions.length, `${documentId} question count`).toBeGreaterThanOrEqual(5);
      expect(questions.length, `${documentId} question count`).toBeLessThanOrEqual(10);
    }
  });

  it("gives every question exactly four options", () => {
    for (const question of allQuestions) {
      expect(question.options, question.id).toHaveLength(4);
    }
  });

  it("has no duplicate options within a question", () => {
    for (const question of allQuestions) {
      expect(hasDistinctOptions(question), question.id).toBe(true);
    }
  });

  it("points correctIndex at a real option", () => {
    for (const question of allQuestions) {
      expect(question.correctIndex, question.id).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex, question.id).toBeLessThan(question.options.length);
    }
  });

  it("does not always put the correct answer in the same position", () => {
    const positions = new Set(allQuestions.map((q) => q.correctIndex));
    expect(positions.size).toBeGreaterThan(1);
  });

  it("uses globally unique question ids", () => {
    const ids = allQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites a chunk id that actually exists", () => {
    const chunkIds = new Set(buildDemoChunks().map((c) => c.id));
    for (const question of allQuestions) {
      expect(question.sourceChunkId, question.id).not.toBeNull();
      expect(chunkIds.has(question.sourceChunkId!), question.id).toBe(true);
    }
  });

  it("carries a source excerpt that is exact text from the real page", () => {
    const pagesByDoc = new Map(DEMO_DOCS.map((doc) => [doc.id, doc.pages]));
    for (const question of allQuestions) {
      const pages = pagesByDoc.get(question.documentId);
      expect(pages, question.documentId).toBeDefined();
      const page = pages!.find((p) => p.pageNumber === question.pageStart);
      expect(page, `${question.id} page ${question.pageStart}`).toBeDefined();
      expect(page!.body.includes(question.sourceExcerpt), `${question.id} excerpt is real`).toBe(
        true,
      );
    }
  });

  it("keeps page ranges inside the document", () => {
    const pageCounts = new Map(DEMO_DOCS.map((d) => [d.id, d.pages.length]));
    for (const question of allQuestions) {
      expect(question.pageStart).toBeGreaterThanOrEqual(1);
      expect(question.pageEnd).toBeLessThanOrEqual(pageCounts.get(question.documentId)!);
      expect(question.pageStart).toBeLessThanOrEqual(question.pageEnd);
    }
  });
});
