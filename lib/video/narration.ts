import type { GeneratedCard } from "@/lib/ai/schemas";

/**
 * Builds the spoken narration script for a card's reel. Deliberately reuses
 * the same generated text the on-screen slide shows (explanation + optional
 * takeaway) rather than asking the model for a second, separate script —
 * one fewer LLM call, and the captions always match what's spoken verbatim.
 */
export function buildNarrationScript(card: Pick<GeneratedCard, "explanation" | "takeaway">): string {
  const parts = [card.explanation.trim()];
  if (card.takeaway) parts.push(card.takeaway.trim());
  return parts.join(" ");
}
