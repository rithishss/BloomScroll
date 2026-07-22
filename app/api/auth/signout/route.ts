import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError, NOT_CONFIGURED_MESSAGE } from "@/lib/api/errors";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("not_configured", NOT_CONFIGURED_MESSAGE);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
