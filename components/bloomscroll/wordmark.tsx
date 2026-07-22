import Link from "next/link";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { cn } from "@/lib/utils";

export function Wordmark({
  href = "/",
  className,
  markClassName,
}: {
  href?: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 text-foreground", className)}
      aria-label="BloomScroll home"
    >
      <BloomMark className={cn("size-7 text-leaf", markClassName)} />
      <span className="font-display text-xl font-semibold tracking-tight">
        Bloom<span className="text-leaf">Scroll</span>
      </span>
    </Link>
  );
}
