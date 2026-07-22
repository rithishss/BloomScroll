import { describe, expect, it } from "vitest";
import {
  deriveTopicEngagement,
  explorationSeed,
  rankCards,
  scoreCard,
  type RankingContext,
} from "@/lib/feed/ranking";
import type { CardState, StudyCard } from "@/lib/types";

function card(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: overrides.id ?? "card-1",
    documentId: overrides.documentId ?? "doc-1",
    documentTitle: overrides.documentTitle ?? "Operating Systems",
    cardType: "concept",
    topic: overrides.topic ?? "CPU Scheduling",
    title: overrides.title ?? "Round robin",
    explanation: "Explanation text.",
    question: null,
    answer: null,
    takeaway: null,
    difficulty: overrides.difficulty ?? "core",
    sourceChunkIds: ["chunk-1"],
    sourceExcerpt: "excerpt",
    pageStart: 1,
    pageEnd: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseContext(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    preferences: [],
    states: new Map<string, CardState>(),
    preferredDifficulty: "core",
    topicEngagement: new Map(),
    suppressedTopics: new Set(),
    now: new Date("2026-07-20T12:00:00.000Z"),
    seed: "user-1:19000",
    ...overrides,
  };
}

describe("scoreCard — topic relevance", () => {
  it("scores a card higher when the topic matches a strong explicit preference", () => {
    const preferred = card({ id: "a", topic: "CPU Scheduling" });
    const other = card({ id: "b", topic: "File Systems" });
    const ctx = baseContext({
      preferences: [{ topic: "CPU Scheduling", explicitWeight: 0.9, learnedWeight: 0.5 }],
    });
    const scoredPreferred = scoreCard(preferred, ctx);
    const scoredOther = scoreCard(other, ctx);
    expect(scoredPreferred.components.topicRelevance).toBeGreaterThan(
      scoredOther.components.topicRelevance,
    );
  });

  it("halves relevance for a suppressed topic", () => {
    const c = card({ topic: "CPU Scheduling" });
    const normal = scoreCard(
      c,
      baseContext({
        preferences: [{ topic: "CPU Scheduling", explicitWeight: 0.8, learnedWeight: 0.5 }],
      }),
    );
    const suppressed = scoreCard(
      c,
      baseContext({
        preferences: [{ topic: "CPU Scheduling", explicitWeight: 0.8, learnedWeight: 0.5 }],
        suppressedTopics: new Set(["CPU Scheduling"]),
      }),
    );
    expect(suppressed.components.topicRelevance).toBeLessThan(normal.components.topicRelevance);
  });
});

describe("scoreCard — review urgency", () => {
  it("scores an overdue review as maximally urgent", () => {
    const c = card({ id: "due" });
    const state: CardState = {
      cardId: "due",
      saved: false,
      masteryScore: 0.5,
      timesSeen: 1,
      lastSeenAt: "2026-07-10T00:00:00.000Z",
      nextReviewAt: "2026-07-15T00:00:00.000Z", // in the past relative to `now`
      lastAction: "understood",
    };
    const ctx = baseContext({ states: new Map([["due", state]]) });
    const scored = scoreCard(c, ctx);
    expect(scored.components.reviewUrgency).toBeGreaterThan(0.5);
  });

  it("scores a card with no review history as having zero urgency", () => {
    const c = card();
    const scored = scoreCard(c, baseContext());
    expect(scored.components.reviewUrgency).toBe(0);
  });

  it("scores a review due far in the future as low urgency", () => {
    const c = card({ id: "future" });
    const state: CardState = {
      cardId: "future",
      saved: false,
      masteryScore: 0.9,
      timesSeen: 3,
      lastSeenAt: "2026-07-20T00:00:00.000Z",
      nextReviewAt: "2026-08-20T00:00:00.000Z",
      lastAction: "understood",
    };
    const scored = scoreCard(c, baseContext({ states: new Map([["future", state]]) }));
    expect(scored.components.reviewUrgency).toBeLessThan(0.2);
  });
});

describe("scoreCard — novelty", () => {
  it("gives unseen cards full novelty", () => {
    const scored = scoreCard(card(), baseContext());
    expect(scored.components.novelty).toBe(1);
  });

  it("reduces novelty as a card is seen more times", () => {
    const state: CardState = {
      cardId: "card-1",
      saved: false,
      masteryScore: 0.5,
      timesSeen: 4,
      lastSeenAt: null,
      nextReviewAt: null,
      lastAction: "understood",
    };
    const scored = scoreCard(card(), baseContext({ states: new Map([["card-1", state]]) }));
    expect(scored.components.novelty).toBeLessThan(1);
    expect(scored.components.novelty).toBeCloseTo(1 / 5, 5);
  });
});

