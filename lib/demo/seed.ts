import { DEMO_DOCS, OS_NOTES, SS_NOTES, type DemoDocContent } from "@/lib/demo/content";
import { buildNarrationScript } from "@/lib/video/narration";
import type {
  CardState,
  CardType,
  Difficulty,
  DocumentSummary,
  Profile,
  SourceChunk,
  StudyCard,
  TopicPreference,
} from "@/lib/types";

/**
 * Seeded demo workspace. Chunks are built 1:1 from the pages in
 * lib/demo/content.ts, and every card's excerpt is extracted from that same
 * text (see `excerptAround`), so the source drawer always shows real stored
 * source — never model-invented text. A unit test enforces the invariant.
 */

export const DEMO_USER_ID = "demo-user";
const SEED_CREATED_AT = "2026-07-14T09:00:00.000Z";

export const DEMO_PROFILE: Profile = {
  id: DEMO_USER_ID,
  displayName: "Demo Student",
  avatarUrl: null,
  studyGoal: "exam",
  preferredDifficulty: "core",
  onboardingCompleted: true,
  email: null,
};

export const DEMO_TOPIC_PREFERENCES: TopicPreference[] = [
  { topic: "CPU Scheduling", explicitWeight: 0.7, learnedWeight: 0.4 },
  { topic: "Virtual Memory", explicitWeight: 0.65, learnedWeight: 0.35 },
  { topic: "Convolution", explicitWeight: 0.6, learnedWeight: 0.3 },
  { topic: "Sampling", explicitWeight: 0.55, learnedWeight: 0.3 },
];

export function demoChunkId(docId: string, pageNumber: number): string {
  return `${docId}-chunk-${pageNumber}`;
}

export function buildDemoChunks(): SourceChunk[] {
  return DEMO_DOCS.flatMap((doc) =>
    doc.pages.map((page, index) => ({
      id: demoChunkId(doc.id, page.pageNumber),
      documentId: doc.id,
      documentTitle: doc.title,
      chunkIndex: index,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      content: `${page.heading}\n\n${page.body}`,
    })),
  );
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?]) /);
}

/**
 * Returns the sentence containing `marker` plus `extra` following sentences.
 * Because sentences are split on single spaces and re-joined with single
 * spaces, the result is always an exact substring of the page body.
 */
function excerptAround(doc: DemoDocContent, pageNumber: number, marker: string, extra = 1): string {
  const page = doc.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error(`Demo seed error: page ${pageNumber} missing in ${doc.id}`);
  const sents = sentencesOf(page.body);
  const i = sents.findIndex((s) => s.includes(marker));
  if (i === -1)
    throw new Error(`Demo seed error: marker "${marker}" not found on page ${pageNumber}`);
  return sents.slice(i, i + 1 + extra).join(" ");
}

interface DemoCardSpec {
  key: string;
  doc: DemoDocContent;
  page: number;
  cardType: CardType;
  topic: string;
  title: string;
  explanation: string;
  question?: string;
  answer?: string;
  takeaway?: string;
  difficulty: Difficulty;
  marker: string;
  extraSentences?: number;
}

