import {
  DIFFICULTY_ORDER,
  type CardState,
  type Difficulty,
  type StudyCard,
  type TopicPreference,
} from "@/lib/types";
import { clamp01, hash01 } from "@/lib/utils";

/**
 * BloomScroll feed ranking.
 *
 * Every candidate card receives a normalized score in [0, 1]:
 *
 *   score = 0.30 · topicRelevance   — explicit onboarding weight + learned interest
 *         + 0.22 · reviewUrgency    — mastery gap × how due the spaced review is
 *         + 0.18 · novelty          — unseen cards first, then 1/(1+timesSeen)
 *         + 0.12 · engagement       — recent saves/opens/dwell for the topic
 *         + 0.10 · difficultyFit    — distance from the user's preferred difficulty
 *         + 0.08 · exploration      — deterministic hash(seed·cardId), a stable
 *                                     tie-breaker that keeps the feed from
 *                                     collapsing onto one topic
 *
 * A greedy diversity pass then orders the scored candidates: at each step it
 * picks the highest-scoring card that would NOT create a third consecutive
 * card from the same topic or document, falling back to the highest-scoring
 * card overall only when every remaining candidate would repeat (i.e. no
 * alternative exists). This is a hard constraint rather than a score
 * penalty — a fixed penalty could always be outweighed by a strong enough
 * topic-relevance gap, which would silently break the "avoid repetition
 * when alternatives exist" guarantee for users with extreme preference
 * weights. Topics the user rapid-skipped are multiplied by
 * SUPPRESSION_FACTOR instead of being hidden. The whole pipeline is
 * deterministic given (cards, context, seed), which is what makes it
 * unit-testable.
 */

export interface RankingContext {
  preferences: TopicPreference[];
  states: Map<string, CardState>;
  preferredDifficulty: Difficulty;
  /** Topic → engagement signal 0..1 (derived from recent events). */
  topicEngagement: Map<string, number>;
  /** Topics temporarily de-prioritized after repeated rapid skips. */
  suppressedTopics: Set<string>;
  now: Date;
  /** Stable per-user-per-day seed for the exploration factor. */
  seed: string;
}

export interface ScoredCard {
  card: StudyCard;
  score: number;
  components: {
    topicRelevance: number;
    reviewUrgency: number;
    novelty: number;
    engagement: number;
    difficultyFit: number;
    exploration: number;
  };
  reasons: string[];
}

export const WEIGHTS = {
  topicRelevance: 0.3,
  reviewUrgency: 0.22,
  novelty: 0.18,
  engagement: 0.12,
  difficultyFit: 0.1,
  exploration: 0.08,
} as const;

export const SUPPRESSION_FACTOR = 0.35;

/** How due a card's spaced review is: 1 when overdue, ramping up from 0 over the 3 days before. */
function dueFactor(state: CardState | null, now: Date): number {
  if (!state?.nextReviewAt) return 0;
  const due = new Date(state.nextReviewAt).getTime();
  const diff = due - now.getTime();
  if (diff <= 0) return 1;
  const rampMs = 3 * 24 * 60 * 60 * 1000;
  return clamp01(1 - diff / rampMs);
}

function topicRelevance(card: StudyCard, ctx: RankingContext): number {
  const pref = ctx.preferences.find((p) => p.topic === card.topic);
  // Unfamiliar topics get a neutral-ish baseline so new documents still surface.
  const base = pref ? clamp01(0.6 * pref.explicitWeight + 0.4 * pref.learnedWeight) : 0.4;
  return ctx.suppressedTopics.has(card.topic) ? base * SUPPRESSION_FACTOR : base;
}

