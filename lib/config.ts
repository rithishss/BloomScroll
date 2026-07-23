import { z } from "zod";

/**
 * Environment parsing. `publicConfig` is safe for the client bundle (only
 * NEXT_PUBLIC_* values). Server-only secrets are parsed in
 * `lib/config.server.ts` via `parseServerEnv` below — the parser itself is a
 * pure function so it can be unit-tested without real env vars.
 */

export const publicConfig = {
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
  supabaseConfigured: Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  OPENAI_TTS_MODEL: z.string().min(1).default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE: z.string().min(1).default("alloy"),
  MAX_PDF_SIZE_MB: z.coerce.number().int().positive().max(100).default(20),
});

export interface ServerConfig {
  supabase: { url: string; publishableKey: string; serviceRoleKey: string } | null;
  openai: {
    apiKey: string;
    baseUrl: string | null;
    chatModel: string;
    embeddingModel: string;
    ttsModel: string;
    ttsVoice: string;
  } | null;
  maxPdfSizeMb: number;
  maxPdfSizeBytes: number;
  /** Must match the vector(N) dimension in supabase/migrations. */
  embeddingDimensions: number;
}

/** Pure parser so tests can exercise defaults/failures without mutating process.env. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerConfig {
  const parsed = serverEnvSchema.parse(env);

  const supabase =
    parsed.NEXT_PUBLIC_SUPABASE_URL &&
    parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    parsed.SUPABASE_SERVICE_ROLE_KEY
      ? {
          url: parsed.NEXT_PUBLIC_SUPABASE_URL,
          publishableKey: parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
        }
      : null;

  const openai = parsed.OPENAI_API_KEY
    ? {
        apiKey: parsed.OPENAI_API_KEY,
        baseUrl: parsed.OPENAI_BASE_URL ?? null,
        chatModel: parsed.OPENAI_CHAT_MODEL,
        embeddingModel: parsed.OPENAI_EMBEDDING_MODEL,
        ttsModel: parsed.OPENAI_TTS_MODEL,
        ttsVoice: parsed.OPENAI_TTS_VOICE,
      }
    : null;

  return {
    supabase,
    openai,
    maxPdfSizeMb: parsed.MAX_PDF_SIZE_MB,
    maxPdfSizeBytes: parsed.MAX_PDF_SIZE_MB * 1024 * 1024,
    embeddingDimensions: 1536,
  };
}
