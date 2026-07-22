"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDataProvider } from "@/lib/data/provider-context";
import { CARD_TYPE_LABELS, DIFFICULTY_LABELS, type FeedItem } from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

/**
 * Cmd/Ctrl+K search across generated study cards. Selecting a result shows
 * the full card with its source excerpt inline, so search doubles as a quick
 * verification surface.
 */
export function SearchCommand({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = useDataProvider();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const requestSeq = useRef(0);

  const runSearch = useCallback(
    (q: string) => {
      const seq = ++requestSeq.current;
      if (q.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      provider
        .searchCards(q)
        .then((items) => {
          if (requestSeq.current === seq) setResults(items);
        })
        .catch(() => {
          if (requestSeq.current === seq) setResults([]);
        })
        .finally(() => {
          if (requestSeq.current === seq) setLoading(false);
        });
    },
    [provider],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (!open) {
      // Deferred a tick so the dialog's close animation doesn't visibly
      // flash a cleared search field, and so the reset runs outside the
      // effect's synchronous commit.
      queueMicrotask(() => {
        setQuery("");
        setResults([]);
        setSelected(null);
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{selected ? "Card detail" : "Search your cards"}</DialogTitle>
          <DialogDescription>
            {selected
              ? "Every card links back to real source text."
              : "Find any generated card by title, topic, or content."}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="overflow-y-auto px-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(null)}
              className="-ml-2 mb-3"
            >
              <ArrowLeft aria-hidden /> Back to results
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="leaf">{CARD_TYPE_LABELS[selected.card.cardType]}</Badge>
              <Badge variant="outline">{selected.card.topic}</Badge>
              <Badge variant="pollen">{DIFFICULTY_LABELS[selected.card.difficulty]}</Badge>
            </div>
            <h3 className="font-display mt-3 text-lg font-semibold">{selected.card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed">{selected.card.explanation}</p>
            {selected.card.takeaway ? (
              <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm italic">
                {selected.card.takeaway}
              </p>
            ) : null}
            <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Source — {selected.card.documentTitle},{" "}
                {formatPageRange(selected.card.pageStart, selected.card.pageEnd)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {selected.card.sourceExcerpt}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col px-6 py-4">
            <div className="relative">
              <Search
                className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards… e.g. scheduling, convolution"
                className="pl-10"
                aria-label="Search study cards"
              />
            </div>
            <div
              className="mt-3 min-h-40 overflow-y-auto"
              role="listbox"
              aria-label="Search results"
            >
              {loading ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  {query.trim().length < 2
                    ? "Type at least two characters to search."
                    : "No cards match that search."}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map((item) => (
                    <li key={item.card.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
                      >
                        <span className="text-sm font-medium">{item.card.title}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileText className="size-3" aria-hidden />
                          {item.card.documentTitle} · {item.card.topic} ·{" "}
                          {formatPageRange(item.card.pageStart, item.card.pageEnd)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