export function scoreCard(card: StudyCard, ctx: RankingContext): ScoredCard {
  const state = ctx.states.get(card.id) ?? null;

  const relevance = topicRelevance(card, ctx);

  const masteryGap = state ? 1 - state.masteryScore : 0;
  const due = dueFactor(state, ctx.now);
  const reviewUrgency = state ? clamp01(0.55 * masteryGap + 0.45 * due) : 0;

  const novelty = state === null || state.timesSeen === 0 ? 1 : 1 / (1 + state.timesSeen);

  const engagement = ctx.topicEngagement.get(card.topic) ?? 0.3;

  const distance = Math.abs(
    DIFFICULTY_ORDER[card.difficulty] - DIFFICULTY_ORDER[ctx.preferredDifficulty],
  );
  const difficultyFit = 1 - distance / 2;

  const exploration = hash01(`${ctx.seed}:${card.id}`);

  const score =
    WEIGHTS.topicRelevance * relevance +
    WEIGHTS.reviewUrgency * reviewUrgency +
    WEIGHTS.novelty * novelty +
    WEIGHTS.engagement * engagement +
    WEIGHTS.difficultyFit * difficultyFit +
    WEIGHTS.exploration * exploration;

  const reasons: string[] = [];
  const pref = ctx.preferences.find((p) => p.topic === card.topic);
  if (state?.nextReviewAt && new Date(state.nextReviewAt) <= ctx.now) {
    reasons.push("Scheduled for review");
  }
  if (state?.lastAction === "review_again") {
    reasons.push("You asked to see this again");
  }
  if (pref && pref.explicitWeight >= 0.6) {
    reasons.push(`Matches your ${card.topic} interest`);
  }
  if (pref && pref.learnedWeight >= 0.55) {
    reasons.push(`You've engaged with ${card.topic} recently`);
  }
  if ((state === null || state.timesSeen === 0) && reasons.length < 2) {
    reasons.push(`New from ${card.documentTitle}`);
  }
  if (state && state.masteryScore < 0.4 && state.timesSeen > 0) {
    reasons.push("Still blooming — low mastery so far");
  }
  if (reasons.length === 0) {
    reasons.push("A change of scenery for balance");
  }

  return {
    card,
    score,
    components: {
      topicRelevance: relevance,
      reviewUrgency,
      novelty,
      engagement,
      difficultyFit,
      exploration,
    },
    reasons: reasons.slice(0, 2),
  };
}

/**
 * Scores and orders candidates with the diversity pass described above.
 * Deterministic: same inputs → same order.
 */
export function rankCards(cards: StudyCard[], ctx: RankingContext, limit?: number): ScoredCard[] {
  const scored = cards
    .map((c) => scoreCard(c, ctx))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));

  const result: ScoredCard[] = [];
  const remaining = [...scored];
  const max = limit ?? scored.length;

  while (result.length < max && remaining.length > 0) {
    const lastTwo = result.slice(-2);
    const wouldRepeat = (c: ScoredCard) =>
      lastTwo.length === 2 &&
      (lastTwo.every((r) => r.card.topic === c.card.topic) ||
        lastTwo.every((r) => r.card.documentId === c.card.documentId));

    // "...when alternatives exist" is a hard constraint, not a soft
    // preference: a fixed score penalty could always be outweighed by a
    // strong enough topic-relevance gap, silently breaking the guarantee
    // for users with extreme preference weights. So a would-be third
    // consecutive same-topic/document card is only eligible when nothing
    // else in the remaining pool avoids it.
    const eligible = remaining.filter((c) => !wouldRepeat(c));
    const pool = eligible.length > 0 ? eligible : remaining;

    let bestIdx = 0;
    for (let i = 1; i < pool.length; i++) {
      if (pool[i].score > pool[bestIdx].score) bestIdx = i;
    }
    const picked = pool[bestIdx];
    remaining.splice(remaining.indexOf(picked), 1);
    result.push(picked);
  }
  return result;
}

/**
 * Derives topic engagement (0..1) from recent card events. Saves count the
 * most, then source opens, then long-dwell impressions.
 */
export function deriveTopicEngagement(
  events: { topic: string; eventType: string; dwellMs?: number | null }[],
): Map<string, number> {
  const raw = new Map<string, number>();
  for (const e of events) {
    let signal = 0;
    if (e.eventType === "save") signal = 0.3;
    else if (e.eventType === "source_open") signal = 0.15;
    else if (e.eventType === "understood") signal = 0.08;
    if ((e.dwellMs ?? 0) >= 12_000 && e.eventType !== "unsave") signal += 0.1;
    if (signal > 0) raw.set(e.topic, (raw.get(e.topic) ?? 0) + signal);
  }
  const result = new Map<string, number>();
  for (const [topic, value] of raw) {
    result.set(topic, clamp01(0.3 + value));
  }
  return result;
}

/** Stable day-bucketed seed: exploration reshuffles daily, not per render. */
export function explorationSeed(userId: string, now: Date): string {
  const day = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  return `${userId}:${day}`;
}
