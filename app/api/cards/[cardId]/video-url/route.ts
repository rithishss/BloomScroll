import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";

const paramsSchema = z.object({ cardId: z.string().uuid() });
const SIGNED_URL_TTL_SECONDS = 300;

/** Short-lived signed URL for the caller's own rendered reel. */
export async function GET(_request: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { cardId } = paramsSchema.parse(await ctx.params);
    const { data: card, error } = await auth.supabase
      .from("study_cards")
      .select("video_storage_path")
      .eq("id", cardId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!card) return apiError("not_found", "Card not found.");
    if (!card.video_storage_path) {
      return NextResponse.json({ url: null, note: "This card's reel hasn't finished rendering yet." });
    }

    const { data: signed, error: signError } = await auth.supabase.storage
      .from("documents")
      .createSignedUrl(card.video_storage_path, SIGNED_URL_TTL_SECONDS);
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
