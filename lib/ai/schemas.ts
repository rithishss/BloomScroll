import { z } from "zod";

/**
 * Zod schemas for structured AI output. Generation is only accepted when it
 * parses; malformed output triggers a bounded retry in the pipeline.
 *
 * Design note: the model references source material by *index into the chunk
 * list we provided* — never by database id and never by quoting excerpts.
 * The server resolves indexes to real chunk rows and derives the stored
 * excerpt from the actual chunk text, so citations cannot be fabricated.
 */

export const cardTypeEnum = z.enum(["concept", "key_point", "example", "question", "memory_hook"]);
export const difficultyEnum = z.enum(["intro", "core", "advanced"]);

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const generatedCardSchema = z.object({
  card_type: cardTypeEnum,
  topic: z.string().min(2).max(60).describe("Short topic label, e.g. 'CPU Scheduling'"),
  title: z.string().min(3).max(90),
  explanation: z.string().refine((s) => wordCount(s) >= 25 && wordCount(s) <= 160, {
    message: "Explanation should be roughly 40–120 words",
  }),
  question: z.string().max(300).nullish().describe("Only for question cards"),
  answer: z.string().max(500).nullish().describe("Only for question cards"),
  takeaway: z.string().max(200).nullish().describe("One-line takeaway or memory hook"),
  difficulty: difficultyEnum,
  source_chunk_indexes: z
    .array(z.number().int().nonnegative())
    .min(1)
    .max(4)
    .describe("Indexes into the provided chunk list that support this card"),
});

export type GeneratedCard = z.infer<typeof generatedCardSchema>;

export const cardBatchSchema = z.object({
  cards: z.array(generatedCardSchema).min(1).max(40),
});

export type CardBatch = z.infer<typeof cardBatchSchema>;

/** RAG answer: citations are also index-based for the same reason. */
export const askAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  insufficient_evidence: z
    .boolean()
    .describe("True when the provided material does not contain enough information"),
  cited_chunk_indexes: z.array(z.number().int().nonnegative()).max(8),
});

export type AskAnswer = z.infer<typeof askAnswerSchema>;

/**
 * Validates that model-provided chunk indexes actually point into the context
 * that was supplied; out-of-range citations invalidate the batch.
 */
export function validateChunkIndexes(indexes: number[], chunkCount: number): boolean {
  return indexes.every((i) => Number.isInteger(i) && i >= 0 && i < chunkCount);
}

/**
 * Near-duplicate card detection used by the pipeline before storing cards.
 * Token-set Jaccard similarity over title+explanation.
 */
export function cardSimilarity(
  a: { title: string; explanation: string },
  b: { title: string; explanation: string },
): number {
  const tokens = (c: { title: string; explanation: string }) =>
    new Set(
      `${c.title} ${c.explanation}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

/** Removes near-identical cards, keeping the earlier occurrence. */
export function dedupeCards<T extends { title: string; explanation: string }>(cards: T[]): T[] {
  const kept: T[] = [];
  for (const card of cards) {
    const dup = kept.some((k) => cardSimilarity(k, card) >= DUPLICATE_SIMILARITY_THRESHOLD);
    if (!dup) kept.push(card);
  }
  return kept;
}