describe("scoreCard — difficulty fit", () => {
  it("scores a perfect difficulty match as 1", () => {
    const scored = scoreCard(
      card({ difficulty: "core" }),
      baseContext({ preferredDifficulty: "core" }),
    );
    expect(scored.components.difficultyFit).toBe(1);
  });

  it("scores the most distant difficulty as 0", () => {
    const scored = scoreCard(
      card({ difficulty: "advanced" }),
      baseContext({ preferredDifficulty: "intro" }),
    );
    expect(scored.components.difficultyFit).toBe(0);
  });
});

describe("scoreCard — reasons", () => {
  it("always returns at least one reason", () => {
    const scored = scoreCard(card(), baseContext());
    expect(scored.reasons.length).toBeGreaterThan(0);
  });

  it("surfaces a review reason for a due card", () => {
    const state: CardState = {
      cardId: "card-1",
      saved: false,
      masteryScore: 0.3,
      timesSeen: 1,
      lastSeenAt: null,
      nextReviewAt: "2026-01-01T00:00:00.000Z",
      lastAction: "understood",
    };
    const scored = scoreCard(card(), baseContext({ states: new Map([["card-1", state]]) }));
    expect(scored.reasons.some((r) => r.toLowerCase().includes("review"))).toBe(true);
  });
});

describe("rankCards — determinism", () => {
  it("produces the same order for the same inputs", () => {
    const cards = [card({ id: "a" }), card({ id: "b", topic: "File Systems" }), card({ id: "c" })];
    const ctx = baseContext();
    const first = rankCards(cards, ctx).map((r) => r.card.id);
    const second = rankCards(cards, ctx).map((r) => r.card.id);
    expect(first).toEqual(second);
  });
});

describe("rankCards — diversity", () => {
  it("avoids a third consecutive card from the same topic when an alternative exists", () => {
    // Three "CPU Scheduling" cards strongly preferred, one alternative-topic
    // card with zero explicit/learned weight — even though its raw score is
    // always lower, it must still be held in reserve and pulled forward to
    // break up the run once two CPU cards in a row have appeared. The
    // preference gap is deliberately far larger than the exploration
    // factor's range so the outcome never depends on hash luck.
    const cards = [
      card({ id: "cpu-1", topic: "CPU Scheduling", documentId: "doc-os" }),
      card({ id: "cpu-2", topic: "CPU Scheduling", documentId: "doc-os" }),
      card({ id: "cpu-3", topic: "CPU Scheduling", documentId: "doc-os" }),
      card({ id: "alt-1", topic: "File Systems", documentId: "doc-fs" }),
    ];
    const ctx = baseContext({
      preferences: [
        { topic: "CPU Scheduling", explicitWeight: 1, learnedWeight: 1 },
        { topic: "File Systems", explicitWeight: 0, learnedWeight: 0 },
      ],
    });
    const ranked = rankCards(cards, ctx).map((r) => r.card.topic);
    // No three consecutive entries should share the same topic.
    for (let i = 0; i + 2 < ranked.length; i++) {
      const window = ranked.slice(i, i + 3);
      expect(new Set(window).size).toBeGreaterThan(1);
    }
  });

  it("respects a limit", () => {
    const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
    const ranked = rankCards(cards, baseContext(), 2);
    expect(ranked).toHaveLength(2);
  });
});

describe("deriveTopicEngagement", () => {
  it("weights saves more heavily than impressions", () => {
    const engagement = deriveTopicEngagement([
      { topic: "A", eventType: "save" },
      { topic: "B", eventType: "impression", dwellMs: 500 },
    ]);
    expect(engagement.get("A")!).toBeGreaterThan(engagement.get("B") ?? 0);
  });

  it("returns values within [0, 1]", () => {
    const engagement = deriveTopicEngagement([
      { topic: "A", eventType: "save" },
      { topic: "A", eventType: "save" },
      { topic: "A", eventType: "source_open" },
      { topic: "A", eventType: "understood" },
    ]);
    expect(engagement.get("A")!).toBeLessThanOrEqual(1);
  });
});

describe("explorationSeed", () => {
  it("is stable within the same day", () => {
    const a = explorationSeed("user-1", new Date("2026-07-20T01:00:00.000Z"));
    const b = explorationSeed("user-1", new Date("2026-07-20T23:00:00.000Z"));
    expect(a).toBe(b);
  });

  it("changes across days", () => {
    const a = explorationSeed("user-1", new Date("2026-07-20T01:00:00.000Z"));
    const b = explorationSeed("user-1", new Date("2026-07-21T01:00:00.000Z"));
    expect(a).not.toBe(b);
  });
});
