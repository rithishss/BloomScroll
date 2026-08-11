import { OS_NOTES, SS_NOTES, type DemoDocContent } from "@/lib/demo/content";
import { demoChunkId } from "@/lib/demo/seed";
import type { QuizQuestion } from "@/lib/types";

/**
 * Pre-authored demo quizzes — the quiz equivalent of the pre-rendered demo
 * reels. Real mode generates these from the model during ingestion; the demo
 * ships them written by hand from the same repository-owned course notes, so
 * `/demo` needs zero credentials and makes no API calls.
 *
 * Every question's `sourceExcerpt` is extracted from the real page text by
 * `excerptFor` below rather than retyped, so it can't drift into inventing a
 * quote — the same invariant the seeded cards hold, enforced by
 * tests/unit/demo-seed.test.ts.
 */

interface DemoQuizSpec {
  key: string;
  doc: DemoDocContent;
  page: number;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
  /** Sentence fragment locating the supporting excerpt on that page. */
  marker: string;
  extraSentences?: number;
}

function excerptFor(doc: DemoDocContent, pageNumber: number, marker: string, extra = 1): string {
  const page = doc.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) throw new Error(`Demo quiz: page ${pageNumber} missing in ${doc.id}`);
  const sentences = page.body.split(/(?<=[.!?]) /);
  const index = sentences.findIndex((s) => s.includes(marker));
  if (index === -1) {
    throw new Error(`Demo quiz: marker "${marker}" not found on ${doc.id} p.${pageNumber}`);
  }
  return sentences.slice(index, index + 1 + extra).join(" ");
}

