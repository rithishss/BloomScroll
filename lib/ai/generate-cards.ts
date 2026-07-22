import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  cardBatchSchema,
  dedupeCards,
  validateChunkIndexes,
  type GeneratedCard,
} from "@/lib/ai/schemas";
import { CARD_GENERATION_SYSTEM_PROMPT, formatChunksForPrompt } from "@/lib/ai/prompts";
import { getChatModel } from "@/lib/ai/models";

export interface GenerationChunk {
  id: string;
  content: string;
  pageStart: number;
  pageEnd: number;
}

export interface GeneratedCardWithSource extends GeneratedCard {
  sourceChunkIds: string[];
  sourceExcerpt: string;
  pageStart: number;
  pageEnd: number;
}

const MAX_ATTEMPTS = 3;
const MAX_CHUNKS_FOR_GENERATION = 24;
const MAX_CARDS = 30;

/** The stored excerpt is derived from the actual chunk text (never model
 * output), so the source drawer always shows genuine extracted source. */
function excerptFromChunk(chunk: GenerationChunk): string {
  const text = chunk.content.replace(/\s+/g, " ").trim();
  if (text.length <= 320) return text;
  const cut = text.slice(0, 320);
  const lastSentence = cut.lastIndexOf(". ");
  return lastSentence > 140 ? cut.slice(0, lastSentence + 1) : `${cut}…`;
}

/**
 * Structured card generation with bounded retries. Output is only accepted
 * when it parses against the Zod schema AND every card cites in-range
 * chunks; anything else triggers a retry, then a hard failure the pipeline
 * records on the document.
 */
export async function generateStudyCards(
  chunks: GenerationChunk[],
): Promise<GeneratedCardWithSource[]> {
  if (chunks.length === 0) return [];
  const usable = chunks.slice(0, MAX_CHUNKS_FOR_GENERATION);

  const targetCount = Math.max(12, Math.min(MAX_CARDS, Math.round(usable.length * 1.4)));
  const model = getChatModel({ temperature: 0.5 }).withStructuredOutput(cardBatchSchema, {
    name: "study_cards",
  });

  const userPrompt = `Create ${targetCount} study cards (±20%) from these numbered source passages.\n\n${formatChunksForPrompt(usable)}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.invoke([
        new SystemMessage(CARD_GENERATION_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ]);

      const valid = result.cards.filter((card) =>
        validateChunkIndexes(card.source_chunk_indexes, usable.length),
      );
      if (valid.length === 0) {
        throw new Error("Model produced no cards with valid source references.");
      }

      const deduped = dedupeCards(valid).slice(0, MAX_CARDS);
      return deduped.map((card) => {
        const sourceChunks = card.source_chunk_indexes
          .map((i) => usable[i])
          .filter((c): c is GenerationChunk => c !== undefined);
        const pageStart = Math.min(...sourceChunks.map((c) => c.pageStart));
        const pageEnd = Math.max(...sourceChunks.map((c) => c.pageEnd));
        return {
          ...card,
          sourceChunkIds: sourceChunks.map((c) => c.id),
          sourceExcerpt: excerptFromChunk(sourceChunks[0]),
          pageStart,
          pageEnd,
        };
      });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** (attempt - 1)));
      }
    }
  }
  throw new Error(
    `Card generation failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : "invalid structured output"
    }`,
  );
}
