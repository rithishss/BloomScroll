import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { ASK_RATE_LIMIT, checkRateLimit } from "@/lib/api/rate-limit";
import { answerFromChunks, rerankForDiversity, retrieveChunks } from "@/lib/ai/ask";
import { isAiConfigured } from "@/lib/ai/models";
import { askSchema } from "@/lib/validation/api";
import type { AskResult } from "@/lib/types";

export const maxDuration = 60;

/**
 * Ask Bloom (RAG): validates the question, confirms every requested
 * document belongs to the caller, retrieves owned chunks via the
 * ownership-scoped RPC, answers strictly from that context, and persists
 * the thread. Only retrieved chunks are sent to the model — never the PDF.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`ask:${auth.user.id}`, ASK_RATE_LIMIT);
  if (!limit.allowed) {
    return apiError(
      "rate_limited",
      `Slow down a little — try again in ${limit.retryAfterSeconds}s.`,
    );
  }

  try {
    const input = askSchema.parse(await request.json());

    if (!isAiConfigured()) {
      return apiError(
        "not_configured",
        "OpenAI is not configured (OPENAI_API_KEY missing), so Ask Bloom is unavailable.",
      );
    }

    // Every requested document must exist AND belong to the caller.
    const { data: ownedDocs, error: docsError } = await auth.supabase
      .from("documents")
      .select("id")
      .eq("user_id", auth.user.id)
      .in("id", input.documentIds);
    if (docsError) throw new Error(docsError.message);
    if ((ownedDocs ?? []).length !== input.documentIds.length) {
      return apiError("not_found", "One or more selected documents were not found.");
    }

    const retrieved = await retrieveChunks(auth.supabase, input.question, input.documentIds);
    const context = rerankForDiversity(retrieved, 6);
    const outcome = await answerFromChunks(input.question, context);

    // Persist the exchange.
    let threadId = input.threadId ?? null;
    if (threadId) {
      const { data: thread } = await auth.supabase
        .from("chat_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!thread) threadId = null;
    }
    if (!threadId) {
      const { data: created, error: threadError } = await auth.supabase
        .from("chat_threads")
        .insert({
          user_id: auth.user.id,
          title: input.question.slice(0, 64),
          selected_document_ids: input.documentIds,
        })
        .select("id")
        .single();
      if (threadError || !created) throw new Error(threadError?.message ?? "thread insert failed");
      threadId = created.id;
    } else {
      await auth.supabase
        .from("chat_threads")
        .update({ selected_document_ids: input.documentIds })
        .eq("id", threadId)
        .eq("user_id", auth.user.id);
    }

    const { error: messagesError } = await auth.supabase.from("chat_messages").insert([
      {
        thread_id: threadId,
        user_id: auth.user.id,
        role: "user",
        content: input.question,
        citations: [],
      },
      {
        thread_id: threadId,
        user_id: auth.user.id,
        role: "assistant",
        content: outcome.answer,
        citations: JSON.parse(JSON.stringify(outcome.citations)),
      },
    ]);
    if (messagesError) throw new Error(messagesError.message);

    const result: AskResult = {
      threadId,
      answer: outcome.answer,
      citations: outcome.citations,
      insufficientEvidence: outcome.insufficientEvidence,
    };
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorFromException(err);
  }
}
