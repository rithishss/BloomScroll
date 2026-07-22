import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { buildFeedPage } from "@/lib/api/feed-service";
import { feedQuerySchema } from "@/lib/validation/api";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(request.url);
    const query = feedQuerySchema.parse({
      documentIds: url.searchParams.getAll("documentId").filter(Boolean),
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const page = await buildFeedPage(auth.supabase, auth.user.id, {
      documentIds:
        query.documentIds && query.documentIds.length > 0 ? query.documentIds : undefined,
      cursor: query.cursor,
      limit: query.limit,
    });
    return NextResponse.json(page);
  } catch (err) {
    return apiErrorFromException(err);
  }
}
