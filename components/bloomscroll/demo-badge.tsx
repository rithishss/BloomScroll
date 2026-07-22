import { Sparkles } from "lucide-react";

/** Small tasteful indicator shown throughout the demo workspace. */
export function DemoBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-pollen/40 bg-pollen/12 px-2.5 py-1 text-xs font-medium text-gold-foreground dark:text-pollen"
      title="You're exploring seeded sample data. Nothing here calls external services."
    >
      <Sparkles className="size-3" aria-hidden />
      Demo workspace
    </span>
  );
}
