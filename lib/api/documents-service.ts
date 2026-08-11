import "server-only";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDocument, mapStudyCard } from "@/lib/database/mappers";
import type { DocumentDetail, DocumentSummary } from "@/lib/types";

/** Aggregated card/chunk metadata for a set of documents in two queries
 * (no N+1). */
async function loadExtras(
  supabase: TypedSupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<Map<string, { cardCount: number; chunkCount: number; topics: string[] }>> {
  const extras = new Map<string, { cardCount: number; chunkCount: number; topics: string[] }>();
  for (const id of documentIds) {
    extras.set(id, { cardCount: 0, chunkCount: 0, topics: [] });
  }
  if (documentIds.length === 0) return extras;

  const [cardsRes, chunksRes] = await Promise.all([
    supabase
      .from("study_cards")
      .select("document_id, topic")
      .eq("user_id", userId)
      .in("document_id", documentIds),
    supabase
      .from("document_chunks")
      .select("document_id")
      .eq("user_id", userId)
      .in("document_id", documentIds),
  ]);

  for (const row of cardsRes.data ?? []) {
    const entry = extras.get(row.document_id);
    if (!entry) continue;
    entry.cardCount += 1;
    if (!entry.topics.includes(row.topic)) entry.topics.push(row.topic);
  }
  for (const row of chunksRes.data ?? []) {
    const entry = extras.get(row.document_id);
    if (entry) entry.chunkCount += 1;
  }
  return extras;
}

export async function listUserDocuments(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<DocumentSummary[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const extras = await loadExtras(
    supabase,
    userId,
    (data ?? []).map((d) => d.id),
  );
  return (data ?? []).map((row) =>
    mapDocument(row, extras.get(row.id) ?? { cardCount: 0, chunkCount: 0, topics: [] }),
  );
}

export async function getDocumentDetail(
  supabase: TypedSupabaseClient,
  userId: string,
  documentId: string,
): Promise<DocumentDetail | null> {
  const { data: row, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const [extras, cardsRes, statesRes, quizRes] = await Promise.all([
    loadExtras(supabase, userId, [documentId]),
    supabase
      .from("study_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("card_states").select("card_id, mastery_score").eq("user_id", userId),
    supabase
      .from("quiz_questions")
      .select("id")
      .eq("user_id", userId)
      .eq("document_id", documentId),
  ]);

  const cards = (cardsRes.data ?? []).map((c) => mapStudyCard(c, row.title));
  const masteryByCard = new Map((statesRes.data ?? []).map((s) => [s.card_id, s.mastery_score]));

  const byTopic = new Map<string, { count: number; masterySum: number }>();
  for (const card of cards) {
    const entry = byTopic.get(card.topic) ?? { count: 0, masterySum: 0 };
    entry.count += 1;
    entry.masterySum += masteryByCard.get(card.id) ?? 0;
    byTopic.set(card.topic, entry);
  }

  return {
    ...mapDocument(row, extras.get(documentId) ?? { cardCount: 0, chunkCount: 0, topics: [] }),
    topicBreakdown: [...byTopic.entries()].map(([topic, { count, masterySum }]) => ({
      topic,
      cardCount: count,
      masteryAvg: count > 0 ? masterySum / count : 0,
    })),
    previewCards: cards.slice(0, 6),
    quizCount: (quizRes.data ?? []).length,
  };
}

/**
 * Full deletion: storage object first (needs service role for reliability),
 * then the row — chunks, cards, events, and states cascade via FKs.
 */
export async function deleteDocumentCompletely(
  supabase: TypedSupabaseClient,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const { data: row } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("id", documentId)
    .maybeSingle();
  if (!row) return false;

  const admin = createSupabaseAdminClient();
  if (admin && row.storage_path) {
    await admin.storage.from("documents").remove([row.storage_path]);
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return true;
}
