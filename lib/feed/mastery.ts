import type { CardEventType, CardState } from "@/lib/types";
import { clamp01 } from "@/lib/utils";

/**
 * Mastery + spaced-review scheduling. Pure functions shared verbatim by the
 * demo provider (client) and the events API route (server), so both modes
 * behave identically and both are covered by the same unit tests.
 *
 * Model:
 * - "Got it" moves mastery 35% of the way toward 1.0 and pushes the next
 *   review out on an expanding ladder (4h → 1d → 3d → 7d → 14d → 30d).
 * - "Review again" multiplies mastery by 0.55 and schedules a 10-minute
 *   near-term review so the card resurfaces within the same session.
 * - Impressions only record exposure; they never change mastery.
 */

export const REVIEW_AGAIN_DELAY_MS = 10 * 60 * 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Expanding review ladder keyed on the mastery reached after an action. */
export function reviewIntervalMs(mastery: number): number {
  if (mastery < 0.35) return 4 * HOUR;
  if (mastery < 0.55) return 1 * DAY;
  if (mastery < 0.7) return 3 * DAY;
  if (mastery < 0.85) return 7 * DAY;
  if (mastery < 0.95) return 14 * DAY;
  return 30 * DAY;
}

export function initialCardState(cardId: string): CardState {
  return {
    cardId,
    saved: false,
    masteryScore: 0,
    timesSeen: 0,
    lastSeenAt: null,
    nextReviewAt: null,
    lastAction: null,
  };
}

export function applyCardEvent(
  state: CardState | null,
  cardId: string,
  eventType: CardEventType,
  now: Date = new Date(),
): CardState {
  const base = state ?? initialCardState(cardId);
  const nowIso = now.toISOString();

  switch (eventType) {
    case "impression":
      return {
        ...base,
        timesSeen: base.timesSeen + 1,
        lastSeenAt: nowIso,
        lastAction: base.lastAction === null ? "impression" : base.lastAction,
      };
    case "understood": {
      const mastery = clamp01(base.masteryScore + (1 - base.masteryScore) * 0.35);
      return {
        ...base,
        masteryScore: mastery,
        lastSeenAt: nowIso,
        nextReviewAt: new Date(now.getTime() + reviewIntervalMs(mastery)).toISOString(),
        lastAction: "understood",
      };
    }
    case "review_again": {
      const mastery = clamp01(base.masteryScore * 0.55);
      return {
        ...base,
        masteryScore: mastery,
        lastSeenAt: nowIso,
        nextReviewAt: new Date(now.getTime() + REVIEW_AGAIN_DELAY_MS).toISOString(),
        lastAction: "review_again",
      };
    }
    case "save":
      return { ...base, saved: true, lastAction: "save" };
    case "unsave":
      return { ...base, saved: false, lastAction: "unsave" };
    case "source_open":
      return { ...base, lastAction: "source_open" };
    case "skip":
      return { ...base, lastSeenAt: nowIso, lastAction: "skip" };
  }
}

/** Dwell at or above this counts as a "lingered on it" interest signal. */
export const LONG_DWELL_MS = 12_000;

/**
 * How much one missed quiz question raises its topic's learned weight.
 *
 * `learnedWeight` is consumed by ranking as "how much should this topic
 * surface", and getting a question wrong is a strong, explicit signal that
 * it should surface more — stronger than a save (0.08), since the user
 * demonstrably didn't know it. Feeding quiz misses in here (rather than
 * mutating per-card mastery, which would mean guessing *which* cards in the
 * topic to penalize) keeps the integration to a single upsert against
 * infrastructure that already exists and is already tested.
 */
export const QUIZ_MISS_LEARNED_WEIGHT_DELTA = 0.12;

/**
 * Learned topic-interest adjustment for an event. Saves nudge interest the
 * most; opening the source and long dwell are weaker signals. Dwell time is
 * reported on whichever event advances the card (understood / review_again /
 * skip), so the dwell bonus applies to any engaged event type.
 */
export function learnedWeightDelta(eventType: CardEventType, dwellMs?: number | null): number {
  let delta = 0;
  switch (eventType) {
    case "save":
      delta = 0.08;
      break;
    case "source_open":
      delta = 0.03;
      break;
    case "understood":
      delta = 0.01;
      break;
    default:
      break;
  }
  if (eventType !== "unsave" && dwellMs != null && dwellMs >= LONG_DWELL_MS) {
    delta += 0.02;
  }
  return delta;
}

/** A skip counts as "rapid" (a disengagement signal) below this dwell. */
export const RAPID_SKIP_DWELL_MS = 1_500;
/** Rapid skips within this window count toward suppression. */
export const RAPID_SKIP_WINDOW_MS = 10 * 60 * 1000;
/** After 3 rapid skips, the topic is de-prioritized for 30 minutes. */
export const TOPIC_SUPPRESSION_MS = 30 * 60 * 1000;
export const RAPID_SKIPS_TO_SUPPRESS = 3;

export interface TopicSkipTracker {
  /** Epoch ms of recent rapid skips per topic. */
  recentSkips: Record<string, number[]>;
  /** Epoch ms until which each topic is suppressed. */
  suppressedUntil: Record<string, number>;
}

export function emptySkipTracker(): TopicSkipTracker {
  return { recentSkips: {}, suppressedUntil: {} };
}

/** Records a skip; returns an updated tracker (input is not mutated). */
export function trackSkip(
  tracker: TopicSkipTracker,
  topic: string,
  dwellMs: number | null | undefined,
  now: Date = new Date(),
): TopicSkipTracker {
  if (dwellMs == null || dwellMs >= RAPID_SKIP_DWELL_MS) return tracker;
  const nowMs = now.getTime();
  const cutoff = nowMs - RAPID_SKIP_WINDOW_MS;
  const recent = [...(tracker.recentSkips[topic] ?? []).filter((t) => t >= cutoff), nowMs];
  const next: TopicSkipTracker = {
    recentSkips: { ...tracker.recentSkips, [topic]: recent },
    suppressedUntil: { ...tracker.suppressedUntil },
  };
  if (recent.length >= RAPID_SKIPS_TO_SUPPRESS) {
    next.suppressedUntil[topic] = nowMs + TOPIC_SUPPRESSION_MS;
    next.recentSkips[topic] = [];
  }
  return next;
}

export function isTopicSuppressed(
  tracker: TopicSkipTracker,
  topic: string,
  now: Date = new Date(),
): boolean {
  const until = tracker.suppressedUntil[topic];
  return until !== undefined && until > now.getTime();
}
