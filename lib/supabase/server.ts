import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";
import { serverConfig } from "@/lib/config.server";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Request-scoped Supabase client authenticated as the current user (RLS
 * applies). Returns null when Supabase is not configured — callers surface
 * a friendly setup notice instead of crashing.
 */
export async function createSupabaseServerClient(): Promise<TypedSupabaseClient | null> {
  const config = serverConfig();
  if (!config.supabase) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(config.supabase.url, config.supabase.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies; the proxy refreshes sessions.
        }
      },
    },
  });
}

/** Convenience: client + verified user in one call (null when signed out). */
export async function getAuthenticatedContext(): Promise<{
  supabase: TypedSupabaseClient;
  user: User;
} | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}
