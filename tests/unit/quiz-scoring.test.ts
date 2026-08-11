import { describe, expect, it } from "vitest";
import {
  isCorrect,
  missedQuestions,
  scoreHeadline,
  scoreQuiz,
  type QuizAnswers,
} from "@/lib/quiz/scoring";
import type { QuizQuestion } from "@/lib/types";

function q(id: string, topic: string, correctIndex = 0): QuizQuestion {
  return {
    id,
    documentId: "doc-1",
    topic,
    question: `Question ${id}?`,
    options: ["A", "B", "C", "D"],
    correctIndex,
    rationale: "Because.",
    sourceChunkId: "chunk-1",
    sourceExcerpt: "Excerpt.",
    pageStart: 1,
    pageEnd: 1,
  };
}

const QUESTIONS = [q("a", "Scheduling", 0), q("b", "Scheduling", 1), q("c", "Memory", 2)];

describe("isCorrect", () => {
  it("is false for an unanswered question", () => {
    expect(isCorrect(q("a", "T", 0), undefined)).toBe(false);
  });

  it("matches only the correct index", () => {
    const question = q("a", "T", 2);
    expect(isCorrect(question, 2)).toBe(true);
    expect(isCorrect(question, 0)).toBe(false);
  });

  it("does not treat index 0 as falsy", () => {
    expect(isCorrect(q("a", "T", 0), 0)).toBe(true);
  });
});

describe("scoreQuiz", () => {
  it("scores a perfect run", () => {
    const answers: QuizAnswers = { a: 0, b: 1, c: 2 };
    const result = scoreQuiz(QUESTIONS, answers);
    expect(result).toMatchObject({ total: 3, answered: 3, correct: 3, score: 1 });
    expect(result.missedIds).toEqual([]);
    expect(result.missedTopics).toEqual([]);
  });

  it("scores a mixed run and lists missed ids", () => {
    const result = scoreQuiz(QUESTIONS, { a: 0, b: 0, c: 0 });
    expect(result.correct).toBe(1);
    expect(result.correctIds).toEqual(["a"]);
    expect(result.missedIds).toEqual(["b", "c"]);
    expect(result.score).toBeCloseTo(1 / 3, 5);
  });

  it("counts unanswered questions as wrong but not as answered", () => {
    const result = scoreQuiz(QUESTIONS, { a: 0 });
    expect(result.answered).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.missedIds).toEqual(["b", "c"]);
    expect(result.score).toBeCloseTo(1 / 3, 5);
  });

  it("orders missed topics by miss count, most-missed first", () => {
    // Two Scheduling misses, one Memory miss.
    const result = scoreQuiz(QUESTIONS, {});
    expect(result.missedTopics).toEqual(["Scheduling", "Memory"]);
  });

  it("does not repeat a topic in missedTopics", () => {
    const result = scoreQuiz(QUESTIONS, {});
    expect(new Set(result.missedTopics).size).toBe(result.missedTopics.length);
  });

  it("handles an empty quiz without dividing by zero", () => {
    const result = scoreQuiz([], {});
    expect(result).toMatchObject({ total: 0, correct: 0, score: 0 });
  });
});

describe("missedQuestions", () => {
  it("returns only missed questions, in original order", () => {
    const result = scoreQuiz(QUESTIONS, { a: 0, b: 0, c: 0 });
    expect(missedQuestions(QUESTIONS, result).map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("returns nothing after a perfect run", () => {
    const result = scoreQuiz(QUESTIONS, { a: 0, b: 1, c: 2 });
    expect(missedQuestions(QUESTIONS, result)).toEqual([]);
  });
});

describe("scoreHeadline", () => {
  it("celebrates only a genuine perfect score", () => {
    expect(scoreHeadline(scoreQuiz(QUESTIONS, { a: 0, b: 1, c: 2 }))).toMatch(/perfect/i);
    expect(scoreHeadline(scoreQuiz(QUESTIONS, { a: 0, b: 1, c: 0 }))).not.toMatch(/perfect/i);
  });

  it("stays honest about a poor score", () => {
    expect(scoreHeadline(scoreQuiz(QUESTIONS, {}))).toMatch(/another look/i);
  });
});
