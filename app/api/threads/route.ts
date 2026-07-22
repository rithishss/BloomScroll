import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { mapThread } from "@/lib/database/mappers";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await auth.supabase
      .from("chat_threads")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ threads: (data ?? []).map(mapThread) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
