import { Sparkles } from "lucide-react";

/** Small tasteful indicator shown throughout the demo workspace. `compact`
 * drops the label (icon only) for tight spaces like the mobile header. */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-pollen/40 bg-pollen/12 text-gold-foreground dark:text-pollen"
        title="Demo workspace — you're exploring seeded sample data. Nothing here calls external services."
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span className="sr-only">Demo workspace</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-pollen/40 bg-pollen/12 px-2.5 py-1 text-xs font-medium text-gold-foreground dark:text-pollen"
      title="You're exploring seeded sample data. Nothing here calls external services."
    >
      <Sparkles className="size-3" aria-hidden />
      Demo workspace
    </span>
  );
}
