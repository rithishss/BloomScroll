import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  cardBatchSchema,
  dedupeCards,
  hasDistinctOptions,
  validateChunkIndexes,
  type GeneratedCard,
  type GeneratedQuizQuestion,
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

export interface GeneratedQuizQuestionWithSource extends GeneratedQuizQuestion {
  sourceChunkId: string;
  sourceExcerpt: string;
  pageStart: number;
  pageEnd: number;
}

/** Cards and their quiz come from one model call over one set of passages. */
export interface GeneratedContent {
  cards: GeneratedCardWithSource[];
  quiz: GeneratedQuizQuestionWithSource[];
}

const MAX_ATTEMPTS = 3;
const MAX_CHUNKS_FOR_GENERATION = 24;
const MAX_CARDS = 30;
const MAX_QUIZ_QUESTIONS = 12;
/** Roughly one question per three cards. */
const CARDS_PER_QUESTION = 3;

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
 * Structured generation with bounded retries, producing a document's study
 * cards *and* its quiz in a single model call so both are grounded in the
 * same passages. Output is only accepted when it parses against the Zod
 * schema AND every card cites in-range chunks; anything else triggers a
 * retry, then a hard failure the pipeline records on the document.
 *
 * Quiz questions are validated more leniently than cards: an unusable
 * question (out-of-range citation, duplicate options) is dropped rather
 * than failing the batch, since a document with good cards and a short
 * quiz is far more useful than a failed document.
 */
export async function generateStudyContent(chunks: GenerationChunk[]): Promise<GeneratedContent> {
  if (chunks.length === 0) return { cards: [], quiz: [] };
  const usable = chunks.slice(0, MAX_CHUNKS_FOR_GENERATION);

  const targetCount = Math.max(12, Math.min(MAX_CARDS, Math.round(usable.length * 1.4)));
  const targetQuestions = Math.min(
    MAX_QUIZ_QUESTIONS,
    Math.max(5, Math.round(targetCount / CARDS_PER_QUESTION)),
  );
  const model = getChatModel({ temperature: 0.5 }).withStructuredOutput(cardBatchSchema, {
    name: "study_content",
  });

  const userPrompt = `Create ${targetCount} study cards (±20%) and ${targetQuestions} quiz questions from these numbered source passages.\n\n${formatChunksForPrompt(usable)}`;

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
      const cards = deduped.map((card) => {
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

      const quiz = (result.quiz ?? [])
        .filter(
          (q) =>
            validateChunkIndexes([q.source_chunk_index], usable.length) && hasDistinctOptions(q),
        )
        .slice(0, MAX_QUIZ_QUESTIONS)
        .map((q) => {
          const chunk = usable[q.source_chunk_index];
          return {
            ...q,
            sourceChunkId: chunk.id,
            sourceExcerpt: excerptFromChunk(chunk),
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
          };
        });

      return { cards, quiz };
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
