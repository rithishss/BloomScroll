import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { recordCardEvent } from "@/lib/api/events-service";
import { eventSchema } from "@/lib/validation/api";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const input = eventSchema.parse(await request.json());
    const state = await recordCardEvent(auth.supabase, auth.user.id, input);
    if (state === null) return apiError("not_found", "Card not found.");
    return NextResponse.json({ state });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