const CARD_SPECS: DemoCardSpec[] = [
  // ── Operating Systems ──────────────────────────────────────────────
  {
    key: "os-process",
    doc: OS_NOTES,
    page: 1,
    cardType: "concept",
    topic: "Processes",
    title: "A process is a program in motion",
    explanation:
      "A program on disk is just instructions and data; a process is that program actually running, with its own program counter, registers, stack, and heap. The kernel records everything about a process in its process control block (PCB) — identity, scheduling state, and saved CPU context. Because the PCB captures the full execution context, the OS can pause any process and later resume it exactly where it left off.",
    takeaway: "Program = recipe. Process = someone actually cooking.",
    difficulty: "intro",
    marker: "A process is that program in motion",
    extraSentences: 2,
  },
  {
    key: "os-threads",
    doc: OS_NOTES,
    page: 2,
    cardType: "key_point",
    topic: "Threads",
    title: "Threads share the house, keep their own desk",
    explanation:
      "Threads inside one process share the address space, open files, and globals, while each keeps a private stack and register state. That sharing makes thread creation and communication far cheaper than spawning processes — no new address space is needed. The price is safety: any thread can scribble over data another thread is relying on, which is exactly why synchronization exists.",
    difficulty: "core",
    marker: "Threads are execution streams",
    extraSentences: 2,
  },
  {
    key: "os-sjf",
    doc: OS_NOTES,
    page: 3,
    cardType: "question",
    topic: "CPU Scheduling",
    title: "Why does SJF minimize average waiting time?",
    explanation:
      "Shortest-job-first is the provably optimal non-preemptive policy for average waiting time, and the argument is a simple exchange: swap a short job ahead of a long one and total waiting shrinks.",
    question: "Why does putting the shortest job first provably minimize average waiting time?",
    answer:
      "Moving a short job ahead of a long one reduces the short job's wait by more than it increases the long job's wait, so every such swap lowers the average. The practical catch: run times aren't known in advance and must be estimated from history.",
    difficulty: "core",
    marker: "Shortest-job-first (SJF) provably minimizes",
    extraSentences: 2,
  },
  {
    key: "os-quantum",
    doc: OS_NOTES,
    page: 4,
    cardType: "key_point",
    topic: "CPU Scheduling",
    title: "The round-robin quantum is a dial, not a detail",
    explanation:
      "Round-robin's behavior is governed almost entirely by its time quantum. Stretch the quantum and the scheduler degenerates into first-come-first-served, reviving the convoy effect. Shrink it too far and the CPU spends its life context switching instead of running your code. The working heuristic: pick a quantum big enough that most interactive bursts finish inside a single slice.",
    difficulty: "core",
    marker: "The quantum is a tuning knob",
    extraSentences: 1,
  },
  {
    key: "os-vm",
    doc: OS_NOTES,
    page: 5,
    cardType: "concept",
    topic: "Virtual Memory",
    title: "Virtual addresses are a private fiction",
    explanation:
      "Paging hands every process the same comfortable illusion: a large, private, contiguous address space. Page tables translate each virtual page to whatever physical frame happens to hold it. The indirection buys protection (you cannot even name another process's memory), kills external fragmentation, and lets pages live on disk until first touch — so programs bigger than RAM still run.",
    difficulty: "core",
    marker: "Virtual memory gives every process the illusion",
    extraSentences: 1,
  },
  {
    key: "os-tlb",
    doc: OS_NOTES,
    page: 6,
    cardType: "key_point",
    topic: "Virtual Memory",
    title: "The TLB is why paging is affordable",
    explanation:
      "Every load and store needs a translation, and walking the page table each time would multiply memory traffic. The TLB — a small cache of recent virtual-to-physical mappings — absorbs almost all of that cost because programs reuse the same pages heavily. Locality is doing the real work: a few dozen cached translations cover the overwhelming majority of accesses.",
    difficulty: "core",
    marker: "so processors keep a translation lookaside buffer",
    extraSentences: 1,
  },
  {
    key: "os-belady",
    doc: OS_NOTES,
    page: 7,
    cardType: "example",
    topic: "Virtual Memory",
    title: "Belady's anomaly: more memory, more faults",
    explanation:
      "Intuition says adding frames should always reduce page faults. FIFO replacement breaks that intuition: for some reference patterns, giving the workload more frames increases the fault count. This is Belady's anomaly, and it is one reason systems prefer recency-based policies like LRU or its cheap approximation, the clock algorithm, which evicts the first page whose reference bit has gone cold.",
    difficulty: "advanced",
    marker: "Belady's anomaly shows",
    extraSentences: 1,
  },
  {
    key: "os-race",
    doc: OS_NOTES,
    page: 8,
    cardType: "concept",
    topic: "Concurrency",
    title: "Race conditions: when timing decides your answer",
    explanation:
      "Two threads incrementing one counter can lose an update: each does load, add, store, and an unlucky interleaving overwrites one increment. Whenever the result depends on thread timing, you have a race condition. The fix is mutual exclusion around the critical section — a mutex ensures at most one thread manipulates the shared state at a time, restoring the illusion that the section ran as one indivisible step.",
    difficulty: "core",
    marker: "A race condition occurs",
    extraSentences: 2,
  },
  {
    key: "os-deadlock-hook",
    doc: OS_NOTES,
    page: 9,
    cardType: "memory_hook",
    topic: "Deadlock",
    title: "Four conditions, one cycle, zero progress",
    explanation:
      "Deadlock needs all four: Mutual exclusion, Hold-and-wait, No preemption, Circular wait. Remember 'My Horse Never Cooperates' — knock out any single condition and deadlock cannot happen, which is exactly how every prevention strategy works.",
    takeaway: "My Horse Never Cooperates → Mutex, Hold-and-wait, No preemption, Circular wait.",
    difficulty: "intro",
    marker: "Four conditions must all hold",
    extraSentences: 1,
  },
  {
    key: "os-lock-order",
    doc: OS_NOTES,
    page: 9,
    cardType: "question",
    topic: "Deadlock",
    title: "Which condition does lock ordering break?",
    explanation:
      "The most practical deadlock defense in real codebases is a rule about acquisition order, and it targets one specific condition in the classic four.",
    question:
      "A team requires all threads to acquire locks in one global order. Which deadlock condition does this break, and why?",
    answer:
      "Circular wait. If every thread acquires locks in the same agreed order, a cycle of waiters cannot form — someone in any would-be cycle would need to grab a lower-ordered lock while holding a higher one, which the rule forbids.",
    difficulty: "core",
    marker: "The most practical strategy",
    extraSentences: 1,
  },
  {
    key: "os-inode",
    doc: OS_NOTES,
    page: 10,
    cardType: "concept",
    topic: "File Systems",
    title: "Inodes don't know their own names",
    explanation:
      "A Unix inode holds a file's metadata — size, permissions, timestamps, block pointers — but never its name. Names live in directories, which are just small files mapping names to inode numbers. That separation is why hard links work (several names, one inode) and why renaming a file is instant: only a directory entry changes, never the data.",
    takeaway: "Files have identities (inodes); directories hand out nicknames.",
    difficulty: "core",
    marker: "Crucially, the inode does not contain",
    extraSentences: 1,
  },
  {
    key: "os-journal",
    doc: OS_NOTES,
    page: 10,
    cardType: "key_point",
    topic: "File Systems",
    title: "Journaling: write the plan before the change",
    explanation:
      "A crash in the middle of a multi-block metadata update can leave a file system half-changed. Journaling file systems first append an intent record to a log, then apply the update in place. Recovery after a crash replays complete operations and discards incomplete ones — the tree is never left in a state nobody intended.",
    difficulty: "core",
    marker: "Journaling file systems write an intent record",
    extraSentences: 0,
  },
  // ── Signals & Systems ─────────────────────────────────────────────
  {
    key: "ss-impulse",
    doc: SS_NOTES,
    page: 1,
    cardType: "concept",
    topic: "Signals Basics",
    title: "The impulse is the atom of signals",
    explanation:
      "The unit impulse delta[n] is 1 at n = 0 and 0 everywhere else — the idealized instant of energy. Its power comes from decomposition: any discrete signal is a sum of scaled, shifted impulses. That's precisely why the impulse is the right probe for a system: learn how a system answers an impulse and, for LTI systems, you can predict its answer to everything.",
    difficulty: "intro",
    marker: "Any discrete signal can be written",
    extraSentences: 0,
  },
  {
    key: "ss-properties",
    doc: SS_NOTES,
    page: 2,
    cardType: "key_point",
    topic: "System Properties",
    title: "Linearity + time invariance = a complete theory",
    explanation:
      "Linearity means superposition holds; time invariance means the system behaves identically whenever you use it. Neither alone is remarkable, but their intersection — the LTI system — admits a complete theory: one impulse response characterizes the system, convolution predicts every output, and sinusoids pass through changed only in amplitude and phase.",
    difficulty: "core",
    marker: "A system is linear when",
    extraSentences: 1,
  },
  {
    key: "ss-impulse-response",
    doc: SS_NOTES,
    page: 3,
    cardType: "concept",
    topic: "LTI Systems",
    title: "One measurement to know them all",
    explanation:
      "For an LTI system, the impulse response h is a complete description. The argument is three steps: decompose any input into scaled, shifted impulses; time invariance turns each shifted impulse into a shifted copy of h; linearity sums those copies with the same weights. Bonus facts fall out immediately — causal iff h vanishes for negative time, BIBO stable iff h is absolutely summable.",
    difficulty: "core",
    marker: "For a linear time-invariant system, one measurement",
    extraSentences: 1,
  },
  {
    key: "ss-convolution",
    doc: SS_NOTES,
    page: 4,
    cardType: "concept",
    topic: "Convolution",
    title: "Convolution is a sum of echoes",
    explanation:
      "y[n] = sum over k of x[k] h[n − k]: each input sample fires its own scaled, shifted copy of the impulse response, and the output at any moment is the sum of all echoes arriving right then. Commutativity and associativity mean cascaded LTI blocks collapse into one block whose impulse response is the stages convolved together — in any order.",
    difficulty: "core",
    marker: "Each input sample launches",
    extraSentences: 1,
  },
  {
    key: "ss-delay",
    doc: SS_NOTES,
    page: 4,
    cardType: "example",
    topic: "Convolution",
    title: "Convolving with a shifted impulse = pure delay",
    explanation:
      "What system does delta[n − d] represent? Convolve any signal with it and every sample simply arrives d steps later: x[n] * delta[n − d] = x[n − d]. No scaling, no shaping — a pure delay line. It's a tiny example, but it makes the 'sum of echoes' picture concrete: here there is exactly one echo.",
    difficulty: "intro",
    marker: "A helpful special case",
    extraSentences: 0,
  },
  {
    key: "ss-fourier-series",
    doc: SS_NOTES,
    page: 5,
    cardType: "concept",
    topic: "Fourier Analysis",
    title: "Periodic signals are chords of harmonics",
    explanation:
      "Any periodic signal with period T decomposes into sinusoids at the fundamental 1/T and its integer multiples; the Fourier coefficients say how loudly each harmonic plays. Smooth signals need few harmonics, sharp-edged signals need many. The real payoff: complex exponentials are eigenfunctions of LTI systems, so in the harmonic basis, a system just rescales each component.",
    difficulty: "core",
    marker: "A periodic signal with period T",
    extraSentences: 1,
  },
  {
    key: "ss-fourier-transform",
    doc: SS_NOTES,
    page: 6,
    cardType: "key_point",
    topic: "Fourier Analysis",
    title: "Convolution in time is multiplication in frequency",
    explanation:
      "The Fourier transform turns a signal into its spectrum, and it turns the hardest time-domain operation into the easiest one: convolution becomes multiplication. A time shift becomes a phase ramp; compressing a signal in time stretches its spectrum. That last pair is the precise form of a slogan worth keeping: short events are wideband.",
    takeaway: "Hard in time, easy in frequency — that's the whole trade.",
    difficulty: "core",
    marker: "convolution in time becomes multiplication",
    extraSentences: 0,
  },
  {
    key: "ss-filtering",
    doc: SS_NOTES,
    page: 7,
    cardType: "question",
    topic: "Filtering",
    title: "What can an LTI filter do to a sinusoid?",
    explanation:
      "Frequency response H(jw) is the whole story of steady-state filtering, and it constrains what is even possible for a sinusoidal input.",
    question:
      "A pure sinusoid enters an LTI filter. What can change at the output, and what cannot?",
    answer:
      "Amplitude (multiplied by |H(jw)|) and phase (shifted by the angle of H(jw)) can change; the frequency cannot. A low-pass filter is just a choice of |H| near 1 for low frequencies and near 0 for high ones.",
    difficulty: "core",
    marker: "the magnitude |H(jw)| multiplies the amplitude",
    extraSentences: 1,
  },
  {
    key: "ss-nyquist",
    doc: SS_NOTES,
    page: 8,
    cardType: "concept",
    topic: "Sampling",
    title: "Nyquist: the exact price of going digital",
    explanation:
      "Sampling keeps nothing above half the sampling rate. If a signal's content stays below B, sampling faster than 2B preserves it perfectly — reconstruction is exact, not approximate. Sample slower and frequencies above fs/2 fold down as aliases, indistinguishable from genuine low frequencies after the fact. That irreversibility is why anti-aliasing filters sit before samplers, not after.",
    difficulty: "core",
    marker: "if x(t) contains no frequencies above B",
    extraSentences: 1,
  },
  {
    key: "ss-alias-hook",
    doc: SS_NOTES,
    page: 8,
    cardType: "memory_hook",
    topic: "Sampling",
    title: "The wagon-wheel test",
    explanation:
      "Film cameras sample the world 24 times a second, and a fast-spinning wagon wheel appears to rotate slowly backwards — a high frequency folded down to a false low one. When you need to recall what aliasing is, picture the backwards wheel: undersampling doesn't lose fast content, it disguises it as slow content.",
    takeaway: "Aliasing = fast things wearing slow costumes.",
    difficulty: "intro",
    marker: "This is why a wagon wheel",
    extraSentences: 1,
  },
  {
    key: "ss-poles",
    doc: SS_NOTES,
    page: 9,
    cardType: "concept",
    topic: "Transforms",
    title: "Poles decide stability",
    explanation:
      "Write a system as a transfer function H(s) and its denominator's roots — the poles — dictate its fate. Each pole p contributes a mode e^(pt), which decays only if the pole's real part is negative. Hence the golden rule for causal systems: stable exactly when every pole lives strictly in the left half-plane. (In discrete time, the same story moves to 'inside the unit circle'.)",
    difficulty: "advanced",
    marker: "A causal system is stable exactly when",
    extraSentences: 0,
  },
];

