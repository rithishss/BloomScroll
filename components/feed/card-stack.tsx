"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { Bookmark, Check, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudyCardFace } from "@/components/feed/study-card-face";
import { VideoReelFace } from "@/components/feed/video-reel-face";
import { useReelMutePreference } from "@/lib/feed/use-reel-mute";
import type { FeedFace } from "@/lib/feed/use-feed-face";
import type { FeedItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 600;
const IMPRESSION_DELAY_MS = 700;

export type CardAction = "understood" | "review_again" | "skip";
type ExitState = { direction: -1 | 0 | 1 } | null;

/** Both faces occupy the same swipe frame, but they want different shapes. */
const FACE_FRAME_CLASS: Record<FeedFace, string> = {
  // Text cards are width-driven: a comfortable reading measure, with height
  // capped so the card plus its controls clear the fixed mobile nav.
  text: "h-[48dvh] max-h-[26.5rem] min-h-64 w-full max-w-md sm:max-h-[27.5rem]",
  // Reels render at 9:16, so the frame is height-driven and portrait —
  // width follows from the aspect ratio. Height scales with viewport
  // (capped) so the reel + controls fit above the fixed mobile nav
  // without scrolling on shorter phones.
  video:
    "aspect-[9/16] h-[62dvh] max-h-[46rem] min-h-72 w-auto max-w-[22rem] sm:max-h-[42rem] sm:max-w-sm",
};

/** The peeked cards behind the top one echo that face's own surface. */
const FACE_PEEK_CLASS: Record<FeedFace, string> = {
  text: "border-border bg-card",
  video: "border-white/10 bg-forest",
};

/**
 * One draggable card. Its drag/rotate/verdict-opacity motion values are
 * created fresh here rather than hoisted to CardStack: this component
 * remounts (via the `key={card.id}` on its parent AnimatePresence child)
 * every time the top card changes, so each card starts at x=0 with no
 * manual reset. Sharing one motion value across cards at the CardStack
 * level previously raced the exit animation against a reset effect,
 * intermittently leaving the next card visually stuck mid-exit-transform.
 */
function DraggableCard({
  item,
  face,
  reducedMotion,
  exiting,
  onDragEnd,
  onAnimationComplete,
  onViewSource,
  muted,
  onToggleMute,
}: {
  item: FeedItem;
  face: FeedFace;
  reducedMotion: boolean;
  exiting: ExitState;
  onDragEnd: (info: { offset: { x: number }; velocity: { x: number } }) => void;
  onAnimationComplete: () => void;
  onViewSource: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-9, 9]);
  const gotItOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const reviewOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0 z-10"
      style={reducedMotion ? undefined : { x, rotate }}
      drag={reducedMotion ? false : "x"}
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => onDragEnd(info)}
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22 } }}
      exit={
        reducedMotion || exiting?.direction === 0
          ? { opacity: 0, transition: { duration: 0.12 } }
          : {
              x: (exiting?.direction ?? 1) * 480,
              opacity: 0,
              rotate: (exiting?.direction ?? 1) * 12,
              transition: { duration: 0.28 },
            }
      }
      onAnimationComplete={onAnimationComplete}
      whileDrag={{ cursor: "grabbing" }}
    >
      {/* Drag verdict overlays */}
      {!reducedMotion && (
        <>
          <motion.div
            aria-hidden
            style={{ opacity: gotItOpacity }}
            className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border-2 border-leaf bg-card px-3 py-1 text-sm font-semibold text-leaf"
          >
            Got it
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: reviewOpacity }}
            className="pointer-events-none absolute right-4 top-4 z-20 rounded-full border-2 border-blossom bg-card px-3 py-1 text-sm font-semibold text-blossom"
          >
            Review again
          </motion.div>
        </>
      )}
      {face === "video" ? (
        <VideoReelFace
          item={item}
          onViewSource={onViewSource}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      ) : (
        <StudyCardFace item={item} onViewSource={onViewSource} />
      )}
    </motion.div>
  );
}

/**
 * The swipeable stack. One primary card dominates; the next two peek out
 * behind it. Drag right = "Got it", drag left = "Review again"; every gesture
 * also exists as a visible button and a keyboard shortcut, and swiping is
 * disabled entirely under prefers-reduced-motion.
 *
 * `face` swaps only what fills the frame — text card or narrated reel. The
 * gestures, keyboard shortcuts, impression timing, mastery actions, and save
 * behaviour are identical either way.
 *
 * Impressions fire once per card, only after the card has been the top of
 * the stack for IMPRESSION_DELAY_MS — never on mere render.
 */
