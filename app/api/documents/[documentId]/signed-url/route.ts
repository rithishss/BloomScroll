import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";

const paramsSchema = z.object({ documentId: z.string().uuid() });
const SIGNED_URL_TTL_SECONDS = 300;

/** Short-lived signed URL for the caller's own private PDF. */
export async function GET(_request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { documentId } = paramsSchema.parse(await ctx.params);
    const { data: doc, error } = await auth.supabase
      .from("documents")
      .select("storage_path")
      .eq("id", documentId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return apiError("not_found", "Document not found.");
    if (!doc.storage_path) {
      return NextResponse.json({
        url: null,
        note: "This document has no stored file, so a link can't be produced.",
      });
    }

    const { data: signed, error: signError } = await auth.supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) {
      return NextResponse.json({
        url: null,
        note: "A signed link couldn't be created right now. Please try again.",
      });
    }
    return NextResponse.json({ url: signed.signedUrl, note: null });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
