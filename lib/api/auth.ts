import "server-only";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, type TypedSupabaseClient } from "@/lib/supabase/server";
import { apiError, NOT_CONFIGURED_MESSAGE } from "@/lib/api/errors";

export type AuthedRequest =
  { ok: true; supabase: TypedSupabaseClient; user: User } | { ok: false; response: NextResponse };

/** Standard gate for API routes: 503 when Supabase isn't configured, 401
 * when there is no session, otherwise an RLS-scoped client + verified user. */
export async function requireUser(): Promise<AuthedRequest> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, response: apiError("not_configured", NOT_CONFIGURED_MESSAGE) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("unauthorized", "Sign in to continue.") };
  }
  return { ok: true, supabase, user };
}
