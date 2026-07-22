import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";
import { serverConfig } from "@/lib/config.server";

/**
 * Service-role client. SERVER ONLY — used exclusively by the ingestion
 * pipeline, which runs after ownership has been verified with the user's
 * own RLS-scoped client. Never import from client components; the
 * "server-only" package makes that a build error.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const config = serverConfig();
  if (!config.supabase) return null;
  return createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
