import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { QUIZ_MISS_LEARNED_WEIGHT_DELTA } from "@/lib/feed/mastery";
import { clamp01 } from "@/lib/utils";

const bodySchema = z.object({
  missedTopics: z.array(z.string().trim().min(1).max(80)).max(20),
});

/**
 * Feeds a finished quiz back into feed ranking. Topics the user got wrong
 * get a learned-weight bump, which `lib/feed/ranking.ts` consumes as
 * "surface this topic more" — no new ranking concept, no per-card mastery
 * guesswork. See QUIZ_MISS_LEARNED_WEIGHT_DELTA for the rationale.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { missedTopics } = bodySchema.parse(await request.json());
    const unique = [...new Set(missedTopics)];
    if (unique.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const { data: existing, error } = await auth.supabase
      .from("topic_preferences")
      .select("topic, explicit_weight, learned_weight")
      .eq("user_id", auth.user.id)
      .in("topic", unique);
    if (error) throw new Error(error.message);

    const byTopic = new Map((existing ?? []).map((row) => [row.topic, row]));
    const rows = unique.map((topic) => {
      const prev = byTopic.get(topic);
      return {
        user_id: auth.user.id,
        topic,
        explicit_weight: prev?.explicit_weight ?? 0.5,
        learned_weight: clamp01(
          (prev?.learned_weight ?? 0.3) + QUIZ_MISS_LEARNED_WEIGHT_DELTA,
        ),
      };
    });

    const { error: upsertError } = await auth.supabase
      .from("topic_preferences")
      .upsert(rows, { onConflict: "user_id,topic" });
    if (upsertError) throw new Error(upsertError.message);

    return NextResponse.json({ ok: true, updated: rows.length });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
