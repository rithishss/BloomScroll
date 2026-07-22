import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { askAnswerSchema, validateChunkIndexes } from "@/lib/ai/schemas";
import { ASK_SYSTEM_PROMPT, formatChunksForPrompt } from "@/lib/ai/prompts";
import { getChatModel, getEmbeddings, toVectorLiteral } from "@/lib/ai/models";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import type { Citation } from "@/lib/types";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  similarity: number;
}

export interface AskOutcome {
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
}

const INSUFFICIENT_ANSWER =
  "Your uploaded material doesn't contain enough information to answer that confidently. Try rephrasing, or ask about a topic the selected documents cover.";

/**
 * Retrieval step: embeds the question and calls the ownership-scoped
 * match_document_chunks RPC (RLS + explicit auth.uid() filter server-side).
 */
export async function retrieveChunks(
  supabase: TypedSupabaseClient,
  question: string,
  documentIds: string[],
): Promise<RetrievedChunk[]> {
  const embeddings = getEmbeddings();
  const queryEmbedding = await embeddings.embedQuery(question);
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: toVectorLiteral(queryEmbedding),
    selected_document_ids: documentIds,
    match_threshold: 0.15,
    match_count: 8,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    content: row.content,
    similarity: row.similarity,
  }));
}

/**
 * Light rerank: keep similarity order but make sure no single document
 * monopolizes the context when several documents matched.
 */
export function rerankForDiversity(chunks: RetrievedChunk[], max = 6): RetrievedChunk[] {
  const result: RetrievedChunk[] = [];
  const perDoc = new Map<string, number>();
  const remaining = [...chunks];
  while (result.length < max && remaining.length > 0) {
    let picked = remaining.findIndex((c) => (perDoc.get(c.documentId) ?? 0) < 3);
    if (picked === -1) picked = 0;
    const [chunk] = remaining.splice(picked, 1);
    perDoc.set(chunk.documentId, (perDoc.get(chunk.documentId) ?? 0) + 1);
    result.push(chunk);
  }
  return result;
}

function toCitation(chunk: RetrievedChunk): Citation {
  const excerpt = chunk.content.replace(/\s+/g, " ").trim();
  return {
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    chunkId: chunk.chunkId,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    excerpt: excerpt.length > 240 ? `${excerpt.slice(0, 240)}…` : excerpt,
  };
}

/** Generation step: answers strictly from the provided chunks. */
export async function answerFromChunks(
  question: string,
  chunks: RetrievedChunk[],
): Promise<AskOutcome> {
  if (chunks.length === 0) {
    return { answer: INSUFFICIENT_ANSWER, citations: [], insufficientEvidence: true };
  }

  const model = getChatModel({ temperature: 0.2 }).withStructuredOutput(askAnswerSchema, {
    name: "grounded_answer",
  });
  const result = await model.invoke([
    new SystemMessage(ASK_SYSTEM_PROMPT),
    new HumanMessage(
      `Question: ${question}\n\nNumbered source passages:\n\n${formatChunksForPrompt(chunks)}`,
    ),
  ]);

  if (!result.answer.trim()) {
    return { answer: INSUFFICIENT_ANSWER, citations: [], insufficientEvidence: true };
  }
  if (result.insufficient_evidence) {
    return { answer: result.answer, citations: [], insufficientEvidence: true };
  }

  const citedIndexes = validateChunkIndexes(result.cited_chunk_indexes, chunks.length)
    ? [...new Set(result.cited_chunk_indexes)]
    : [];
  // A grounded answer with zero valid citations is not trustworthy — fall
  // back to citing the retrieval set rather than presenting uncited claims.
  const cited = citedIndexes.length > 0 ? citedIndexes.map((i) => chunks[i]) : chunks.slice(0, 3);

  return {
    answer: result.answer,
    citations: cited.map(toCitation),
    insufficientEvidence: false,
  };
}
