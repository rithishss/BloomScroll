import "server-only";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { mapCardState, mapStudyCard } from "@/lib/database/mappers";
import { deriveTopicEngagement, explorationSeed, rankCards } from "@/lib/feed/ranking";
import {
  RAPID_SKIP_DWELL_MS,
  RAPID_SKIPS_TO_SUPPRESS,
  TOPIC_SUPPRESSION_MS,
} from "@/lib/feed/mastery";
import type { CardState, Difficulty, FeedPage, TopicPreference } from "@/lib/types";

/** Bound on candidates considered per request — feeds page, they don't scan
 * the entire table. */
const CANDIDATE_LIMIT = 400;
const RECENT_EVENTS_LIMIT = 200;

/**
 * Server-side feed assembly for real mode. Uses the exact same ranking
 * module as the demo provider (lib/feed/ranking.ts) so both modes are
 * covered by the same unit tests.
 */
export async function buildFeedPage(
  supabase: TypedSupabaseClient,
  userId: string,
  opts: { documentIds?: string[]; cursor: number; limit: number },
): Promise<FeedPage> {
  const now = new Date();

  const [profileRes, prefsRes, docsRes] = await Promise.all([
    supabase.from("profiles").select("preferred_difficulty").eq("id", userId).maybeSingle(),
    supabase.from("topic_preferences").select("*").eq("user_id", userId),
    supabase.from("documents").select("id, title").eq("user_id", userId).eq("status", "ready"),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);

  const docTitles = new Map((docsRes.data ?? []).map((d) => [d.id, d.title]));
  let candidateDocIds = [...docTitles.keys()];
  if (opts.documentIds && opts.documentIds.length > 0) {
    const wanted = new Set(opts.documentIds);
    candidateDocIds = candidateDocIds.filter((id) => wanted.has(id));
  }
  if (candidateDocIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const [cardsRes, statesRes, eventsRes] = await Promise.all([
    supabase
      .from("study_cards")
      .select("*")
      .eq("user_id", userId)
      .in("document_id", candidateDocIds)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
    supabase.from("card_states").select("*").eq("user_id", userId),
    supabase
      .from("card_events")
      .select("event_type, dwell_ms, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_EVENTS_LIMIT),
  ]);
  if (cardsRes.error) throw new Error(cardsRes.error.message);
  if (statesRes.error) throw new Error(statesRes.error.message);

  const cards = (cardsRes.data ?? []).map((row) =>
    mapStudyCard(row, docTitles.get(row.document_id) ?? "Untitled"),
  );
  const states = new Map<string, CardState>(
    (statesRes.data ?? []).map((row) => [row.card_id, mapCardState(row)]),
  );

  const events = (eventsRes.data ?? []).map((e) => ({
    topic:
      typeof e.metadata === "object" && e.metadata !== null && "topic" in e.metadata
        ? String((e.metadata as { topic?: unknown }).topic ?? "")
        : "",
    eventType: e.event_type,
    dwellMs: e.dwell_ms,
    createdAt: e.created_at,
  }));

  // Rapid-skip suppression, derived statelessly from the event stream:
  // ≥3 skips with dwell < 1.5s on a topic within the last 30 minutes.
  const suppressionCutoff = now.getTime() - TOPIC_SUPPRESSION_MS;
  const rapidSkipCounts = new Map<string, number>();
  for (const e of events) {
    if (
      e.eventType === "skip" &&
      e.topic &&
      (e.dwellMs ?? Infinity) < RAPID_SKIP_DWELL_MS &&
      new Date(e.createdAt).getTime() > suppressionCutoff
    ) {
      rapidSkipCounts.set(e.topic, (rapidSkipCounts.get(e.topic) ?? 0) + 1);
    }
  }
  const suppressedTopics = new Set(
    [...rapidSkipCounts.entries()]
      .filter(([, count]) => count >= RAPID_SKIPS_TO_SUPPRESS)
      .map(([topic]) => topic),
  );

  const preferences: TopicPreference[] = (prefsRes.data ?? []).map((row) => ({
    topic: row.topic,
    explicitWeight: row.explicit_weight,
    learnedWeight: row.learned_weight,
  }));

  // Understood cards rest until their spaced review is due.
  const candidates = cards.filter((card) => {
    const state = states.get(card.id);
    if (!state) return true;
    if (state.lastAction === "understood" && state.nextReviewAt) {
      return new Date(state.nextReviewAt) <= now;
    }
    return true;
  });

  const ranked = rankCards(candidates, {
    preferences,
    states,
    preferredDifficulty: (profileRes.data?.preferred_difficulty ?? "core") as Difficulty,
    topicEngagement: deriveTopicEngagement(events.filter((e) => e.topic)),
    suppressedTopics,
    now,
    seed: explorationSeed(userId, now),
  });

  const page = ranked.slice(opts.cursor, opts.cursor + opts.limit);
  return {
    items: page.map((r) => ({
      card: r.card,
      state: states.get(r.card.id) ?? null,
      reasons: r.reasons,
    })),
    nextCursor: opts.cursor + opts.limit < ranked.length ? String(opts.cursor + opts.limit) : null,
  };
}
