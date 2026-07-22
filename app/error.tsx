"use client";

import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { Button } from "@/components/ui/button";

/** Route-level error boundary for the whole app. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <BloomMark className="size-12 text-muted-foreground" progress={0.15} />
      <h1 className="font-display mt-4 text-2xl font-semibold">Something wilted</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        An unexpected error interrupted the page. Your data is safe — try again.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
