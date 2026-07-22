import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { deleteDocumentCompletely, getDocumentDetail } from "@/lib/api/documents-service";

const paramsSchema = z.object({ documentId: z.string().uuid() });

export async function GET(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { documentId } = paramsSchema.parse(await ctx.params);
    const document = await getDocumentDetail(auth.supabase, auth.user.id, documentId);
    if (!document) return apiError("not_found", "Document not found.");
    return NextResponse.json({ document });
  } catch (err) {
    return apiErrorFromException(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { documentId } = paramsSchema.parse(await ctx.params);
    const deleted = await deleteDocumentCompletely(auth.supabase, auth.user.id, documentId);
    if (!deleted) return apiError("not_found", "Document not found.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
