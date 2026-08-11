import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEmbeddings, toVectorLiteral } from "@/lib/ai/models";
import { generateStudyContent } from "@/lib/ai/generate-cards";
import { extractPdfPages, PdfExtractionError } from "@/lib/documents/pdf";
import { renderSlidePng } from "@/lib/video/slide";
import { synthesizeNarration } from "@/lib/video/tts";
import { composeReel } from "@/lib/video/compose";
import { buildNarrationScript } from "@/lib/video/narration";
import { formatPageRange } from "@/lib/utils";
import {
  PipelineUserError,
  processDocument,
  type PipelineDb,
  type PipelineDeps,
  type PipelineResult,
  type RenderedVideo,
} from "@/lib/documents/pipeline";

/**
 * Inline job runner: processing executes inside the API route invocation
 * that triggered it (documented portfolio trade-off — a production system
 * would enqueue to a worker; only this file would change). The service-role
 * client is used because the pipeline runs after the route has verified the
 * document belongs to the authenticated user with an RLS-scoped client.
 */

type AdminClient = SupabaseClient<Database>;

function buildDb(admin: AdminClient, userId: string, documentId: string): PipelineDb {
  return {
    async claimDocument(documentId) {
      // Status-transition claim: only claimable when not already mid-flight.
      const { data, error } = await admin
        .from("documents")
        .update({ status: "extracting", processing_progress: 2, error_message: null })
        .eq("id", documentId)
        .eq("user_id", userId)
        .in("status", ["queued", "failed", "ready"])
        .select("id");
      if (error) throw new Error(`claim failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async updateDocument(documentId, patch) {
      const { error } = await admin
        .from("documents")
        .update({
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.processingProgress !== undefined
            ? { processing_progress: patch.processingProgress }
            : {}),
          ...(patch.errorMessage !== undefined ? { error_message: patch.errorMessage } : {}),
          ...(patch.pageCount !== undefined ? { page_count: patch.pageCount } : {}),
        })
        .eq("id", documentId)
        .eq("user_id", userId);
      if (error) throw new Error(`document update failed: ${error.message}`);
    },
    async deleteDerivedData(documentId) {
      // Video files from a prior partial run have no FK cascade (they live
      // in storage, not the DB), so remove them before the rows disappear.
      const { data: stale } = await admin
        .from("study_cards")
        .select("video_storage_path")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .not("video_storage_path", "is", null);
      const stalePaths = (stale ?? [])
        .map((row) => row.video_storage_path)
        .filter((p): p is string => Boolean(p));
      if (stalePaths.length > 0) {
        await admin.storage.from("documents").remove(stalePaths);
      }

      const cards = await admin
        .from("study_cards")
        .delete()
        .eq("document_id", documentId)
        .eq("user_id", userId);
      if (cards.error) throw new Error(`card cleanup failed: ${cards.error.message}`);
      const quiz = await admin
        .from("quiz_questions")
        .delete()
        .eq("document_id", documentId)
        .eq("user_id", userId);
      if (quiz.error) throw new Error(`quiz cleanup failed: ${quiz.error.message}`);
      const chunks = await admin
        .from("document_chunks")
        .delete()
        .eq("document_id", documentId)
        .eq("user_id", userId);
      if (chunks.error) throw new Error(`chunk cleanup failed: ${chunks.error.message}`);
    },
    async insertChunks(documentId, chunks) {
      const { data, error } = await admin
        .from("document_chunks")
        .insert(
          chunks.map((chunk) => ({
            document_id: documentId,
            user_id: userId,
            chunk_index: chunk.chunkIndex,
            page_start: chunk.pageStart,
            page_end: chunk.pageEnd,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding: chunk.embedding ? toVectorLiteral(chunk.embedding) : null,
          })),
        )
        .select("id, chunk_index");
      if (error) throw new Error(`chunk insert failed: ${error.message}`);
      return (data ?? []).map((row) => ({ id: row.id, chunkIndex: row.chunk_index }));
    },
    async insertCards(documentId, cards) {
      const { data, error } = await admin
        .from("study_cards")
        .insert(
          cards.map((card) => ({
            document_id: documentId,
            user_id: userId,
            card_type: card.card_type,
            topic: card.topic,
            title: card.title,
            explanation: card.explanation,
            question: card.question ?? null,
            answer: card.answer ?? null,
            takeaway: card.takeaway ?? null,
            difficulty: card.difficulty,
            source_chunk_ids: card.sourceChunkIds,
            source_excerpt: card.sourceExcerpt,
            page_start: card.pageStart,
            page_end: card.pageEnd,
          })),
        )
        .select("id");
      if (error) throw new Error(`card insert failed: ${error.message}`);
      // Postgres preserves array order through a single INSERT ... RETURNING,
      // so this lines up positionally with the `cards` array the pipeline passed in.
      return (data ?? []).map((row) => ({ id: row.id }));
    },
    async insertQuizQuestions(documentId, questions) {
      if (questions.length === 0) return;
      const { error } = await admin.from("quiz_questions").insert(
        questions.map((q, index) => ({
          document_id: documentId,
          user_id: userId,
          topic: q.topic,
          question: q.question,
          options: q.options,
          correct_index: q.correct_index,
          rationale: q.rationale,
          source_chunk_id: q.sourceChunkId || null,
          source_excerpt: q.sourceExcerpt,
          page_start: q.pageStart,
          page_end: q.pageEnd,
          position: index,
        })),
      );
      if (error) throw new Error(`quiz insert failed: ${error.message}`);
    },
    async saveCardVideo(cardId, video) {
      const storagePath = `${userId}/${documentId}/reels/${cardId}.mp4`;
      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(storagePath, video.mp4, { contentType: "video/mp4", upsert: true });
      if (uploadError) throw new Error(`video upload failed: ${uploadError.message}`);

      const { error } = await admin
        .from("study_cards")
        .update({
          video_storage_path: storagePath,
          video_duration_seconds: video.durationSeconds,
          narration_script: video.narrationScript,
        })
        .eq("id", cardId)
        .eq("user_id", userId);
      if (error) throw new Error(`card video update failed: ${error.message}`);
    },
  };
}

async function embedWithRetries(texts: string[]): Promise<number[][]> {
  const embeddings = getEmbeddings();
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await embeddings.embedDocuments(texts);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw new PipelineUserError(
    `Embedding the document failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}

const MAX_VIDEO_ATTEMPTS = 3;

/** Renders one card's reel: narration script → TTS → slide → ffmpeg compose. */
async function renderVideoWithRetries(
  card: Parameters<PipelineDeps["renderVideo"]>[0],
  documentTitle: string,
): Promise<RenderedVideo> {
  const narrationScript = buildNarrationScript(card);
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_VIDEO_ATTEMPTS; attempt++) {
    try {
      const [slidePng, narrationMp3] = await Promise.all([
        renderSlidePng({
          cardType: card.card_type,
          topic: card.topic,
          title: card.title,
          explanation: card.explanation,
          takeaway: card.takeaway ?? null,
          difficulty: card.difficulty,
          documentTitle,
          pageLabel: formatPageRange(card.pageStart, card.pageEnd),
        }),
        synthesizeNarration(narrationScript),
      ]);
      const { mp4, durationSeconds } = await composeReel(slidePng, narrationMp3);
      return { mp4, durationSeconds, narrationScript };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_VIDEO_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
      }
    }
  }
  throw new PipelineUserError(
    `Rendering "${card.title}" as a reel failed after ${MAX_VIDEO_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}

export async function runIngestion(
  documentId: string,
  documentTitle: string,
  userId: string,
  storagePath: string,
): Promise<PipelineResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { status: "failed", message: "Supabase is not configured." };
  }

  const deps: PipelineDeps = {
    db: buildDb(admin, userId, documentId),
    async downloadPdf() {
      const { data, error } = await admin.storage.from("documents").download(storagePath);
      if (error || !data) {
        throw new PipelineUserError("The stored PDF could not be read. Try uploading again.");
      }
      return data;
    },
    async extractPages(data) {
      try {
        return await extractPdfPages(data);
      } catch (err) {
        if (err instanceof PdfExtractionError) {
          throw new PipelineUserError(err.userMessage);
        }
        throw err;
      }
    },
    embedTexts: embedWithRetries,
    generateContent: generateStudyContent,
    renderVideo: renderVideoWithRetries,
  };

  return processDocument(documentId, documentTitle, deps);
}
