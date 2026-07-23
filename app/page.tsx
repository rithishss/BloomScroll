import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpenCheck, Fingerprint, Quote, Sparkles, UploadCloud } from "lucide-react";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { Wordmark } from "@/components/bloomscroll/wordmark";
import { HeroStack } from "@/components/marketing/hero-stack";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "BloomScroll — Your notes, in full bloom",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5">
          <Wordmark />
          <nav aria-label="Site" className="flex items-center gap-1.5 sm:gap-3">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/demo">Live demo</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bloom-aurora">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-pollen" aria-hidden />
                Turn your notes into a study feed
              </p>
              <h1 className="font-display mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Your notes, in <span className="text-leaf">full bloom</span>.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Upload your course material and BloomScroll transforms it into concise,
                source-grounded video reels that adapt to what you understand and what needs
                another look.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/signup">
                    <UploadCloud aria-hidden /> Upload your first PDF
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/demo">
                    Try the interactive demo <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                The demo runs entirely in your browser — no account, no API keys.
              </p>
            </div>
            <HeroStack />
          </div>
        </section>

        {/* Three steps */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="font-display text-center text-3xl font-semibold">
              Upload. Bloom. Remember.
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Upload",
                  body: "Drop in lecture notes or a textbook chapter. BloomScroll extracts the text page by page and indexes its meaning with embeddings.",
                },
                {
                  step: "02",
                  title: "Bloom",
                  body: "AI writes a script grounded in your material — concept, key point, example, question, or memory hook — then narrates and renders it as a short vertical reel, tied to the exact page it came from.",
                },
                {
                  step: "03",
                  title: "Remember",
                  body: "Swipe through a feed that learns with you. “Got it” schedules spaced reviews; “Review again” brings a reel back soon.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-border bg-card p-6 shadow-soft"
                >
                  <p className="font-display text-sm font-semibold text-pollen">{item.step}</p>
                  <h3 className="font-display mt-2 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Grounding / RAG */}
        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-medium text-leaf">
                <Fingerprint className="size-4" aria-hidden /> Grounded by design
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold">
                Every reel can prove where it came from
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                BloomScroll uses retrieval-augmented generation: your PDF is split into passages,
                embedded, and searched semantically. Reel scripts and answers are generated
                strictly from retrieved passages — and each reel carries a citation to the exact
                page. Open the source drawer on any reel to read the original text. When your
                material doesn&apos;t contain an answer, Bloom says so instead of guessing.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-start gap-3">
                <Quote className="mt-1 size-5 shrink-0 text-leaf" aria-hidden />
                <div>
                  <p className="text-sm italic leading-relaxed">
                    &ldquo;Shortest-job-first (SJF) provably minimizes average waiting time, because
                    moving a short job ahead of a long one reduces the waiting time of the short job
                    by more than it increases the waiting time of the long one.&rdquo;
                  </p>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
                    Operating Systems — Course Notes · p. 3
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Becomes this reel
                </p>
                <p className="font-display mt-1.5 text-base font-semibold">
                  Why does SJF minimize average waiting time?
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Personalization */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="inline-flex items-center justify-center gap-2 text-sm font-medium text-leaf">
                <BookOpenCheck className="size-4" aria-hidden /> A feed that studies you back
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold">
                Ranked by what you need, not when it was made
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Every reel is scored on topic interest, review urgency, novelty, engagement, and
                difficulty fit — with a dash of deterministic exploration. Mastery grows when you
                nail a reel and reviews are spaced further apart; stumble, and it returns sooner. A
                small &ldquo;Why this reel?&rdquo; note explains every pick.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ["Matches your Operating Systems interest", "30% topic relevance"],
                ["Scheduled for review", "22% review urgency"],
                ["New from Signals & Systems", "18% novelty"],
              ].map(([reason, weight]) => (
                <div
                  key={reason}
                  className="rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-soft"
                >
                  <p className="text-sm font-medium">&ldquo;{reason}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted-foreground">{weight}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center sm:py-20">
            <BloomMark className="size-12 text-primary-foreground" progress={1} />
            <h2 className="font-display mt-4 max-w-xl text-3xl font-semibold sm:text-4xl">
              Give your notes a chance to bloom
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href="/signup">Create a free account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link href="/demo">Explore the demo first</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <Wordmark />
          <p className="text-xs text-muted-foreground">
            A portfolio project — Next.js, Supabase, pgvector, and LangChain.
          </p>
          <nav aria-label="Footer" className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/demo" className="hover:text-foreground">
              Demo
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
