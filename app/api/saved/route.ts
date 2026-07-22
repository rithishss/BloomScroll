import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { mapCardState, mapStudyCard } from "@/lib/database/mappers";
import type { FeedItem } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { data: states, error } = await auth.supabase
      .from("card_states")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("saved", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    if (!states || states.length === 0) return NextResponse.json({ items: [] });

    const cardIds = states.map((s) => s.card_id);
    const [cardsRes, docsRes] = await Promise.all([
      auth.supabase.from("study_cards").select("*").eq("user_id", auth.user.id).in("id", cardIds),
      auth.supabase.from("documents").select("id, title").eq("user_id", auth.user.id),
    ]);
    if (cardsRes.error) throw new Error(cardsRes.error.message);

    const titles = new Map((docsRes.data ?? []).map((d) => [d.id, d.title]));
    const stateByCard = new Map(states.map((s) => [s.card_id, mapCardState(s)]));
    const items: FeedItem[] = (cardsRes.data ?? []).map((row) => ({
      card: mapStudyCard(row, titles.get(row.document_id) ?? "Untitled"),
      state: stateByCard.get(row.id) ?? null,
      reasons: [],
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
