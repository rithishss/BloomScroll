import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Deletes all of the caller's data: storage objects, then documents (chunks,
 * cards, events, and states cascade), then chat threads, preferences, and
 * profile personalization. The auth account itself is kept so the user can
 * sign back in to an empty workspace.
 */
export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const userId = auth.user.id;

    const { data: docs } = await auth.supabase
      .from("documents")
      .select("storage_path")
      .eq("user_id", userId);
    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    const admin = createSupabaseAdminClient();
    if (admin && paths.length > 0) {
      await admin.storage.from("documents").remove(paths);
    }

    await auth.supabase.from("documents").delete().eq("user_id", userId);
    await auth.supabase.from("chat_threads").delete().eq("user_id", userId);
    await auth.supabase.from("topic_preferences").delete().eq("user_id", userId);
    await auth.supabase.from("profiles").update({ onboarding_completed: false }).eq("id", userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
