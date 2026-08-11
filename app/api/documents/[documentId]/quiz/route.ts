import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { mapQuizQuestion } from "@/lib/database/mappers";

const paramsSchema = z.object({ documentId: z.string().uuid() });

/** The caller's own quiz for one of their own documents (RLS-scoped). */
export async function GET(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { documentId } = paramsSchema.parse(await ctx.params);

    const { data: doc } = await auth.supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!doc) return apiError("not_found", "Document not found.");

    const { data, error } = await auth.supabase
      .from("quiz_questions")
      .select("*")
      .eq("document_id", documentId)
      .eq("user_id", auth.user.id)
      .order("position", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    return NextResponse.json({ questions: (data ?? []).map(mapQuizQuestion) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
