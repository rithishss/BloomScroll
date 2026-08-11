"use client";

import { Clapperboard, Layers } from "lucide-react";
import type { FeedFace } from "@/lib/feed/use-feed-face";
import { cn } from "@/lib/utils";

const OPTIONS: { value: FeedFace; label: string; icon: typeof Layers }[] = [
  { value: "text", label: "Cards", icon: Layers },
  { value: "video", label: "Reels", icon: Clapperboard },
];

/**
 * Segmented control choosing how the feed presents each card. Labels are
 * hidden below `sm` so the control stays narrow next to the feed title on a
 * 375px screen; the accessible name always carries the full label.
 */
export function FeedFaceToggle({
  face,
  onChange,
}: {
  face: FeedFace;
  onChange: (face: FeedFace) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Feed style"
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = face === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            aria-label={`${label} view`}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
