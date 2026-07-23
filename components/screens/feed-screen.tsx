"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { CardStack, type CardAction } from "@/components/feed/card-stack";
import { SourceDrawer } from "@/components/feed/source-drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/lib/data/provider-context";
import type { DocumentSummary, FeedItem, StudyCard } from "@/lib/types";
import { cn } from "@/lib/utils";

const SESSION_GOAL = 10;

/**
 * The feed: a personalized, swipeable queue of narrated video reels. Pages
 * are pulled lazily from the provider; reels acted on in this session never
 * reappear until the queue is exhausted and the user explicitly starts a
 * new round.
 */
export function FeedScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [filterDocId, setFilterDocId] = useState<string | null>(null);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studied, setStudied] = useState(0);
  const [sourceCard, setSourceCard] = useState<StudyCard | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const consumedRef = useRef<Set<string>>(new Set());
  const inFlightEvents = useRef<Set<string>>(new Set());
  const [round, setRound] = useState(0);

  const documentIds = useMemo(() => (filterDocId ? [filterDocId] : undefined), [filterDocId]);

  const loadPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      const page = await provider.getFeed({ documentIds, cursor, limit: 8 });
      const fresh = page.items.filter((item) => !consumedRef.current.has(item.card.id));
      setQueue((prev) => {
        const base = replace ? [] : prev;
        const existing = new Set(base.map((i) => i.card.id));
        return [...base, ...fresh.filter((i) => !existing.has(i.card.id))];
      });
      setNextCursor(page.nextCursor);
    },
    [provider, documentIds],
  );

  // Initial + filter/round change load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      consumedRef.current = new Set();
      try {
        const [docs, page] = await Promise.all([
          provider.listDocuments(),
          provider.getFeed({ documentIds, limit: 8 }),
        ]);
        if (cancelled) return;
        setDocuments(docs);
        setQueue(page.items);
        setNextCursor(page.nextCursor);
      } catch {
        if (!cancelled) setError("The feed could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, documentIds, round]);

  // Prefetch when the visible queue runs low.
  useEffect(() => {
    if (!loading && queue.length > 0 && queue.length < 3 && nextCursor) {
      loadPage(nextCursor, false).catch(() => {
        /* next page failures are silent; the current queue still works */
      });
    }
  }, [queue.length, nextCursor, loading, loadPage]);

  const recordEvent = useCallback(
    async (
      cardId: string,
      eventType: Parameters<typeof provider.recordEvent>[0]["eventType"],
      dwellMs?: number,
    ) => {
      // One in-flight event per (card, type) — rapid swipes can't double-send.
      const key = `${cardId}:${eventType}`;
      if (inFlightEvents.current.has(key)) return null;
      inFlightEvents.current.add(key);
      try {
        return await provider.recordEvent({ cardId, eventType, dwellMs: dwellMs ?? null });
      } finally {
        inFlightEvents.current.delete(key);
      }
    },
    [provider],
  );

  const handleAction = useCallback(
    (item: FeedItem, action: CardAction, dwellMs: number) => {
      consumedRef.current.add(item.card.id);
      recordEvent(item.card.id, action, dwellMs)?.catch(() =>
        toast.error("That action didn't save. Check your connection."),
      );
      setStudied((n) => n + 1);
      // Advance after the exit animation has had a beat to start.
      setTimeout(() => {
        setQueue((prev) => prev.filter((q) => q.card.id !== item.card.id));
      }, 60);
    },
    [recordEvent],
  );

  const handleToggleSave = useCallback(
    (item: FeedItem) => {
      const currentlySaved = item.state?.saved ?? false;
      const eventType = currentlySaved ? "unsave" : "save";
      recordEvent(item.card.id, eventType)
        ?.then((state) => {
          setQueue((prev) =>
            prev.map((q) => (q.card.id === item.card.id ? { ...q, state: state ?? q.state } : q)),
          );
          toast.success(currentlySaved ? "Removed from saved" : "Saved for later");
        })
        .catch(() => toast.error("Could not update saved state."));
    },
    [recordEvent],
  );

  const handleImpression = useCallback(
    (item: FeedItem) => {
      recordEvent(item.card.id, "impression")?.catch(() => {
        /* impressions are best-effort */
      });
    },
    [recordEvent],
  );

  const handleViewSource = useCallback(
    (item: FeedItem) => {
      setSourceCard(item.card);
      setSourceOpen(true);
      recordEvent(item.card.id, "source_open")?.catch(() => {
        /* best-effort */
      });
    },
    [recordEvent],
  );

  const readyDocs = (documents ?? []).filter((d) => d.status === "ready" && d.cardCount > 0);
  const bloomProgress = Math.min(1, studied / SESSION_GOAL);

  return (
    <div className="bloom-aurora min-h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-4 sm:py-8">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Today&apos;s feed</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {studied === 0
                ? "Cards picked for you — swipe or use the buttons."
                : `${studied} card${studied === 1 ? "" : "s"} studied this session`}
            </p>
          </div>
          <div className="flex items-center gap-2" aria-hidden>
            <BloomMark className="size-9 text-leaf" progress={bloomProgress} />
          </div>
        </header>

        {/* Document filter chips — a single scrollable row so it never wraps
            to a second line and eats into the card's vertical space. */}
        {readyDocs.length > 0 && (
          <div
            className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label="Filter by document"
          >
            <FilterChip active={filterDocId === null} onClick={() => setFilterDocId(null)}>
              All documents
            </FilterChip>
            {readyDocs.map((doc) => (
              <FilterChip
                key={doc.id}
                active={filterDocId === doc.id}
                onClick={() => setFilterDocId(doc.id)}
              >
                {doc.title}
              </FilterChip>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-1 flex-col items-center">
          {loading ? (
            <div className="w-full max-w-md">
              <Skeleton className="h-[48dvh] max-h-[26.5rem] min-h-64 w-full rounded-2xl sm:max-h-[27.5rem]" />
              <div className="mt-4 flex justify-center gap-3">
                <Skeleton className="h-12 w-40 rounded-full" />
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-12 w-32 rounded-full" />
              </div>
            </div>
          ) : error ? (
            <div className="mt-10 flex flex-col items-center text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="mt-4" onClick={() => setRound((r) => r + 1)}>
                Try again
              </Button>
            </div>
          ) : queue.length === 0 && readyDocs.length === 0 ? (
            <EmptyFeed basePath={basePath} />
          ) : queue.length === 0 ? (
            <SessionComplete
              studied={studied}
              onRestart={() => {
                setStudied(0);
                setRound((r) => r + 1);
              }}
            />
          ) : (
            <CardStack
              items={queue}
              onAction={handleAction}
              onToggleSave={handleToggleSave}
              onImpression={handleImpression}
              onViewSource={handleViewSource}
            />
          )}
        </div>
      </div>

      <SourceDrawer card={sourceCard} open={sourceOpen} onOpenChange={setSourceOpen} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

function EmptyFeed({ basePath }: { basePath: string }) {
  return (
    <div className="mt-10 flex max-w-sm flex-col items-center text-center">
      <BloomMark className="size-14 text-leaf" progress={0.25} />
      <h2 className="font-display mt-4 text-xl font-semibold">Nothing has bloomed yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Upload a PDF of your notes or a textbook chapter and BloomScroll will turn it into
        swipeable, source-grounded narrated video reels.
      </p>
      <Button asChild className="mt-5">
        <Link href={`${basePath}/upload`}>
          <UploadCloud aria-hidden /> Upload your first PDF
        </Link>
      </Button>
    </div>
  );
}

function SessionComplete({ studied, onRestart }: { studied: number; onRestart: () => void }) {
  return (
    <div className="mt-10 flex max-w-sm flex-col items-center text-center">
      <BloomMark className="size-14 text-blossom" progress={1} />
      <h2 className="font-display mt-4 text-xl font-semibold">In full bloom</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {studied > 0
          ? `You worked through ${studied} card${studied === 1 ? "" : "s"}. Cards you marked "Got it" will return when their review is due.`
          : "Everything is reviewed for now. Cards return automatically when their spaced review comes due."}
      </p>
      <Button variant="outline" className="mt-5" onClick={onRestart}>
        Start another round
      </Button>
    </div>
  );
}