/** Measured (via ffprobe) durations of the pre-rendered demo reels, keyed by
 * card key. Filled in by scripts/generate-demo-videos.ts; a card missing
 * here simply has no reel yet. */
export const DEMO_VIDEO_DURATIONS: Record<string, number> = {
  "os-process": 31.2,
  "os-threads": 22.6,
  "os-sjf": 11.1,
  "os-quantum": 21.4,
  "os-vm": 23.5,
  "os-tlb": 21.8,
  "os-belady": 23,
  "os-race": 23.6,
  "os-deadlock-hook": 20.5,
  "os-lock-order": 8.1,
  "os-inode": 26.7,
  "os-journal": 18.1,
  "ss-impulse": 22.9,
  "ss-properties": 21.2,
  "ss-impulse-response": 24.5,
  "ss-convolution": 23.2,
  "ss-delay": 21.9,
  "ss-fourier-series": 24.1,
  "ss-fourier-transform": 23.8,
  "ss-filtering": 8.9,
  "ss-nyquist": 24.7,
  "ss-alias-hook": 21.9,
  "ss-poles": 23.2,
};

export function buildDemoCards(): StudyCard[] {
  return CARD_SPECS.map((spec) => ({
    id: `card-${spec.key}`,
    documentId: spec.doc.id,
    documentTitle: spec.doc.title,
    cardType: spec.cardType,
    topic: spec.topic,
    title: spec.title,
    explanation: spec.explanation,
    question: spec.question ?? null,
    answer: spec.answer ?? null,
    takeaway: spec.takeaway ?? null,
    difficulty: spec.difficulty,
    sourceChunkIds: [demoChunkId(spec.doc.id, spec.page)],
    sourceExcerpt: excerptAround(spec.doc, spec.page, spec.marker, spec.extraSentences ?? 1),
    pageStart: spec.page,
    pageEnd: spec.page,
    createdAt: SEED_CREATED_AT,
    videoDurationSeconds: DEMO_VIDEO_DURATIONS[spec.key] ?? null,
    narrationScript: buildNarrationScript({ explanation: spec.explanation, takeaway: spec.takeaway ?? null }),
  }));
}

