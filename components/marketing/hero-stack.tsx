"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";

const PREVIEW_CARDS = [
  {
    id: "p1",
    type: "Concept",
    topic: "Virtual Memory",
    title: "Virtual addresses are a private fiction",
    body: "Paging hands every process a large, private, contiguous address space — page tables quietly translate to whatever physical frame is free.",
    source: "OS Notes · p. 5",
  },
  {
    id: "p2",
    type: "Question",
    topic: "CPU Scheduling",
    title: "Why does SJF minimize waiting time?",
    body: "Swap a short job ahead of a long one: the short job's wait shrinks by more than the long job's grows. Every swap lowers the average.",
    source: "OS Notes · p. 3",
  },
  {
    id: "p3",
    type: "Memory hook",
    topic: "Sampling",
    title: "The wagon-wheel test",
    body: "A fast wheel filmed at 24 fps seems to spin backwards — undersampling disguises fast content as slow. That's aliasing.",
    source: "Signals Notes · p. 8",
  },
];

/** Self-cycling preview of the feed's card stack for the landing hero. */
export function HeroStack() {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => setIndex((i) => (i + 1) % PREVIEW_CARDS.length), 3400);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const card = PREVIEW_CARDS[index];

  return (
    <div className="relative mx-auto h-80 w-full max-w-sm" aria-hidden>
      {[2, 1].map((depth) => (
        <div
          key={depth}
          className="absolute inset-0 rounded-2xl border border-border bg-card shadow-soft"
          style={{
            transform: `translateY(${depth * 13}px) scale(${1 - depth * 0.05})`,
            opacity: 0.75 - depth * 0.2,
            zIndex: 3 - depth,
          }}
        />
      ))}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={card.id}
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 240, rotate: 7 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute inset-0 z-10 flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card"
        >
          <div className="flex gap-1.5">
            <Badge variant="leaf">{card.type}</Badge>
            <Badge variant="outline">{card.topic}</Badge>
          </div>
          <h3 className="font-display mt-4 text-xl font-semibold leading-snug">{card.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
          <p className="mt-auto pt-4 text-xs text-muted-foreground">{card.source}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
