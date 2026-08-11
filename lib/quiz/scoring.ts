import type { QuizQuestion } from "@/lib/types";

/**
 * Pure quiz scoring, kept out of the screen component so it can be unit
 * tested and reused by both providers. An "attempt" is a map of question id
 * → chosen option index; unanswered questions are simply absent.
 */

export type QuizAnswers = Record<string, number>;

export interface QuizResult {
  total: number;
  answered: number;
  correct: number;
  /** 0..1, over *all* questions — an unanswered question counts as wrong. */
  score: number;
  correctIds: string[];
  missedIds: string[];
  /** Topics with at least one wrong/unanswered question, most-missed first. */
  missedTopics: string[];
}

export function isCorrect(question: QuizQuestion, answer: number | undefined): boolean {
  return answer !== undefined && answer === question.correctIndex;
}

export function scoreQuiz(questions: QuizQuestion[], answers: QuizAnswers): QuizResult {
  const correctIds: string[] = [];
  const missedIds: string[] = [];
  const missesByTopic = new Map<string, number>();

  for (const question of questions) {
    if (isCorrect(question, answers[question.id])) {
      correctIds.push(question.id);
    } else {
      missedIds.push(question.id);
      missesByTopic.set(question.topic, (missesByTopic.get(question.topic) ?? 0) + 1);
    }
  }

  const answered = questions.filter((q) => answers[q.id] !== undefined).length;
  return {
    total: questions.length,
    answered,
    correct: correctIds.length,
    score: questions.length === 0 ? 0 : correctIds.length / questions.length,
    correctIds,
    missedIds,
    missedTopics: [...missesByTopic.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([topic]) => topic),
  };
}

/** The retry set: only the questions that were missed, in original order. */
export function missedQuestions(questions: QuizQuestion[], result: QuizResult): QuizQuestion[] {
  const missed = new Set(result.missedIds);
  return questions.filter((q) => missed.has(q.id));
}

/** Encouraging-but-honest summary line for the results screen. */
export function scoreHeadline(result: QuizResult): string {
  if (result.total === 0) return "No questions yet";
  const pct = Math.round(result.score * 100);
  if (pct === 100) return "Perfect — every question right";
  if (pct >= 80) return "Strong pass";
  if (pct >= 60) return "Getting there";
  return "Worth another look";
}