const QUIZ_SPECS: DemoQuizSpec[] = [
  // ── Operating Systems ──────────────────────────────────────────────
  {
    key: "os-q-process",
    doc: OS_NOTES,
    page: 1,
    topic: "Processes",
    question: "What distinguishes a process from a program?",
    options: [
      "A process is the program in execution, with its own registers, stack, and heap",
      "A process is the compiled binary; a program is the source code",
      "A process is stored on disk while a program lives in memory",
      "A process is a program that has finished running",
    ],
    correctIndex: 0,
    rationale:
      "A program is a passive file on disk; a process is that program actually executing, with a program counter, registers, a stack, and a heap.",
    marker: "A process is that program in motion",
  },
  {
    key: "os-q-sjf",
    doc: OS_NOTES,
    page: 3,
    topic: "CPU Scheduling",
    question: "Why does shortest-job-first minimize average waiting time?",
    options: [
      "It gives every job an equal time slice, so no job waits longer than another",
      "Moving a short job ahead of a long one cuts the short job's wait by more than it adds to the long job's",
      "It runs jobs in arrival order, which is provably optimal",
      "It preempts long jobs so they never accumulate waiting time",
    ],
    correctIndex: 1,
    rationale:
      "The exchange argument: each swap that puts a shorter job first reduces total waiting time, so the fully sorted order minimizes the average.",
    marker: "Shortest-job-first (SJF) provably minimizes",
  },
  {
    key: "os-q-quantum",
    doc: OS_NOTES,
    page: 4,
    topic: "CPU Scheduling",
    question: "What happens to round-robin scheduling as the time quantum grows very large?",
    options: [
      "It approaches shortest-job-first",
      "Context-switching overhead dominates the CPU's time",
      "It degenerates into first-come-first-served",
      "Interactive jobs become more responsive",
    ],
    correctIndex: 2,
    rationale:
      "With a large enough quantum each process simply runs to completion before yielding, which is exactly FCFS behaviour.",
    marker: "The quantum is a tuning knob",
  },
  {
    key: "os-q-tlb",
    doc: OS_NOTES,
    page: 6,
    topic: "Virtual Memory",
    question: "What problem does the translation lookaside buffer (TLB) solve?",
    options: [
      "It stores pages evicted from physical memory so they can be recovered",
      "It caches recent virtual-to-physical translations so most accesses skip the page-table walk",
      "It detects invalid memory accesses before they reach the kernel",
      "It compresses page tables so they fit in a single frame",
    ],
    correctIndex: 1,
    rationale:
      "Walking the page table on every access would multiply memory traffic; the TLB caches recent translations, and locality makes a small cache cover almost all accesses.",
    marker: "so processors keep a translation lookaside buffer",
  },
  {
    key: "os-q-belady",
    doc: OS_NOTES,
    page: 7,
    topic: "Virtual Memory",
    question: "What does Belady's anomaly demonstrate about FIFO page replacement?",
    options: [
      "Adding more frames can increase the number of page faults",
      "FIFO always produces more faults than LRU",
      "FIFO cannot be implemented without hardware support",
      "The first page loaded is always the last one evicted",
    ],
    correctIndex: 0,
    rationale:
      "Belady's anomaly is precisely the counterintuitive case where giving a FIFO workload more frames increases, rather than decreases, its fault count.",
    marker: "Belady's anomaly shows",
  },
  {
    key: "os-q-deadlock",
    doc: OS_NOTES,
    page: 9,
    topic: "Deadlock",
    question:
      "A team requires every thread to acquire locks in one globally agreed order. Which deadlock condition does that break?",
    options: ["Mutual exclusion", "Hold and wait", "No preemption", "Circular wait"],
    correctIndex: 3,
    rationale:
      "A consistent global ordering makes a cycle of waiters impossible, since forming one would require a thread to take a lower-ordered lock while holding a higher one.",
    marker: "The most practical strategy",
  },
  {
    key: "os-q-inode",
    doc: OS_NOTES,
    page: 10,
    topic: "File Systems",
    question: "Which piece of information is NOT stored in a Unix inode?",
    options: ["The file's size", "The file's name", "The file's permissions", "Pointers to data blocks"],
    correctIndex: 1,
    rationale:
      "Names live in directories, which map names to inode numbers — that separation is what makes hard links and instant renames possible.",
    marker: "Crucially, the inode does not contain",
  },
  // ── Signals & Systems ─────────────────────────────────────────────
  {
    key: "ss-q-lti",
    doc: SS_NOTES,
    page: 3,
    topic: "LTI Systems",
    question: "Why does the impulse response fully characterize an LTI system?",
    options: [
      "Because every input signal is itself an impulse",
      "Because linearity and time invariance let any input be built from scaled, shifted impulses",
      "Because impulses are the only signals with finite energy",
      "Because the impulse response is always symmetric in time",
    ],
    correctIndex: 1,
    rationale:
      "Decompose the input into scaled, shifted impulses; time invariance shifts each response and linearity sums them, so h determines every output.",
    marker: "For a linear time-invariant system, one measurement",
  },
  {
    key: "ss-q-convolution",
    doc: SS_NOTES,
    page: 4,
    topic: "Convolution",
    question: "What is the result of convolving a signal x[n] with a shifted impulse delta[n − d]?",
    options: [
      "The signal is delayed by d samples, otherwise unchanged",
      "The signal is scaled by a factor of d",
      "The signal is reversed in time about n = d",
      "The signal's spectrum is shifted by d radians",
    ],
    correctIndex: 0,
    rationale:
      "Convolving with a shifted impulse produces exactly one echo, displaced by d — a pure delay with no scaling or reshaping.",
    marker: "A helpful special case",
    extraSentences: 0,
  },
  {
    key: "ss-q-fourier",
    doc: SS_NOTES,
    page: 6,
    topic: "Fourier Analysis",
    question: "Convolution in the time domain corresponds to which operation in the frequency domain?",
    options: ["Addition", "Convolution again", "Multiplication", "Differentiation"],
    correctIndex: 2,
    rationale:
      "This is the convolution theorem, and it is why filtering is usually reasoned about as a per-frequency multiplication by H(jw).",
    marker: "convolution in time becomes multiplication",
    extraSentences: 0,
  },
  {
    key: "ss-q-filter",
    doc: SS_NOTES,
    page: 7,
    topic: "Filtering",
    question: "A pure sinusoid passes through an LTI filter. What can the filter NOT change?",
    options: ["Its amplitude", "Its phase", "Its frequency", "Nothing — all three can change"],
    correctIndex: 2,
    rationale:
      "|H(jw)| scales the amplitude and the angle of H(jw) shifts the phase, but an LTI system never moves energy to a new frequency.",
    marker: "the magnitude |H(jw)| multiplies the amplitude",
  },
  {
    key: "ss-q-nyquist",
    doc: SS_NOTES,
    page: 8,
    topic: "Sampling",
    question: "A signal contains no frequencies above 4 kHz. What is the minimum sampling rate for perfect reconstruction?",
    options: ["2 kHz", "4 kHz", "Just above 8 kHz", "16 kHz"],
    correctIndex: 2,
    rationale:
      "The sampling theorem requires a rate strictly greater than twice the highest frequency present — here, just above 2 × 4 kHz.",
    marker: "if x(t) contains no frequencies above B",
  },
  {
    key: "ss-q-poles",
    doc: SS_NOTES,
    page: 9,
    topic: "Transforms",
    question: "Where must the poles of a causal continuous-time system lie for it to be stable?",
    options: [
      "Strictly inside the unit circle",
      "Strictly in the left half of the s-plane",
      "On the imaginary axis",
      "Anywhere, as long as there are no zeros in the right half-plane",
    ],
    correctIndex: 1,
    rationale:
      "Each pole contributes a mode e^(pt), which decays only when the pole's real part is negative — i.e. in the left half-plane. (The unit-circle rule is the discrete-time analogue.)",
    marker: "A causal system is stable exactly when",
    extraSentences: 0,
  },
];

export function buildDemoQuizzes(): Record<string, QuizQuestion[]> {
  const byDocument: Record<string, QuizQuestion[]> = {};
  for (const spec of QUIZ_SPECS) {
    const question: QuizQuestion = {
      id: `quiz-${spec.key}`,
      documentId: spec.doc.id,
      topic: spec.topic,
      question: spec.question,
      options: spec.options,
      correctIndex: spec.correctIndex,
      rationale: spec.rationale,
      sourceChunkId: demoChunkId(spec.doc.id, spec.page),
      sourceExcerpt: excerptFor(spec.doc, spec.page, spec.marker, spec.extraSentences ?? 1),
      pageStart: spec.page,
      pageEnd: spec.page,
    };
    (byDocument[spec.doc.id] ??= []).push(question);
  }
  return byDocument;
}
