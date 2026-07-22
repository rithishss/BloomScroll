import Link from "next/link";
import { Wordmark } from "@/components/bloomscroll/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bloom-aurora flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Wordmark />
        <Link href="/demo" className="text-sm text-muted-foreground hover:text-foreground">
          Try the demo instead
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  );
}
