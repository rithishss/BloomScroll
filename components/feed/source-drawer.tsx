"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/lib/data/provider-context";
import type { SourceChunk, StudyCard } from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

/**
 * Source verification drawer. Shows the stored supporting excerpt plus the
 * full stored chunk text — always real extracted source, never model output —
 * and links to the PDF page when a link can be produced.
 */
export function SourceDrawer({
  card,
  open,
  onOpenChange,
}: {
  card: StudyCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = useDataProvider();
  const [chunks, setChunks] = useState<SourceChunk[] | null>(null);
  const [pdf, setPdf] = useState<{ url: string | null; note: string | null } | null>(null);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    (async () => {
      setChunks(null);
      setPdf(null);
      try {
        const [loadedChunks, url] = await Promise.all([
          provider.getChunks(card.sourceChunkIds),
          provider.getDocumentUrl(card.documentId),
        ]);
        if (cancelled) return;
        setChunks(loadedChunks);
        setPdf(url);
      } catch {
        if (cancelled) return;
        setChunks([]);
        setPdf({ url: null, note: "The source text could not be loaded. Please try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, card, provider]);

  if (!card) return null;

  const pdfHref = pdf?.url ? `${pdf.url}#page=${card.pageStart}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Source</DialogTitle>
          <DialogDescription>
            {card.documentTitle} · {formatPageRange(card.pageStart, card.pageEnd)}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Supporting excerpt
          </h3>
          <blockquote className="mt-2 rounded-xl border-l-2 border-leaf bg-surface px-4 py-3 text-sm leading-relaxed">
            {card.sourceExcerpt}
          </blockquote>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Full passage as stored
          </h3>
          {chunks === null ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : chunks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              The stored passage for this card could not be found.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {chunks.map((chunk) => (
                <div key={chunk.id} className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">
                    {formatPageRange(chunk.pageStart, chunk.pageEnd)}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            {pdfHref ? (
              <Button asChild variant="outline" size="sm">
                <a href={pdfHref} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Open PDF at page {card.pageStart}
                </a>
              </Button>
            ) : pdf?.note ? (
              <p className="rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {pdf.note}
              </p>
            ) : pdf ? (
              <p className="rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                A direct link to this PDF page can&apos;t be produced right now.
              </p>
            ) : (
              <Skeleton className="h-8 w-44" />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