export function CardStack({
  items,
  face,
  onAction,
  onToggleSave,
  onImpression,
  onViewSource,
}: {
  items: FeedItem[];
  face: FeedFace;
  onAction: (item: FeedItem, action: CardAction, dwellMs: number) => void;
  onToggleSave: (item: FeedItem) => void;
  onImpression: (item: FeedItem) => void;
  onViewSource: (item: FeedItem) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [muted, toggleMuted] = useReelMutePreference();
  const top = items[0] ?? null;
  // 0 until the impression effect below stamps the real time for `top`.
  const topSinceRef = useRef<number>(0);
  const impressedRef = useRef<Set<string>>(new Set());
  const [exiting, setExiting] = useState<{ id: string; direction: -1 | 0 | 1 } | null>(null);

  // Impression timing for the current top card.
  useEffect(() => {
    if (!top) return;
    topSinceRef.current = Date.now();
    if (impressedRef.current.has(top.card.id)) return;
    const timer = setTimeout(() => {
      impressedRef.current.add(top.card.id);
      onImpression(top);
    }, IMPRESSION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [top, onImpression]);

  const act = useCallback(
    (action: CardAction, direction: -1 | 0 | 1) => {
      if (!top || exiting) return;
      const dwellMs = Date.now() - topSinceRef.current;
      setExiting({ id: top.card.id, direction: reducedMotion ? 0 : direction });
      onAction(top, action, dwellMs);
    },
    [top, exiting, onAction, reducedMotion],
  );

  // Keyboard controls (ignored while typing in inputs/dialogs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("[role=dialog]"))
      ) {
        return;
      }
      if (!top) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          act("understood", 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          act("review_again", -1);
          break;
        case " ":
        case "ArrowDown":
          e.preventDefault();
          act("skip", 0);
          break;
        case "s":
        case "S":
          e.preventDefault();
          onToggleSave(top);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, act, onToggleSave]);

  const handleDragEnd = (info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) {
      act("understood", 1);
    } else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) {
      act("review_again", -1);
    }
  };

  const saved = top?.state?.saved ?? false;

  return (
    <div className="flex w-full flex-col items-center">
      <div className={cn("relative", FACE_FRAME_CLASS[face])} aria-live="polite">
        {/* Peeking next cards */}
        {items.slice(1, 3).map((item, i) => (
          <div
            key={item.card.id}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              transform: `translateY(${(i + 1) * 12}px) scale(${1 - (i + 1) * 0.045})`,
              zIndex: 2 - i,
              opacity: 0.85 - i * 0.25,
            }}
          >
            <div className={cn("h-full rounded-2xl border shadow-soft", FACE_PEEK_CLASS[face])} />
          </div>
        ))}

        <AnimatePresence mode="popLayout">
          {top ? (
            <DraggableCard
              key={top.card.id}
              item={top}
              face={face}
              reducedMotion={!!reducedMotion}
              exiting={exiting}
              onDragEnd={handleDragEnd}
              onAnimationComplete={() => setExiting(null)}
              onViewSource={() => onViewSource(top)}
              muted={muted}
              onToggleMute={toggleMuted}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {/* Visible, accessible controls — gestures are never the only way. */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="lg"
          className="border-blossom/50 text-blossom hover:bg-blossom/10"
          onClick={() => act("review_again", -1)}
          disabled={!top}
        >
          <RotateCcw aria-hidden /> Review again
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={saved ? "Remove from saved" : "Save card"}
          aria-pressed={saved}
          className={cn(saved && "border-pollen bg-pollen/15 text-gold-foreground dark:text-pollen")}
          onClick={() => top && onToggleSave(top)}
          disabled={!top}
        >
          <Bookmark className={cn(saved && "fill-current")} aria-hidden />
        </Button>
        <Button
          size="lg"
          className="bg-leaf text-white hover:bg-leaf/90 dark:text-primary-foreground"
          onClick={() => act("understood", 1)}
          disabled={!top}
        >
          <Check aria-hidden /> Got it
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => act("skip", 0)}
          disabled={!top}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 hover:bg-surface disabled:opacity-50"
        >
          <SkipForward className="size-3.5" aria-hidden /> Next card
          <span className="kbd hidden sm:inline">Space</span>
        </button>
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <span className="kbd">←</span> review · <span className="kbd">→</span> got it ·{" "}
          <span className="kbd">S</span> save
        </span>
      </div>
    </div>
  );
}
