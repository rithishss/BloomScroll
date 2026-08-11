import { describe, expect, it } from "vitest";
import {
  cardBatchSchema,
  generatedQuizQuestionSchema,
  hasDistinctOptions,
  cardSimilarity,
  dedupeCards,
  generatedCardSchema,
  validateChunkIndexes,
} from "@/lib/ai/schemas";

function validQuizQuestion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    topic: "CPU Scheduling",
    question: "Why does SJF minimize average waiting time?",
    options: ["Exchange argument", "Round robin", "Equal slices", "Arrival order"],
    correct_index: 0,
    rationale: "Swapping a shorter job earlier reduces total waiting time.",
    source_chunk_index: 0,
    ...overrides,
  };
}

function validCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    card_type: "concept",
    topic: "CPU Scheduling",
    title: "Round robin basics",
    explanation:
      "Round-robin scheduling gives each ready process a fixed time slice called a quantum, cycling through the queue so no process waits indefinitely. The quantum size trades off responsiveness against context-switch overhead.",
    question: null,
    answer: null,
    takeaway: null,
    difficulty: "core",
    source_chunk_indexes: [0],
    ...overrides,
  };
}

describe("generatedCardSchema", () => {
  it("accepts a well-formed card", () => {
    expect(generatedCardSchema.safeParse(validCard()).success).toBe(true);
  });

  it("rejects an explanation that is too short", () => {
    const result = generatedCardSchema.safeParse(validCard({ explanation: "Too short." }));
    expect(result.success).toBe(false);
  });

  it("rejects an explanation that is too long", () => {
    const long = "word ".repeat(200);
    const result = generatedCardSchema.safeParse(validCard({ explanation: long }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid card_type", () => {
    const result = generatedCardSchema.safeParse(validCard({ card_type: "summary" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid difficulty", () => {
    const result = generatedCardSchema.safeParse(validCard({ difficulty: "expert" }));
    expect(result.success).toBe(false);
  });

  it("requires at least one source chunk index", () => {
    const result = generatedCardSchema.safeParse(validCard({ source_chunk_indexes: [] }));
    expect(result.success).toBe(false);
  });
});

describe("cardBatchSchema", () => {
  it("accepts a batch of valid cards", () => {
    const result = cardBatchSchema.safeParse({
      cards: [validCard(), validCard({ title: "Other" })],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty batch", () => {
    expect(cardBatchSchema.safeParse({ cards: [] }).success).toBe(false);
  });

  it("accepts a batch with no quiz key and defaults it to an empty array", () => {
    const result = cardBatchSchema.safeParse({ cards: [validCard()] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quiz).toEqual([]);
  });

  it("accepts a batch carrying quiz questions", () => {
    const result = cardBatchSchema.safeParse({ cards: [validCard()], quiz: [validQuizQuestion()] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quiz).toHaveLength(1);
  });
});

describe("generatedQuizQuestionSchema", () => {
  it("accepts a well-formed question", () => {
    expect(generatedQuizQuestionSchema.safeParse(validQuizQuestion()).success).toBe(true);
  });

  it("requires exactly four options", () => {
    expect(
      generatedQuizQuestionSchema.safeParse(validQuizQuestion({ options: ["a", "b", "c"] })).success,
    ).toBe(false);
    expect(
      generatedQuizQuestionSchema.safeParse(validQuizQuestion({ options: ["a", "b", "c", "d", "e"] }))
        .success,
    ).toBe(false);
  });

  it("rejects a correct_index outside the option range", () => {
    expect(generatedQuizQuestionSchema.safeParse(validQuizQuestion({ correct_index: 4 })).success).toBe(
      false,
    );
    expect(
      generatedQuizQuestionSchema.safeParse(validQuizQuestion({ correct_index: -1 })).success,
    ).toBe(false);
  });

  it("rejects a negative source_chunk_index", () => {
    expect(
      generatedQuizQuestionSchema.safeParse(validQuizQuestion({ source_chunk_index: -1 })).success,
    ).toBe(false);
  });
});

describe("hasDistinctOptions", () => {
  it("accepts four genuinely different options", () => {
    expect(hasDistinctOptions({ options: ["a", "b", "c", "d"] })).toBe(true);
  });

  it("rejects duplicates, ignoring case and surrounding whitespace", () => {
    expect(hasDistinctOptions({ options: ["a", "A", "c", "d"] })).toBe(false);
    expect(hasDistinctOptions({ options: ["a", " a ", "c", "d"] })).toBe(false);
  });
});

describe("validateChunkIndexes", () => {
  it("accepts indexes within range", () => {
    expect(validateChunkIndexes([0, 1, 2], 3)).toBe(true);
  });

  it("rejects an out-of-range index", () => {
    expect(validateChunkIndexes([0, 5], 3)).toBe(false);
  });

  it("rejects a negative index", () => {
    expect(validateChunkIndexes([-1], 3)).toBe(false);
  });

  it("accepts an empty index list", () => {
    expect(validateChunkIndexes([], 3)).toBe(true);
  });
});

describe("cardSimilarity", () => {
  it("scores identical cards as fully similar", () => {
    const card = { title: "CPU scheduling", explanation: "Round robin cycles through processes." };
    expect(cardSimilarity(card, { ...card })).toBe(1);
  });

  it("scores unrelated cards as dissimilar", () => {
    const a = { title: "CPU scheduling", explanation: "Round robin cycles through processes." };
    const b = { title: "Fourier transform", explanation: "Decomposes signals into frequencies." };
    expect(cardSimilarity(a, b)).toBeLessThan(0.2);
  });

  it("scores near-duplicate phrasing as highly similar", () => {
    const a = {
      title: "Why SJF minimizes waiting time",
      explanation: "Shortest job first provably minimizes average waiting time for scheduling.",
    };
    const b = {
      title: "Why does SJF minimize waiting time",
      explanation: "Shortest job first provably minimizes the average waiting time in scheduling.",
    };
    expect(cardSimilarity(a, b)).toBeGreaterThan(0.6);
  });
});

describe("dedupeCards", () => {
  it("keeps the first occurrence and drops near-duplicates", () => {
    const original = {
      title: "Why SJF minimizes waiting time",
      explanation:
        "Shortest job first provably minimizes average waiting time for scheduling decisions.",
    };
    const duplicate = {
      title: "Why does SJF minimize waiting time",
      explanation:
        "Shortest job first provably minimizes the average waiting time for scheduling decisions.",
    };
    const distinct = {
      title: "Deadlock conditions",
      explanation: "Four conditions must hold for deadlock.",
    };
    const result = dedupeCards([original, duplicate, distinct]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(original);
    expect(result[1]).toBe(distinct);
  });

  it("keeps all cards when none are similar", () => {
    const cards = [
      { title: "A", explanation: "Completely unrelated content about scheduling algorithms." },
      {
        title: "B",
        explanation: "Completely different content about Fourier transforms entirely.",
      },
    ];
    expect(dedupeCards(cards)).toHaveLength(2);
  });
});
