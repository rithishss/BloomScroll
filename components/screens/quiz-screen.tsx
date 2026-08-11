"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, RotateCcw, X } from "lucide-react";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/lib/data/provider-context";
import {
  isCorrect,
  missedQuestions,
  scoreHeadline,
  scoreQuiz,
  type QuizAnswers,
} from "@/lib/quiz/scoring";
import type { QuizQuestion } from "@/lib/types";
import { cn, formatPageRange } from "@/lib/utils";

type Phase = "loading" | "error" | "empty" | "answering" | "results";

/**
 * One document's quiz: answer, see the source behind anything you miss,
 * score at the end, and optionally retry just the missed questions.
 * Deliberately reuses the app's existing screen shell (aurora background,
 * card surfaces, badges, button variants) rather than introducing a
 * separate visual language.
 */
export function QuizScreen({ basePath, documentId }: { basePath: string; documentId: string }) {
  const provider = useDataProvider();
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [round, setRound] = useState<QuizQuestion[]>([]);
  const [documentTitle, setDocumentTitle] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [revealed, setRevealed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const [questions, doc] = await Promise.all([
          provider.getQuiz(documentId),
          provider.getDocument(documentId).catch(() => null),
        ]);
        if (cancelled) return;
        setDocumentTitle(doc?.title ?? "");
        setAllQuestions(questions);
        setRound(questions);
        setPhase(questions.length === 0 ? "empty" : "answering");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, documentId]);

  const current = round[index];
  const chosen = current ? answers[current.id] : undefined;

  const finish = useCallback(
    (finalAnswers: QuizAnswers) => {
      setPhase("results");
      // Only a full run feeds ranking. A retry round covers just the missed
      // subset, so counting it again would double-weight those topics.
      if (isRetry) return;
      const result = scoreQuiz(round, finalAnswers);
      if (result.missedTopics.length > 0) {
        provider.recordQuizResult({ missedTopics: result.missedTopics }).catch(() => {
          /* ranking feedback is best-effort; the score still stands */
        });
      }
    },
    [provider, round, isRetry],
  );

  const choose = (optionIndex: number) => {
    if (!current || revealed) return;
    setAnswers((prev) => ({ ...prev, [current.id]: optionIndex }));
    setRevealed(true);
  };

  const next = () => {
    if (index + 1 < round.length) {
      setIndex(index + 1);
      setRevealed(false);
    } else {
      finish(answers);
    }
  };

  const restart = (questions: QuizQuestion[], retry: boolean) => {
    setRound(questions);
    setAnswers({});
    setIndex(0);
    setRevealed(false);
    setIsRetry(retry);
    setPhase("answering");
  };

  const backLink = (
    <Link
      href={`${basePath}/library/${documentId}`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> {documentTitle || "Document"}
    </Link>
  );

  if (phase === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-6 h-8 w-64" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">This quiz could not be loaded.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`${basePath}/library/${documentId}`}>Back to document</Link>
        </Button>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
        {backLink}
        <div className="mt-10 flex flex-col items-center text-center">
          <BloomMark className="size-12 text-leaf" progress={0.3} />
          <h1 className="font-display mt-4 text-xl font-semibold">No quiz for this document</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {provider.mode === "demo"
              ? "Quiz questions are generated during real processing. The two seeded demo documents each have one — this document was uploaded in the demo workspace, where processing is simulated."
              : "This document was processed before quizzes existed, or generation produced no usable questions. Reprocess it from the document page to generate a quiz."}
          </p>
          <Button asChild className="mt-5">
            <Link href={`${basePath}/library/${documentId}`}>Back to document</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    const result = scoreQuiz(round, answers);
    const missed = missedQuestions(round, result);
    return (
      <div className="bloom-aurora min-h-full">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
          {backLink}

          <div className="mt-4 rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
            <BloomMark className="mx-auto size-12 text-leaf" progress={result.score} />
            <h1 className="font-display mt-4 text-2xl font-semibold">{scoreHeadline(result)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.correct} of {result.total} correct
              {isRetry ? " on the retry" : ""}
            </p>
            <Progress value={result.score * 100} className="mx-auto mt-4 max-w-xs" />

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {missed.length > 0 && (
                <Button onClick={() => restart(missed, true)}>
                  <RotateCcw aria-hidden /> Retry {missed.length} missed
                </Button>
              )}
              <Button variant="outline" onClick={() => restart(allQuestions, false)}>
                Retake full quiz
              </Button>
              <Button asChild variant="ghost">
                <Link href={`${basePath}/feed`}>Back to feed</Link>
              </Button>
            </div>

            {!isRetry && result.missedTopics.length > 0 && (
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                {result.missedTopics.join(", ")} will show up more often in your feed.
              </p>
            )}
          </div>

          <section className="mt-6">
            <h2 className="font-display text-lg font-semibold">Review</h2>
            <ul className="mt-3 space-y-3">
              {round.map((question) => {
                const correct = isCorrect(question, answers[question.id]);
                return (
                  <li
                    key={question.id}
                    className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                          correct ? "bg-leaf/15 text-leaf" : "bg-destructive/15 text-destructive",
                        )}
                        aria-hidden
                      >
                        {correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{question.question}</p>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          <span className="sr-only">{correct ? "Correct" : "Incorrect"}. </span>
                          Answer: {question.options[question.correctIndex]}
                        </p>
                        {!correct && (
                          <QuestionSource question={question} className="mt-3" />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  // ── answering ──────────────────────────────────────────────────────
  if (!current) return null;
  const answeredCorrectly = isCorrect(current, chosen);

  return (
    <div className="bloom-aurora min-h-full">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
        {backLink}

        <header className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold">
              {isRetry ? "Retrying missed questions" : "Quiz"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Question {index + 1} of {round.length}
            </p>
          </div>
          <Badge variant="outline">{current.topic}</Badge>
        </header>

        <Progress value={((index + (revealed ? 1 : 0)) / round.length) * 100} className="mt-3" />

        <div className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-base font-medium leading-relaxed">{current.question}</h2>

          <ul className="mt-4 space-y-2">
            {current.options.map((option, optionIndex) => {
              const isChosen = chosen === optionIndex;
              const isAnswer = optionIndex === current.correctIndex;
              const showAsCorrect = revealed && isAnswer;
              const showAsWrong = revealed && isChosen && !isAnswer;
              return (
                <li key={optionIndex}>
                  <button
                    type="button"
                    onClick={() => choose(optionIndex)}
                    disabled={revealed}
                    aria-pressed={isChosen}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      !revealed && "cursor-pointer hover:bg-surface",
                      revealed && "cursor-default",
                      showAsCorrect && "border-leaf bg-leaf/10",
                      showAsWrong && "border-destructive bg-destructive/10",
                      !showAsCorrect && !showAsWrong && "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold",
                        showAsCorrect && "border-leaf bg-leaf text-white",
                        showAsWrong && "border-destructive bg-destructive text-white",
                        !showAsCorrect && !showAsWrong && "border-border text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {showAsCorrect ? (
                        <Check className="size-3" />
                      ) : showAsWrong ? (
                        <X className="size-3" />
                      ) : (
                        String.fromCharCode(65 + optionIndex)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {revealed && (
            <div className="mt-5 border-t border-border pt-4">
              <p
                className={cn(
                  "text-sm font-medium",
                  answeredCorrectly ? "text-leaf" : "text-destructive",
                )}
                role="status"
              >
                {answeredCorrectly ? "Correct" : "Not quite"}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {current.rationale}
              </p>
              {!answeredCorrectly && <QuestionSource question={current} className="mt-4" />}

              <Button className="mt-5 w-full sm:w-auto" onClick={next}>
                {index + 1 < round.length ? "Next question" : "See results"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The passage a question came from — shown when the answer was wrong, so
 * "incorrect" always comes with the source rather than just a verdict. */
function QuestionSource({ question, className }: { question: QuizQuestion; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background/60 p-4", className)}>
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <BookOpen className="size-3.5" aria-hidden /> From your notes ·{" "}
        {formatPageRange(question.pageStart, question.pageEnd)}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {question.sourceExcerpt}
      </p>
    </div>
  );
}
