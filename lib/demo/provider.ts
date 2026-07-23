import type { DataProvider } from "@/lib/data/provider";
import type {
  AskResult,
  CardEventType,
  CardState,
  ChatMessage,
  ChatThread,
  DocumentDetail,
  DocumentSummary,
  FeedItem,
  FeedPage,
  Profile,
  SourceChunk,
  StudyCard,
  StudyGoal,
  Difficulty,
  TopicPreference,
} from "@/lib/types";
import {
  applyCardEvent,
  isTopicSuppressed,
  learnedWeightDelta,
  trackSkip,
} from "@/lib/feed/mastery";
import { deriveTopicEngagement, explorationSeed, rankCards } from "@/lib/feed/ranking";
import { buildDemoAnswer } from "@/lib/demo/retrieval";
import { buildDemoCards, buildDemoChunks, buildDemoDocuments, DEMO_USER_ID } from "@/lib/demo/seed";
import { DemoStore, LocalStorageKV, type KeyValueStore } from "@/lib/demo/storage";
import { validatePdfUpload } from "@/lib/validation/upload";
import { titleFromFilename } from "@/lib/validation/upload";
import { clamp01, hash01 } from "@/lib/utils";

const UPLOAD_NOTE =
  "Demo uploads are simulated entirely in your browser — the file never leaves your machine and no AI is called, so no cards are generated. Connect Supabase and OpenAI (see the README) to process real PDFs.";

/** Simulated pipeline stages for demo uploads: honest theatre, clearly labeled. */
const DEMO_STAGES: Array<{ status: DocumentSummary["status"]; progress: number; delayMs: number }> =
  [
    { status: "extracting", progress: 18, delayMs: 900 },
    { status: "chunking", progress: 34, delayMs: 900 },
    { status: "embedding", progress: 52, delayMs: 1000 },
    { status: "generating", progress: 68, delayMs: 1100 },
    { status: "rendering", progress: 90, delayMs: 1300 },
    { status: "ready", progress: 100, delayMs: 800 },
  ];

export class DemoProvider implements DataProvider {
  readonly mode = "demo" as const;

  private store: DemoStore;
  private seedCards: StudyCard[];
  private seedChunks: SourceChunk[];
  private processingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(kv: KeyValueStore = new LocalStorageKV()) {
    this.store = new DemoStore(kv);
    this.seedCards = buildDemoCards();
    this.seedChunks = buildDemoChunks();
  }

  // ── Profile & preferences ────────────────────────────────────────────

  async getProfile(): Promise<Profile> {
    return this.store.load().profile;
  }

  async updateProfile(patch: {
    displayName?: string;
    studyGoal?: StudyGoal;
    preferredDifficulty?: Difficulty;
    onboardingCompleted?: boolean;
  }): Promise<Profile> {
    const state = this.store.update((s) => ({
      ...s,
      profile: { ...s.profile, ...patch },
    }));
    return state.profile;
  }

  async getTopicPreferences(): Promise<TopicPreference[]> {
    return this.store.load().topicPrefs;
  }

  async setTopicPreference(topic: string, explicitWeight: number): Promise<void> {
    this.store.update((s) => {
      const existing = s.topicPrefs.find((p) => p.topic === topic);
      const topicPrefs = existing
        ? s.topicPrefs.map((p) =>
            p.topic === topic ? { ...p, explicitWeight: clamp01(explicitWeight) } : p,
          )
        : [...s.topicPrefs, { topic, explicitWeight: clamp01(explicitWeight), learnedWeight: 0.3 }];
      return { ...s, topicPrefs };
    });
  }

  async removeTopicPreference(topic: string): Promise<void> {
    this.store.update((s) => ({
      ...s,
      topicPrefs: s.topicPrefs.filter((p) => p.topic !== topic),
    }));
  }

  // ── Documents ────────────────────────────────────────────────────────

  private allDocuments(): DocumentSummary[] {
    const s = this.store.load();
    const seeded = buildDemoDocuments().filter((d) => !s.deletedDocIds.includes(d.id));
    return [...s.uploadedDocs, ...seeded].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    return this.allDocuments();
  }

  async getDocument(documentId: string): Promise<DocumentDetail> {
    const doc = this.allDocuments().find((d) => d.id === documentId);
    if (!doc) throw new Error("Document not found");
    const s = this.store.load();
    const cards = this.seedCards.filter((c) => c.documentId === documentId);
    const byTopic = new Map<string, StudyCard[]>();
    for (const card of cards) {
      byTopic.set(card.topic, [...(byTopic.get(card.topic) ?? []), card]);
    }
    const topicBreakdown = [...byTopic.entries()].map(([topic, topicCards]) => {
      const masteries = topicCards.map((c) => s.states[c.id]?.masteryScore ?? 0);
      return {
        topic,
        cardCount: topicCards.length,
        masteryAvg: masteries.reduce((a, b) => a + b, 0) / Math.max(1, masteries.length),
      };
    });
    return { ...doc, topicBreakdown, previewCards: cards.slice(0, 6) };
  }

