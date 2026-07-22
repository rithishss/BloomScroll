import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiErrorFromException } from "@/lib/api/errors";
import { mapChunk } from "@/lib/database/mappers";
import { chunksRequestSchema } from "@/lib/validation/api";

/** Resolves stored source passages by id — RLS restricts to the owner. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { chunkIds } = chunksRequestSchema.parse(await request.json());
    const [chunksRes, docsRes] = await Promise.all([
      auth.supabase
        .from("document_chunks")
        .select("*")
        .eq("user_id", auth.user.id)
        .in("id", chunkIds),
      auth.supabase.from("documents").select("id, title").eq("user_id", auth.user.id),
    ]);
    if (chunksRes.error) throw new Error(chunksRes.error.message);
    const titles = new Map((docsRes.data ?? []).map((d) => [d.id, d.title]));
    return NextResponse.json({
      chunks: (chunksRes.data ?? []).map((row) =>
        mapChunk(row, titles.get(row.document_id) ?? "Untitled"),
      ),
    });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
