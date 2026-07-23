"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Captions, Info, Loader2, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDataProvider } from "@/lib/data/provider-context";
import type { FeedItem } from "@/lib/types";
import { formatPageRange } from "@/lib/utils";

/**
 * The vertical narrated reel: a self-contained mp4 (title/explanation/
 * takeaway are baked into the video frame by the rendering pipeline) with
 * playback chrome layered on top — progress bar, mute toggle, why-this-card,
 * a transcript disclosure for accessibility, and the view-source action.
 * Interaction controls (Got it / Review again / Save / Skip) live one level
 * up in CardStack, same as the text-card design.
 */
export function VideoReelFace({
  item,
  onViewSource,
  showReasons = true,
  muted,
  onToggleMute,
}: {
  item: FeedItem;
  onViewSource: () => void;
  showReasons?: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const provider = useDataProvider();
  const { card, reasons } = item;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  // Assume paused until onPlay actually confirms playback: a rejected
  // autoplay request never fires a `play`/`pause` DOM event pair, so
  // defaulting to false would leave the tap-to-play affordance hidden.
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setVideoUrl(null);
      setNote(null);
      setProgress(0);
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
  }, [provider, card.id]);

  // React's `muted` JSX prop doesn't reliably land on the DOM node before
  // the browser evaluates autoplay eligibility, so a muted <video autoPlay>
  // can silently stay paused. Setting the property imperatively and calling
  // play() ourselves avoids that. Browsers can still legitimately refuse
  // (e.g. a backgrounded/unfocused tab, or an aggressive power-saver mode);
  // the tap-to-play overlay below is the recovery path when that happens.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;
    el.muted = muted;
    el.play().catch(() => {
      /* handled via the element's own `pause` event below */
    });
  }, [videoUrl, muted]);

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-forest shadow-card">
      <div className="absolute inset-x-0 top-0 z-20 h-1 bg-white/20">
        <div
          className="h-full bg-pollen transition-[width] duration-150 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* No topic/type/difficulty badges here — the rendered reel already
          bakes those into its opening frame; duplicating them in HTML chrome
          would just compete with the video for the same corner. */}
      <div className="absolute inset-x-0 top-3 z-20 flex items-start justify-end gap-2 px-4">
        {showReasons && reasons.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Why this reel?"
                className="bg-black/20 text-white hover:bg-black/30"
              >
                <Info aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuLabel className="text-foreground text-sm font-medium">
                Why this reel?
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

      <div className="relative flex-1 bg-forest">
        {videoUrl ? (
          <button
            type="button"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) el.play().catch(() => {});
              else el.pause();
            }}
            aria-label={paused ? "Play" : "Pause"}
            className="block h-full w-full cursor-pointer"
          >
            <video
              ref={videoRef}
              key={videoUrl}
              src={videoUrl}
              className="h-full w-full object-cover"
              muted={muted}
              autoPlay
              loop
              playsInline
              preload="auto"
              aria-label={`${card.title} — narrated reel`}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (el.duration > 0) setProgress(el.currentTime / el.duration);
              }}
            />
            {paused ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
                  <Play className="size-7 translate-x-0.5" />
                </span>
              </span>
            ) : null}
          </button>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/70" aria-hidden />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="font-display text-lg font-semibold text-white">{card.title}</p>
            <p className="text-sm leading-relaxed text-white/70">
              {note ?? "This reel isn't available yet."}
            </p>
          </div>
        )}

        {videoUrl ? (
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={!muted}
            className="absolute bottom-4 right-4 z-20 flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
          >
            {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          </button>
        ) : null}

        {card.narrationScript ? (
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
            className="absolute bottom-4 left-4 z-20 flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
          >
            <Captions aria-hidden />
          </button>
        ) : null}

        {showTranscript && card.narrationScript ? (
          <div className="absolute inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto bg-black/70 px-5 py-4 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Transcript</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white">{card.narrationScript}</p>
          </div>
        ) : null}
      </div>

      <div className="relative z-20 flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-5 py-3">
        <p className="min-w-0 truncate text-xs text-white/70">
          {card.documentTitle} · {formatPageRange(card.pageStart, card.pageEnd)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewSource}
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
        >
          <BookOpen aria-hidden /> View source
        </Button>
      </div>
    </article>
  );
}
