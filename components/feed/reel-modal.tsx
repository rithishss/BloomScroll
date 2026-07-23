"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useDataProvider } from "@/lib/data/provider-context";
import { CARD_TYPE_LABELS, DIFFICULTY_LABELS, type StudyCard } from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

/**
 * A lightweight "watch" modal for reels surfaced outside the main feed
 * (Saved, Library, Document preview). Uses native video controls since
 * these are secondary surfaces, not the primary swipe experience.
 */
export function ReelModal({
  card,
  open,
  onOpenChange,
}: {
  card: StudyCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = useDataProvider();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setVideoUrl(null);
      setNote(null);
      try {
        const result = await provider.getCardVideoUrl(card.id);
        if (cancelled) return;
        setVideoUrl(result.url);
        setNote(result.note);
      } catch {
        if (cancelled) return;
        setNote("This reel could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, card, provider]);

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{card.title}</DialogTitle>
          <DialogDescription>
            {card.documentTitle} · {formatPageRange(card.pageStart, card.pageEnd)}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge variant="leaf">{CARD_TYPE_LABELS[card.cardType]}</Badge>
            <Badge variant="outline">{card.topic}</Badge>
            <Badge>{DIFFICULTY_LABELS[card.difficulty]}</Badge>
          </div>
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-forest">
            {videoUrl ? (
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                className="h-full w-full object-cover"
                aria-label={`${card.title} — narrated reel`}
              />
            ) : loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/70" aria-hidden />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-relaxed text-white/70">
                {note ?? "This reel isn't available yet."}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
