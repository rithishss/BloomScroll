import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { checkRateLimit, UPLOAD_RATE_LIMIT } from "@/lib/api/rate-limit";
import { listUserDocuments } from "@/lib/api/documents-service";
import { serverConfig } from "@/lib/config.server";
import { mapDocument } from "@/lib/database/mappers";
import { titleFromFilename, validatePdfUpload } from "@/lib/validation/upload";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const documents = await listUserDocuments(auth.supabase, auth.user.id);
    return NextResponse.json({ documents });
  } catch (err) {
    return apiErrorFromException(err);
  }
}

/**
 * Multipart upload. Validates extension, MIME, size, and the %PDF- header
 * server-side, stores the file privately at {userId}/{documentId}/{name},
 * and creates the queued document row. Processing is started by a separate
 * POST to /api/documents/:id/process so the upload response stays fast.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`upload:${auth.user.id}`, UPLOAD_RATE_LIMIT);
  if (!limit.allowed) {
    return apiError("rate_limited", `Too many uploads. Try again in ${limit.retryAfterSeconds}s.`);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError("bad_request", 'Send the PDF as multipart form field "file".');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validatePdfUpload({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: bytes.byteLength,
      headBytes: bytes.slice(0, 8),
      maxSizeBytes: serverConfig().maxPdfSizeBytes,
    });
    if (!validation.ok) {
      return apiError("bad_request", validation.message);
    }

    // Row first (owns the id), storage second, and the row is rolled back if
    // the storage write fails so no orphan records linger.
    const { data: doc, error: insertError } = await auth.supabase
      .from("documents")
      .insert({
        user_id: auth.user.id,
        title: titleFromFilename(validation.sanitizedFilename),
        original_filename: validation.sanitizedFilename,
        storage_path: "",
        file_size_bytes: bytes.byteLength,
        status: "queued",
        processing_progress: 0,
      })
      .select("*")
      .single();
    if (insertError || !doc) throw new Error(insertError?.message ?? "insert failed");

    const storagePath = `${auth.user.id}/${doc.id}/${validation.sanitizedFilename}`;
    const { error: uploadError } = await auth.supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      await auth.supabase.from("documents").delete().eq("id", doc.id);
      throw new Error(`storage upload failed: ${uploadError.message}`);
    }

    const { data: updated, error: pathError } = await auth.supabase
      .from("documents")
      .update({ storage_path: storagePath })
      .eq("id", doc.id)
      .select("*")
      .single();
    if (pathError || !updated) throw new Error(pathError?.message ?? "update failed");

    return NextResponse.json(
      { document: mapDocument(updated, { cardCount: 0, chunkCount: 0, topics: [] }) },
      { status: 201 },
    );
  } catch (err) {
    return apiErrorFromException(err);
  }
}
