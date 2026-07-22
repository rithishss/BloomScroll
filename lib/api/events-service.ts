import "server-only";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { mapCardState, mapCardStateToRow } from "@/lib/database/mappers";
import { applyCardEvent, learnedWeightDelta } from "@/lib/feed/mastery";
import { clamp01 } from "@/lib/utils";
import type { CardEventType, CardState } from "@/lib/types";

const IMPRESSION_DEDUPE_MS = 5_000;

/**
 * Records a card event and applies its consequences: card_states mastery /
 * scheduling (shared applyCardEvent module), learned topic weights, and the
 * document's last-studied timestamp. Runs entirely on the caller's
 * RLS-scoped client, so ownership is enforced by the database.
 */
export async function recordCardEvent(
  supabase: TypedSupabaseClient,
  userId: string,
  input: { cardId: string; eventType: CardEventType; dwellMs?: number | null },
): Promise<CardState | null> {
  // Ownership check doubles as topic lookup (RLS returns only own cards).
  const { data: card, error: cardError } = await supabase
    .from("study_cards")
    .select("id, topic, document_id")
    .eq("id", input.cardId)
    .maybeSingle();
  if (cardError) throw new Error(cardError.message);
  if (!card) return null;

  const now = new Date();

  // Impression dedupe: React rerenders and refetches must not double-count.
  if (input.eventType === "impression") {
    const { data: recent } = await supabase
      .from("card_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("card_id", input.cardId)
      .eq("event_type", "impression")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && now.getTime() - new Date(recent.created_at).getTime() < IMPRESSION_DEDUPE_MS) {
      const { data: existing } = await supabase
        .from("card_states")
        .select("*")
        .eq("user_id", userId)
        .eq("card_id", input.cardId)
        .maybeSingle();
      return existing ? mapCardState(existing) : null;
    }
  }

  const { error: insertError } = await supabase.from("card_events").insert({
    user_id: userId,
    card_id: input.cardId,
    event_type: input.eventType,
    dwell_ms: input.dwellMs ?? null,
    metadata: { topic: card.topic },
  });
  if (insertError) throw new Error(insertError.message);

  const { data: stateRow } = await supabase
    .from("card_states")
    .select("*")
    .eq("user_id", userId)
    .eq("card_id", input.cardId)
    .maybeSingle();

  const nextState = applyCardEvent(
    stateRow ? mapCardState(stateRow) : null,
    input.cardId,
    input.eventType,
    now,
  );
  const { error: upsertError } = await supabase
    .from("card_states")
    .upsert(mapCardStateToRow(userId, nextState), { onConflict: "user_id,card_id" });
  if (upsertError) throw new Error(upsertError.message);

  const delta = learnedWeightDelta(input.eventType, input.dwellMs);
  if (delta !== 0) {
    const { data: pref } = await supabase
      .from("topic_preferences")
      .select("learned_weight, explicit_weight")
      .eq("user_id", userId)
      .eq("topic", card.topic)
      .maybeSingle();
    await supabase.from("topic_preferences").upsert(
      {
        user_id: userId,
        topic: card.topic,
        explicit_weight: pref?.explicit_weight ?? 0.5,
        learned_weight: clamp01((pref?.learned_weight ?? 0.3) + delta),
      },
      { onConflict: "user_id,topic" },
    );
  }

  if (["understood", "review_again", "impression"].includes(input.eventType)) {
    await supabase
      .from("documents")
      .update({ last_studied_at: now.toISOString() })
      .eq("id", card.document_id)
      .eq("user_id", userId);
  }

  return nextState;
}
