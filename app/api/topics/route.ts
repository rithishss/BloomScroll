import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { mapTopicPreference } from "@/lib/database/mappers";
import { topicDeleteSchema, topicPutSchema } from "@/lib/validation/api";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await auth.supabase
      .from("topic_preferences")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("explicit_weight", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ topics: (data ?? []).map(mapTopicPreference) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { topic, explicitWeight } = topicPutSchema.parse(await request.json());
    const { data: existing } = await auth.supabase
      .from("topic_preferences")
      .select("learned_weight")
      .eq("user_id", auth.user.id)
      .eq("topic", topic)
      .maybeSingle();
    const { error } = await auth.supabase.from("topic_preferences").upsert(
      {
        user_id: auth.user.id,
        topic,
        explicit_weight: explicitWeight,
        learned_weight: existing?.learned_weight ?? 0.3,
      },
      { onConflict: "user_id,topic" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorFromException(err);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { topic } = topicDeleteSchema.parse(await request.json());
    const { error } = await auth.supabase
      .from("topic_preferences")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("topic", topic);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
