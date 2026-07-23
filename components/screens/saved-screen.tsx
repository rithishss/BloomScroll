"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookOpen, Bookmark, Check, Play, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceDrawer } from "@/components/feed/source-drawer";
import { ReelModal } from "@/components/feed/reel-modal";
import { useDataProvider } from "@/lib/data/provider-context";
import {
  CARD_TYPE_LABELS,
  DIFFICULTY_LABELS,
  type CardType,
  type Difficulty,
  type FeedItem,
  type StudyCard,
} from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

export function SavedScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [sourceCard, setSourceCard] = useState<StudyCard | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [reelCard, setReelCard] = useState<StudyCard | null>(null);
  const [reelOpen, setReelOpen] = useState(false);

  const refresh = useCallback(() => {
    provider
      .listSavedCards()
      .then(setItems)
      .catch(() => {
        setItems([]);
        toast.error("Saved cards could not be loaded.");
      });
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const documents = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items ?? []) map.set(item.card.documentId, item.card.documentTitle);
    return [...map.entries()];
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (docFilter !== "all" && item.card.documentId !== docFilter) return false;
      if (typeFilter !== "all" && item.card.cardType !== (typeFilter as CardType)) return false;
      if (difficultyFilter !== "all" && item.card.difficulty !== (difficultyFilter as Difficulty))
        return false;
      if (
        q &&
        !`${item.card.title} ${item.card.topic} ${item.card.explanation}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, query, docFilter, typeFilter, difficultyFilter]);

  const act = async (item: FeedItem, eventType: "understood" | "review_again" | "unsave") => {
    try {
      await provider.recordEvent({ cardId: item.card.id, eventType });
      if (eventType === "unsave") {
        toast.success("Removed from saved");
        setItems((prev) => prev?.filter((i) => i.card.id !== item.card.id) ?? null);
      } else {
        toast.success(eventType === "understood" ? "Marked as understood" : "Queued for review");
        refresh();
      }
    } catch {
      toast.error("That action didn't save. Please try again.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl font-semibold">Saved cards</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Pressed flowers — cards you kept for later.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search
            className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved cards…"
            className="pl-10"
            aria-label="Search saved cards"
          />
        </div>
        <Select value={docFilter} onValueChange={setDocFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by document">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All documents</SelectItem>
            {documents.map(([id, title]) => (
              <SelectItem key={id} value={id}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36" aria-label="Filter by card type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-32" aria-label="Filter by difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered === null ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <Bookmark className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="font-display mt-3 text-lg font-semibold">
            {items && items.length > 0 ? "No cards match those filters" : "Nothing saved yet"}
          </h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {items && items.length > 0
              ? "Try widening the filters above."
              : "While studying the feed, press the bookmark button (or S) on any card worth keeping."}
          </p>
          {(!items || items.length === 0) && (
            <Button asChild className="mt-4">
              <Link href={`${basePath}/feed`}>Go to the feed</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => (
            <li
              key={item.card.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="leaf">{CARD_TYPE_LABELS[item.card.cardType]}</Badge>
                <Badge variant="outline">{item.card.topic}</Badge>
                <Badge>{DIFFICULTY_LABELS[item.card.difficulty]}</Badge>
              </div>
              <h2 className="font-display mt-3 text-lg font-semibold leading-snug">
                {item.card.title}
              </h2>
              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                {item.card.explanation}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {item.card.documentTitle} ·{" "}
                {formatPageRange(item.card.pageStart, item.card.pageEnd)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReelCard(item.card);
                    setReelOpen(true);
                  }}
                >
                  <Play aria-hidden /> Watch
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSourceCard(item.card);
                    setSourceOpen(true);
                  }}
                >
                  <BookOpen aria-hidden /> Source
                </Button>
                <Button variant="ghost" size="sm" onClick={() => act(item, "understood")}>
                  <Check aria-hidden /> Got it
                </Button>
                <Button variant="ghost" size="sm" onClick={() => act(item, "review_again")}>
                  <RotateCcw aria-hidden /> Review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={() => act(item, "unsave")}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SourceDrawer card={sourceCard} open={sourceOpen} onOpenChange={setSourceOpen} />
      <ReelModal card={reelCard} open={reelOpen} onOpenChange={setReelOpen} />
    </div>
  );
}
