"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  LibraryBig,
  Layers,
  LogOut,
  MessageCircleQuestion,
  Search,
  Settings,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { Wordmark } from "@/components/bloomscroll/wordmark";
import { DemoBadge } from "@/components/bloomscroll/demo-badge";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { SearchCommand } from "@/components/shell/search-command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDataProvider } from "@/lib/data/provider-context";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { segment: "feed", label: "Feed", icon: Layers },
  { segment: "library", label: "Library", icon: LibraryBig },
  { segment: "upload", label: "Upload", icon: UploadCloud },
  { segment: "ask", label: "Ask Bloom", icon: MessageCircleQuestion },
  { segment: "saved", label: "Saved", icon: Bookmark },
] as const;

/**
 * Shared application shell: desktop sidebar + mobile top bar and bottom nav.
 * Used by both /app (real) and /demo (seeded) route trees; `basePath` is the
 * only difference.
 */
export function AppShell({
  basePath,
  children,
}: {
  basePath: "/app" | "/demo";
  children: React.ReactNode;
}) {
  const provider = useDataProvider();
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const isDemo = provider.mode === "demo";

  useEffect(() => {
    let cancelled = false;
    provider
      .getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* profile chrome is non-critical; screens handle their own errors */
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (segment: string) => pathname.startsWith(`${basePath}/${segment}`);

  const handleSignOut = async () => {
    await provider.signOut();
    router.push(isDemo ? "/" : "/login");
    router.refresh();
  };

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <UserRound aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {profile ? profile.displayName : "…"}
          {isDemo ? " (demo)" : ""}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`${basePath}/settings`)}>
          <Settings aria-hidden /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut aria-hidden /> {isDemo ? "Exit demo" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-background/70 px-4 py-5 md:flex">
        <Wordmark href={`${basePath}/feed`} />
        {isDemo ? (
          <div className="mt-3">
            <DemoBadge />
          </div>
        ) : null}
        <Button
          variant="outline"
          className="mt-5 justify-start gap-2 text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search aria-hidden />
          Search cards
          <span className="kbd ml-auto">⌘K</span>
        </Button>
        <nav aria-label="Primary" className="mt-5 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${basePath}/${segment}`}
              aria-current={isActive(segment) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(segment)
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <ThemeToggle />
          {userMenu}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <Wordmark href={`${basePath}/feed`} markClassName="size-6" className="[&>span]:text-lg" />
          <div className="flex items-center gap-1">
            {isDemo ? <DemoBadge /> : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search cards"
              onClick={() => setSearchOpen(true)}
            >
              <Search aria-hidden />
            </Button>
            <ThemeToggle />
            {userMenu}
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-background/95 backdrop-blur md:hidden"
        >
          {NAV_ITEMS.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`${basePath}/${segment}`}
              aria-current={isActive(segment) ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.65rem] font-medium",
                isActive(segment) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("size-5", isActive(segment) && "fill-current/10")} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
