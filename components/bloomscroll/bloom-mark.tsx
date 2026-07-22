import { cn } from "@/lib/utils";

/**
 * Original BloomScroll mark: five petals around a pollen center. The
 * optional `progress` (0..1) opens the petals — used on processing states
 * and the feed session meter so the brand quietly responds to progress.
 */
export function BloomMark({
  className,
  progress = 1,
  title,
}: {
  className?: string;
  /** 0 = closed bud, 1 = full bloom. */
  progress?: number;
  title?: string;
}) {
  const p = Math.min(1, Math.max(0, progress));
  // Petals scale from 45% (bud) to 100% (bloom) and fan out as p grows.
  const petalScale = 0.45 + 0.55 * p;
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-6", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g style={{ transformOrigin: "24px 24px", transform: `scale(${petalScale})` }}>
        {petals.map((angle) => (
          <ellipse
            key={angle}
            cx="24"
            cy="13.5"
            rx="6.2"
            ry="10"
            fill="currentColor"
            opacity={0.32 + 0.4 * p}
            style={{ transformOrigin: "24px 24px", transform: `rotate(${angle}deg)` }}
          />
        ))}
      </g>
      <circle cx="24" cy="24" r={4 + 1.5 * p} fill="var(--pollen)" />
    </svg>
  );
}
