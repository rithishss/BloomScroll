import Link from "next/link";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <BloomMark className="size-12 text-leaf" progress={0.4} />
      <h1 className="font-display mt-4 text-2xl font-semibold">This page never bloomed</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Button asChild className="mt-5">
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
