import { describe, expect, it } from "vitest";
import {
  RAPID_SKIPS_TO_SUPPRESS,
  REVIEW_AGAIN_DELAY_MS,
  applyCardEvent,
  emptySkipTracker,
  initialCardState,
  isTopicSuppressed,
  learnedWeightDelta,
  reviewIntervalMs,
  trackSkip,
} from "@/lib/feed/mastery";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("initialCardState", () => {
  it("starts at zero mastery with no history", () => {
    const state = initialCardState("card-1");
    expect(state).toMatchObject({
      cardId: "card-1",
      saved: false,
      masteryScore: 0,
      timesSeen: 0,
      lastAction: null,
    });
  });
});

describe("applyCardEvent — understood", () => {
  it("raises mastery toward 1 and schedules a future review", () => {
    const state = applyCardEvent(initialCardState("c1"), "c1", "understood", NOW);
    expect(state.masteryScore).toBeCloseTo(0.35, 5);
    expect(state.nextReviewAt).not.toBeNull();
    expect(new Date(state.nextReviewAt!).getTime()).toBeGreaterThan(NOW.getTime());
    expect(state.lastAction).toBe("understood");
  });

  it("schedules progressively longer reviews as mastery climbs", () => {
    let state = initialCardState("c1");
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = applyCardEvent(state, "c1", "understood", NOW);
      intervals.push(new Date(state.nextReviewAt!).getTime() - NOW.getTime());
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
  });

  it("never exceeds a mastery score of 1", () => {
    let state = initialCardState("c1");
    for (let i = 0; i < 20; i++) {
      state = applyCardEvent(state, "c1", "understood", NOW);
    }
    expect(state.masteryScore).toBeLessThanOrEqual(1);
  });
});

describe("applyCardEvent — review_again", () => {
  it("lowers mastery and schedules a near-term review", () => {
    const understood = applyCardEvent(initialCardState("c1"), "c1", "understood", NOW);
    const reviewed = applyCardEvent(understood, "c1", "review_again", NOW);
    expect(reviewed.masteryScore).toBeLessThan(understood.masteryScore);
    expect(new Date(reviewed.nextReviewAt!).getTime() - NOW.getTime()).toBe(REVIEW_AGAIN_DELAY_MS);
    expect(reviewed.lastAction).toBe("review_again");
  });

  it("never drops mastery below 0", () => {
    let state = initialCardState("c1");
    for (let i = 0; i < 10; i++) {
      state = applyCardEvent(state, "c1", "review_again", NOW);
    }
    expect(state.masteryScore).toBeGreaterThanOrEqual(0);
  });
});

describe("applyCardEvent — save/unsave", () => {
  it("toggles the saved flag without touching mastery", () => {
    const saved = applyCardEvent(initialCardState("c1"), "c1", "save", NOW);
    expect(saved.saved).toBe(true);
    expect(saved.masteryScore).toBe(0);
    const unsaved = applyCardEvent(saved, "c1", "unsave", NOW);
    expect(unsaved.saved).toBe(false);
  });
});

describe("applyCardEvent — impression", () => {
  it("increments timesSeen and records lastSeenAt", () => {
    const state = applyCardEvent(initialCardState("c1"), "c1", "impression", NOW);
    expect(state.timesSeen).toBe(1);
    expect(state.lastSeenAt).toBe(NOW.toISOString());
  });

  it("does not overwrite a prior lastAction", () => {
    const understood = applyCardEvent(initialCardState("c1"), "c1", "understood", NOW);
    const impressed = applyCardEvent(understood, "c1", "impression", NOW);
    expect(impressed.lastAction).toBe("understood");
  });
});

describe("reviewIntervalMs", () => {
  it("is monotonically non-decreasing with mastery", () => {
    const samples = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1].map(reviewIntervalMs);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });
});

describe("learnedWeightDelta", () => {
  it("weights a save more than a source open", () => {
    expect(learnedWeightDelta("save")).toBeGreaterThan(learnedWeightDelta("source_open"));
  });

  it("adds a bonus for long dwell time", () => {
    expect(learnedWeightDelta("understood", 15_000)).toBeGreaterThan(
      learnedWeightDelta("understood", 1000),
    );
  });

  it("gives skip and review_again no positive weight on their own", () => {
    expect(learnedWeightDelta("skip")).toBe(0);
    expect(learnedWeightDelta("review_again")).toBe(0);
  });
});

describe("skip tracking / topic suppression", () => {
  it("suppresses a topic after enough rapid skips", () => {
    let tracker = emptySkipTracker();
    for (let i = 0; i < RAPID_SKIPS_TO_SUPPRESS; i++) {
      tracker = trackSkip(tracker, "CPU Scheduling", 500, NOW);
    }
    expect(isTopicSuppressed(tracker, "CPU Scheduling", NOW)).toBe(true);
  });

  it("does not suppress a topic from slow (deliberate) skips", () => {
    let tracker = emptySkipTracker();
    for (let i = 0; i < 5; i++) {
      tracker = trackSkip(tracker, "CPU Scheduling", 5000, NOW);
    }
    expect(isTopicSuppressed(tracker, "CPU Scheduling", NOW)).toBe(false);
  });

  it("does not suppress a topic below the rapid-skip threshold", () => {
    let tracker = emptySkipTracker();
    tracker = trackSkip(tracker, "CPU Scheduling", 500, NOW);
    tracker = trackSkip(tracker, "CPU Scheduling", 500, NOW);
    expect(isTopicSuppressed(tracker, "CPU Scheduling", NOW)).toBe(false);
  });

  it("suppression expires after the cooldown window", () => {
    let tracker = emptySkipTracker();
    for (let i = 0; i < RAPID_SKIPS_TO_SUPPRESS; i++) {
      tracker = trackSkip(tracker, "CPU Scheduling", 500, NOW);
    }
    const later = new Date(NOW.getTime() + 31 * 60 * 1000);
    expect(isTopicSuppressed(tracker, "CPU Scheduling", later)).toBe(false);
  });

  it("does not leak suppression across topics", () => {
    let tracker = emptySkipTracker();
    for (let i = 0; i < RAPID_SKIPS_TO_SUPPRESS; i++) {
      tracker = trackSkip(tracker, "CPU Scheduling", 500, NOW);
    }
    expect(isTopicSuppressed(tracker, "File Systems", NOW)).toBe(false);
  });
});