export function buildDemoDocuments(): DocumentSummary[] {
  const cards = buildDemoCards();
  return DEMO_DOCS.map((doc, i) => {
    const docCards = cards.filter((c) => c.documentId === doc.id);
    return {
      id: doc.id,
      title: doc.title,
      originalFilename: doc.filename,
      pageCount: doc.pages.length,
      fileSizeBytes: 184_000 + i * 21_000,
      status: "ready" as const,
      processingProgress: 100,
      errorMessage: null,
      cardCount: docCards.length,
      chunkCount: doc.pages.length,
      topics: [...new Set(docCards.map((c) => c.topic))],
      lastStudiedAt: i === 0 ? "2026-07-20T18:30:00.000Z" : "2026-07-19T21:10:00.000Z",
      createdAt: SEED_CREATED_AT,
    };
  });
}

/** A little pre-existing activity so progress, mastery, and Saved feel real. */
export function buildInitialCardStates(): Record<string, CardState> {
  const states: Record<string, CardState> = {};
  const preset: Array<[string, Partial<CardState>]> = [
    [
      "card-os-process",
      {
        masteryScore: 0.58,
        timesSeen: 2,
        lastAction: "understood",
        lastSeenAt: "2026-07-20T18:22:00.000Z",
        nextReviewAt: "2026-07-23T18:22:00.000Z",
      },
    ],
    [
      "card-os-sjf",
      {
        masteryScore: 0.35,
        timesSeen: 1,
        lastAction: "review_again",
        lastSeenAt: "2026-07-20T18:25:00.000Z",
        nextReviewAt: "2026-07-20T18:35:00.000Z",
      },
    ],
    [
      "card-ss-convolution",
      {
        masteryScore: 0.35,
        timesSeen: 1,
        saved: true,
        lastAction: "save",
        lastSeenAt: "2026-07-19T21:02:00.000Z",
        nextReviewAt: "2026-07-22T21:02:00.000Z",
      },
    ],
    [
      "card-os-deadlock-hook",
      { saved: true, timesSeen: 1, lastAction: "save", lastSeenAt: "2026-07-20T18:28:00.000Z" },
    ],
  ];
  for (const [cardId, patch] of preset) {
    states[cardId] = {
      cardId,
      saved: false,
      masteryScore: 0,
      timesSeen: 0,
      lastSeenAt: null,
      nextReviewAt: null,
      lastAction: null,
      ...patch,
    };
  }
  return states;
}
