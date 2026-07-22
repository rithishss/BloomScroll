import { z } from "zod";

/** Zod schemas for every API input. Routes parse before touching data. */

export const eventSchema = z.object({
  cardId: z.string().uuid(),
  eventType: z.enum([
    "impression",
    "understood",
    "review_again",
    "save",
    "unsave",
    "source_open",
    "skip",
  ]),
  dwellMs: z.number().int().nonnegative().max(3_600_000).nullish(),
});

export const feedQuerySchema = z.object({
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const askSchema = z.object({
  question: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(3, "Ask a longer question").max(500)),
  documentIds: z.array(z.string().uuid()).min(1, "Select at least one document").max(20),
  threadId: z.string().uuid().nullish(),
});

export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  studyGoal: z.enum(["understand", "exam", "memorize"]).optional(),
  preferredDifficulty: z.enum(["intro", "core", "advanced"]).optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const topicPutSchema = z.object({
  topic: z.string().trim().min(1).max(80),
  explicitWeight: z.number().min(0).max(1),
});

export const topicDeleteSchema = z.object({
  topic: z.string().trim().min(1).max(80),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export const chunksRequestSchema = z.object({
  chunkIds: z.array(z.string().uuid()).min(1).max(10),
});
