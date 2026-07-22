import type { Citation, SourceChunk } from "@/lib/types";

/**
 * Demo-mode retrieval: honest lexical search over the seeded chunks. There
 * is no model behind this — answers are extractive (sentences pulled from
 * the matched source text), which is exactly what the demo advertises.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "has",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface ScoredChunk {
  chunk: SourceChunk;
  score: number;
}

/**
 * TF/rarity-weighted overlap scoring. A term matching in fewer chunks is
 * worth more; the score is normalized by query length so thresholds are
 * stable across short and long questions.
 */
export function scoreChunks(question: string, chunks: SourceChunk[]): ScoredChunk[] {
  const queryTerms = [...new Set(tokenize(question))];
  if (queryTerms.length === 0) return [];

  const chunkTokens = chunks.map((c) => tokenize(c.content));
  const docFreq = new Map<string, number>();
  for (const term of queryTerms) {
    docFreq.set(term, chunkTokens.filter((tokens) => tokens.includes(term)).length);
  }

  return chunks
    .map((chunk, i) => {
      const tokens = chunkTokens[i];
      let score = 0;
      for (const term of queryTerms) {
        const tf = tokens.filter((t) => t === term).length;
        if (tf > 0) {
          const rarity = 1 / (1 + (docFreq.get(term) ?? 0));
          score += Math.min(tf, 3) * rarity;
        }
      }
      return { chunk, score: score / queryTerms.length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Minimum normalized score for the demo to claim it found evidence. */
export const DEMO_EVIDENCE_THRESHOLD = 0.09;

export interface DemoAnswer {
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
}

/**
 * Finds the best-matching sentence and returns it plus the following
 * `count - 1` sentences, in original order. A contiguous window (rather
 * than the top-N scoring sentences reordered) guarantees the joined excerpt
 * is an exact substring of the stored chunk — never a reshuffled collage.
 */
function bestSentences(content: string, question: string, count: number): string[] {
  const queryTerms = new Set(tokenize(question));
  const body = content.includes("\n\n") ? content.slice(content.indexOf("\n\n") + 2) : content;
  const sentences = body.split(/(?<=[.!?]) /);
  const scored = sentences.map((sentence, index) => ({
    index,
    hits: tokenize(sentence).filter((t) => queryTerms.has(t)).length,
  }));
  const best = scored.reduce((a, b) => (b.hits > a.hits ? b : a), scored[0]);
  if (!best || best.hits === 0) return [];
  return sentences.slice(best.index, best.index + count).map((s) => s.trim());
}

/**
 * Builds an extractive, cited answer from the top-matching chunks. Used by
 * the demo provider's Ask Bloom implementation.
 */
export function buildDemoAnswer(question: string, chunks: SourceChunk[]): DemoAnswer {
  const scored = scoreChunks(question, chunks);
  const top = scored.filter((s) => s.score >= DEMO_EVIDENCE_THRESHOLD).slice(0, 4);

  if (top.length === 0) {
    return {
      answer:
        "Your selected notes don't contain enough information to answer that confidently. Try rephrasing, or ask about a topic covered in the selected documents.",
      citations: [],
      insufficientEvidence: true,
    };
  }

  const lines: string[] = [];
  const citations: Citation[] = [];
  top.forEach(({ chunk }, i) => {
    const sentences = bestSentences(chunk.content, question, 2);
    if (sentences.length === 0) return;
    citations.push({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkId: chunk.id,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      excerpt: sentences.join(" "),
    });
    lines.push(`${sentences.join(" ")} [${i + 1}]`);
  });

  if (citations.length === 0) {
    return {
      answer:
        "Your selected notes don't contain enough information to answer that confidently. Try rephrasing, or ask about a topic covered in the selected documents.",
      citations: [],
      insufficientEvidence: true,
    };
  }

  const answer = `From your notes:\n\n${lines.map((l) => `• ${l}`).join("\n\n")}`;
  return { answer, citations, insufficientEvidence: false };
}
