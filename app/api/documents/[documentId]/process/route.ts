import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { checkRateLimit, PROCESS_RATE_LIMIT } from "@/lib/api/rate-limit";
import { isAiConfigured } from "@/lib/ai/models";
import { runIngestion } from "@/lib/documents/job-runner";

const paramsSchema = z.object({ documentId: z.string().uuid() });

/** Ingestion renders one narrated reel per card (TTS + ffmpeg each), so a
 * document with many cards can take several minutes; allow up to 10. Hosts
 * with shorter serverless function limits (e.g. Vercel's default tier) may
 * need a queue-based worker for large documents — see docs/ARCHITECTURE.md. */
export const maxDuration = 600;

/**
 * Starts (or retries) ingestion for an owned document. The pipeline itself
 * guards against double-processing via a status-transition claim, so
 * concurrent calls are safe — the loser gets a 409.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`process:${auth.user.id}`, PROCESS_RATE_LIMIT);
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      `Too many processing requests. Try again in ${limit.retryAfterSeconds}s.`,
    );
  }

  try {
    const { documentId } = paramsSchema.parse(await ctx.params);

    if (!isAiConfigured()) {
      return apiError(
        "not_configured",
        "OpenAI is not configured (OPENAI_API_KEY missing), so documents can't be processed.",
      );
    }

    // Ownership check with the user's RLS-scoped client BEFORE the pipeline
    // touches anything with the service role.
    const { data: doc, error } = await auth.supabase
      .from("documents")
      .select("id, title, storage_path, status")
      .eq("id", documentId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return apiError("not_found", "Document not found.");
    if (!doc.storage_path) return apiError("conflict", "The document has no stored file.");

    const result = await runIngestion(documentId, doc.title, auth.user.id, doc.storage_path);
    if (result.status === "already_processing") {
      return apiError("conflict", "This document is already being processed.");
    }
    if (result.status === "failed") {
      // The failure is recorded on the document row; report it cleanly.
      return NextResponse.json({ result });
    }
    return NextResponse.json({ result });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