  async uploadDocument(file: File): Promise<DocumentSummary> {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const result = validatePdfUpload({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      headBytes: head,
      maxSizeBytes: 20 * 1024 * 1024,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    const id = `demo-upload-${Date.now()}-${Math.floor(hash01(file.name + file.size) * 1e6)}`;
    const doc: DocumentSummary = {
      id,
      title: titleFromFilename(result.sanitizedFilename),
      originalFilename: result.sanitizedFilename,
      pageCount: null,
      fileSizeBytes: file.size,
      status: "queued",
      processingProgress: 8,
      errorMessage: null,
      cardCount: 0,
      chunkCount: 0,
      topics: [],
      lastStudiedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.store.update((s) => ({ ...s, uploadedDocs: [doc, ...s.uploadedDocs] }));
    this.runSimulatedPipeline(id);
    return doc;
  }

  private runSimulatedPipeline(documentId: string): void {
    // Cancel any prior run for this doc (retry safety).
    const existing = this.processingTimers.get(documentId);
    if (existing) clearTimeout(existing);

    const advance = (stageIndex: number) => {
      if (stageIndex >= DEMO_STAGES.length) {
        this.processingTimers.delete(documentId);
        return;
      }
      const stage = DEMO_STAGES[stageIndex];
      const timer = setTimeout(() => {
        this.store.update((s) => ({
          ...s,
          uploadedDocs: s.uploadedDocs.map((d) =>
            d.id === documentId
              ? { ...d, status: stage.status, processingProgress: stage.progress }
              : d,
          ),
        }));
        advance(stageIndex + 1);
      }, stage.delayMs);
      this.processingTimers.set(documentId, timer);
    };
    advance(0);
  }

  async retryProcessing(documentId: string): Promise<void> {
    this.store.update((s) => ({
      ...s,
      uploadedDocs: s.uploadedDocs.map((d) =>
        d.id === documentId
          ? { ...d, status: "queued", processingProgress: 8, errorMessage: null }
          : d,
      ),
    }));
    this.runSimulatedPipeline(documentId);
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.store.update((s) => {
      if (s.uploadedDocs.some((d) => d.id === documentId)) {
        return { ...s, uploadedDocs: s.uploadedDocs.filter((d) => d.id !== documentId) };
      }
      return { ...s, deletedDocIds: [...new Set([...s.deletedDocIds, documentId])] };
    });
  }

  async getDocumentUrl(documentId: string): Promise<{ url: string | null; note: string | null }> {
    const seeded = buildDemoDocuments().find((d) => d.id === documentId);
    if (seeded) {
      return { url: `/demo-pdfs/${seeded.originalFilename}`, note: null };
    }
    return { url: null, note: UPLOAD_NOTE };
  }

  async getCardVideoUrl(cardId: string): Promise<{ url: string | null; note: string | null }> {
    const card = this.seedCards.find((c) => c.id === cardId);
    if (card?.videoDurationSeconds != null) {
      return { url: `/demo-videos/${card.id}.mp4`, note: null };
    }
    return {
      url: null,
      note: "This demo card doesn't have a pre-rendered reel yet.",
    };
  }

  // ── Feed & interactions ──────────────────────────────────────────────

  private candidateCards(documentIds?: string[]): StudyCard[] {
    const visibleDocIds = new Set(this.allDocuments().map((d) => d.id));
    let cards = this.seedCards.filter((c) => visibleDocIds.has(c.documentId));
    if (documentIds && documentIds.length > 0) {
      const wanted = new Set(documentIds);
      cards = cards.filter((c) => wanted.has(c.documentId));
    }
    return cards;
  }

  private toFeedItem(card: StudyCard, reasons: string[]): FeedItem {
    const s = this.store.load();
    return { card, state: s.states[card.id] ?? null, reasons };
  }

  async getFeed(opts: {
    documentIds?: string[];
    cursor?: string | null;
    limit?: number;
  }): Promise<FeedPage> {
    const s = this.store.load();
    const now = new Date();
    const limit = opts.limit ?? 8;
    const offset = opts.cursor ? Number.parseInt(opts.cursor, 10) || 0 : 0;

    // Cards mastered recently (understood, review scheduled in the future)
    // rest until they are due again.
    const candidates = this.candidateCards(opts.documentIds).filter((card) => {
      const state = s.states[card.id];
      if (!state) return true;
      if (state.lastAction === "understood" && state.nextReviewAt) {
        return new Date(state.nextReviewAt) <= now;
      }
      return true;
    });

    const suppressed = new Set(
      Object.keys(s.skipTracker.suppressedUntil).filter((topic) =>
        isTopicSuppressed(s.skipTracker, topic, now),
      ),
    );

    const ranked = rankCards(candidates, {
      preferences: s.topicPrefs,
      states: new Map(Object.entries(s.states)),
      preferredDifficulty: s.profile.preferredDifficulty,
      topicEngagement: deriveTopicEngagement(s.events.slice(-200)),
      suppressedTopics: suppressed,
      now,
      seed: explorationSeed(DEMO_USER_ID, now),
    });

    const page = ranked.slice(offset, offset + limit);
    const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;
    return {
      items: page.map((r) => this.toFeedItem(r.card, r.reasons)),
      nextCursor,
    };
  }

  async recordEvent(input: {
    cardId: string;
    eventType: CardEventType;
    dwellMs?: number | null;
  }): Promise<CardState | null> {
    const card = this.seedCards.find((c) => c.id === input.cardId);
    if (!card) return null;
    const now = new Date();

    let resultState: CardState | null = null;
    this.store.update((s) => {
      // Dedupe: identical impressions within 5s are rerender noise, not views.
      if (input.eventType === "impression") {
        const recent = [...s.events]
          .reverse()
          .find((e) => e.cardId === input.cardId && e.eventType === "impression");
        if (recent && now.getTime() - new Date(recent.createdAt).getTime() < 5000) {
          resultState = s.states[input.cardId] ?? null;
          return s;
        }
      }

      const nextState = applyCardEvent(
        s.states[input.cardId] ?? null,
        input.cardId,
        input.eventType,
        now,
      );
      resultState = nextState;

      const delta = learnedWeightDelta(input.eventType, input.dwellMs);
      let topicPrefs = s.topicPrefs;
      if (delta !== 0) {
        const existing = topicPrefs.find((p) => p.topic === card.topic);
        topicPrefs = existing
          ? topicPrefs.map((p) =>
              p.topic === card.topic
                ? { ...p, learnedWeight: clamp01(p.learnedWeight + delta) }
                : p,
            )
          : [
              ...topicPrefs,
              { topic: card.topic, explicitWeight: 0.5, learnedWeight: clamp01(0.3 + delta) },
            ];
      }

      const skipTracker =
        input.eventType === "skip"
          ? trackSkip(s.skipTracker, card.topic, input.dwellMs, now)
          : s.skipTracker;

      const uploadedDocs = s.uploadedDocs;
      return {
        ...s,
        states: { ...s.states, [input.cardId]: nextState },
        events: [
          ...s.events,
          {
            cardId: input.cardId,
            topic: card.topic,
            eventType: input.eventType,
            dwellMs: input.dwellMs ?? null,
            createdAt: now.toISOString(),
          },
        ],
        topicPrefs,
        skipTracker,
        uploadedDocs,
      };
    });
    return resultState;
  }

  async listSavedCards(): Promise<FeedItem[]> {
    const s = this.store.load();
    return this.candidateCards()
      .filter((c) => s.states[c.id]?.saved)
      .map((c) => this.toFeedItem(c, []));
  }

  async searchCards(query: string): Promise<FeedItem[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (terms.length === 0) return [];
    return this.candidateCards()
      .map((card) => {
        const haystack =
          `${card.title} ${card.topic} ${card.explanation} ${card.documentTitle}`.toLowerCase();
        const hits = terms.filter((t) => haystack.includes(t)).length;
        return { card, hits };
      })
      .filter(({ hits }) => hits === terms.length)
      .slice(0, 12)
      .map(({ card }) => this.toFeedItem(card, []));
  }

  async getChunks(chunkIds: string[]): Promise<SourceChunk[]> {
    const wanted = new Set(chunkIds);
    return this.seedChunks.filter((chunk) => wanted.has(chunk.id));
  }

  // ── Ask Bloom ────────────────────────────────────────────────────────

  async ask(input: {
    question: string;
    documentIds: string[];
    threadId?: string | null;
  }): Promise<AskResult> {
    const question = input.question.trim();
    if (question.length < 3) {
      throw new Error("Please ask a longer question.");
    }
    const wanted = new Set(input.documentIds);
    const chunks = this.seedChunks.filter((c) => wanted.has(c.documentId));
    const { answer, citations, insufficientEvidence } = buildDemoAnswer(question, chunks);

    const now = new Date().toISOString();
    let threadId = input.threadId ?? null;
    this.store.update((s) => {
      let threads = s.threads;
      if (!threadId) {
        threadId = `demo-thread-${Date.now()}`;
        threads = [
          {
            id: threadId,
            title: question.slice(0, 64),
            selectedDocumentIds: input.documentIds,
            createdAt: now,
            updatedAt: now,
          },
          ...threads,
        ];
      } else {
        threads = threads.map((t) => (t.id === threadId ? { ...t, updatedAt: now } : t));
      }
      const messages: ChatMessage[] = [
        ...(s.messages[threadId] ?? []),
        {
          id: `msg-${Date.now()}-u`,
          role: "user",
          content: question,
          citations: [],
          createdAt: now,
        },
        {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: answer,
          citations,
          createdAt: now,
        },
      ];
      return { ...s, threads, messages: { ...s.messages, [threadId]: messages } };
    });

    return { threadId: threadId as string, answer, citations, insufficientEvidence };
  }

  async listThreads(): Promise<ChatThread[]> {
    return this.store.load().threads;
  }

  async getThreadMessages(threadId: string): Promise<ChatMessage[]> {
    return this.store.load().messages[threadId] ?? [];
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async deleteAllData(): Promise<void> {
    for (const timer of this.processingTimers.values()) clearTimeout(timer);
    this.processingTimers.clear();
    this.store.reset();
  }

  async signOut(): Promise<void> {
    // Demo session has no auth; leaving the workspace is enough.
  }
}
