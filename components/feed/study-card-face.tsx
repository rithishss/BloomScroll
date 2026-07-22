"use client";

import { useState } from "react";
import { BookOpen, Eye, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CARD_TYPE_LABELS, DIFFICULTY_LABELS, type FeedItem } from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

const TYPE_VARIANT: Record<string, "leaf" | "blossom" | "pollen" | "forest" | "default"> = {
  concept: "leaf",
  key_point: "forest",
  example: "pollen",
  question: "blossom",
  memory_hook: "pollen",
};

/**
 * The visual face of a study card — shared by the swipeable feed stack and
 * the saved-cards grid, so a card looks identical everywhere.
 */
export function StudyCardFace({
  item,
  onViewSource,
  showReasons = true,
}: {
  item: FeedItem;
  onViewSource: () => void;
  showReasons?: boolean;
}) {
  const { card, reasons } = item;
  const [answerRevealed, setAnswerRevealed] = useState(false);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card">
      <div className="flex items-start justify-between gap-2 px-6 pt-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={TYPE_VARIANT[card.cardType] ?? "default"}>
            {CARD_TYPE_LABELS[card.cardType]}
          </Badge>
          <Badge variant="outline">{card.topic}</Badge>
          <Badge variant="default">{DIFFICULTY_LABELS[card.difficulty]}</Badge>
        </div>
        {showReasons && reasons.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Why this card?">
                <Info aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuLabel className="text-foreground text-sm font-medium">
                Why this card?
              </DropdownMenuLabel>
              <ul className="px-3 pb-2 text-xs text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r} className="flex gap-1.5 py-0.5">
                    <span aria-hidden>•</span> {r}
                  </li>
                ))}
              </ul>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h2 className="font-display text-xl font-semibold leading-snug sm:text-2xl">
          {card.title}
        </h2>
        <p className="mt-3 text-[0.95rem] leading-relaxed">{card.explanation}</p>

        {card.question ? (
          <div className="mt-4 rounded-xl border border-blossom/30 bg-blossom/8 p-4">
            <p className="text-sm font-medium">{card.question}</p>
            {answerRevealed && card.answer ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.answer}</p>
            ) : card.answer ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setAnswerRevealed(true)}
              >
                <Eye aria-hidden /> Reveal answer
              </Button>
            ) : null}
          </div>
        ) : null}

        {card.takeaway ? (
          <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm italic leading-relaxed">
            {card.takeaway}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3.5">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {card.documentTitle} · {formatPageRange(card.pageStart, card.pageEnd)}
        </p>
        <Button variant="ghost" size="sm" onClick={onViewSource} className="shrink-0">
          <BookOpen aria-hidden /> View source
        </Button>
      </div>
    </article>
  );
}
