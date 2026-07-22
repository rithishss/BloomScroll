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
  StudyGoal,
  Difficulty,
  TopicPreference,
} from "@/lib/types";

/**
 * The single seam between UI and data. Screens receive a DataProvider via
 * React context and never know whether they're talking to the seeded demo
 * workspace (localStorage) or the Supabase-backed API routes — which is how
 * demo and real mode share every component.
 */
export interface DataProvider {
  readonly mode: "demo" | "real";

  getProfile(): Promise<Profile>;
  updateProfile(patch: {
    displayName?: string;
    studyGoal?: StudyGoal;
    preferredDifficulty?: Difficulty;
    onboardingCompleted?: boolean;
  }): Promise<Profile>;

  getTopicPreferences(): Promise<TopicPreference[]>;
  setTopicPreference(topic: string, explicitWeight: number): Promise<void>;
  removeTopicPreference(topic: string): Promise<void>;

  listDocuments(): Promise<DocumentSummary[]>;
  getDocument(documentId: string): Promise<DocumentDetail>;
  /** Starts an upload; resolves once the document record exists. Processing
   * continues in the background and is observable via polling listDocuments/getDocument. */
  uploadDocument(file: File): Promise<DocumentSummary>;
  retryProcessing(documentId: string): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  /** Short-lived signed URL in real mode; a repo-owned PDF in demo mode.
   * `null` url with a note when a direct link cannot be produced. */
  getDocumentUrl(documentId: string): Promise<{ url: string | null; note: string | null }>;

  getFeed(opts: {
    documentIds?: string[];
    cursor?: string | null;
    limit?: number;
  }): Promise<FeedPage>;
  recordEvent(input: {
    cardId: string;
    eventType: CardEventType;
    dwellMs?: number | null;
  }): Promise<CardState | null>;

  listSavedCards(): Promise<FeedItem[]>;
  searchCards(query: string): Promise<FeedItem[]>;
  /** Resolves stored source passages (always ownership-filtered in real mode). */
  getChunks(chunkIds: string[]): Promise<SourceChunk[]>;

  ask(input: {
    question: string;
    documentIds: string[];
    threadId?: string | null;
  }): Promise<AskResult>;
  listThreads(): Promise<ChatThread[]>;
  getThreadMessages(threadId: string): Promise<ChatMessage[]>;

  deleteAllData(): Promise<void>;
  /** Real mode: ends the Supabase session. Demo mode: no-op. */
  signOut(): Promise<void>;
}
