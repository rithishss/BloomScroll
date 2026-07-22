import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { mapMessage } from "@/lib/database/mappers";

const paramsSchema = z.object({ threadId: z.string().uuid() });

export async function GET(_request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { threadId } = paramsSchema.parse(await ctx.params);
    const { data: thread } = await auth.supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!thread) return apiError("not_found", "Thread not found.");

    const { data, error } = await auth.supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ messages: (data ?? []).map(mapMessage) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
