import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { mapCardState, mapStudyCard } from "@/lib/database/mappers";
import { searchQuerySchema } from "@/lib/validation/api";
import type { FeedItem } from "@/lib/types";

/** Card search for the command palette (title/topic/explanation ilike). */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const { q } = searchQuerySchema.parse({ q: url.searchParams.get("q") ?? "" });
    // Escape PostgREST pattern characters so user input can't alter the filter.
    const escaped = q.replace(/[%_,()]/g, " ").trim();
    if (!escaped) return NextResponse.json({ items: [] });

    const [cardsRes, docsRes, statesRes] = await Promise.all([
      auth.supabase
        .from("study_cards")
        .select("*")
        .eq("user_id", auth.user.id)
        .or(`title.ilike.%${escaped}%,topic.ilike.%${escaped}%,explanation.ilike.%${escaped}%`)
        .limit(12),
      auth.supabase.from("documents").select("id, title").eq("user_id", auth.user.id),
      auth.supabase.from("card_states").select("*").eq("user_id", auth.user.id),
    ]);
    if (cardsRes.error) throw new Error(cardsRes.error.message);

    const titles = new Map((docsRes.data ?? []).map((d) => [d.id, d.title]));
    const states = new Map((statesRes.data ?? []).map((s) => [s.card_id, mapCardState(s)]));
    const items: FeedItem[] = (cardsRes.data ?? []).map((row) => ({
      card: mapStudyCard(row, titles.get(row.document_id) ?? "Untitled"),
      state: states.get(row.id) ?? null,
      reasons: [],
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
