/**
 * Shared domain types used by both the demo provider (localStorage-backed)
 * and the real provider (Supabase-backed API routes). Keeping one vocabulary
 * here is what lets every screen render identically in both modes.
 */

export type StudyGoal = "understand" | "exam" | "memorize";

export type Difficulty = "intro" | "core" | "advanced";

export const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  intro: 0,
  core: 1,
  advanced: 2,
};

export type DocumentStatus =
  | "queued"
  | "extracting"
  | "chunking"
  | "embedding"
  | "generating"
  | "rendering"
  | "ready"
  | "failed";

export type CardType = "concept" | "key_point" | "example" | "question" | "memory_hook";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  concept: "Concept",
  key_point: "Key point",
  example: "Example",
  question: "Question",
  memory_hook: "Memory hook",
};

export type CardEventType =
  "impression" | "understood" | "review_again" | "save" | "unsave" | "source_open" | "skip";

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  studyGoal: StudyGoal;
  preferredDifficulty: Difficulty;
  onboardingCompleted: boolean;
  email: string | null;
}

export interface TopicPreference {
  topic: string;
  /** Set during onboarding / settings; 0..1. */
  explicitWeight: number;
  /** Learned from saves, dwell time, and source opens; 0..1. */
  learnedWeight: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  originalFilename: string;
  pageCount: number | null;
  fileSizeBytes: number;
  status: DocumentStatus;
  processingProgress: number;
  errorMessage: string | null;
  cardCount: number;
  chunkCount: number;
  topics: string[];
  lastStudiedAt: string | null;
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  topicBreakdown: { topic: string; cardCount: number; masteryAvg: number }[];
  previewCards: StudyCard[];
  /** Number of generated quiz questions; 0 means no quiz to take. */
  quizCount: number;
}

export interface StudyCard {
  id: string;
  documentId: string;
  documentTitle: string;
  cardType: CardType;
  topic: string;
  title: string;
  explanation: string;
  question: string | null;
  answer: string | null;
  takeaway: string | null;
  difficulty: Difficulty;
  sourceChunkIds: string[];
  sourceExcerpt: string;
  pageStart: number;
  pageEnd: number;
  createdAt: string;
  /** The narrated reel rendered for this card. Null only for legacy rows
   * generated before video rendering existed, or while still processing. */
  videoDurationSeconds: number | null;
  /** Spoken narration text (usually the explanation + takeaway), shown as
   * captions under the reel. */
  narrationScript: string | null;
}

/**
 * A multiple-choice question generated from a document, alongside its cards
 * and from the same passages. `sourceExcerpt` + page range let a wrong
 * answer show the passage it came from rather than a bare "incorrect".
 */
export interface QuizQuestion {
  id: string;
  documentId: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
  sourceChunkId: string | null;
  sourceExcerpt: string;
  pageStart: number;
  pageEnd: number;
}

export interface CardState {
  cardId: string;
  saved: boolean;
  /** 0..1 */
  masteryScore: number;
  timesSeen: number;
  lastSeenAt: string | null;
  nextReviewAt: string | null;
  lastAction: CardEventType | null;
}

export interface FeedItem {
  card: StudyCard;
  state: CardState | null;
  /** Human-readable "Why this card?" reasons derived from ranking components. */
  reasons: string[];
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface Citation {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
}

export interface AskResult {
  threadId: string;
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  selectedDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface SourceChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
}

export const STUDY_GOAL_LABELS: Record<StudyGoal, string> = {
  understand: "Understand concepts",
  exam: "Review for an exam",
  memorize: "Memorize key facts",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  intro: "Intro",
  core: "Core",
  advanced: "Advanced",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  queued: "Queued",
  extracting: "Extracting text",
  chunking: "Organizing concepts",
  embedding: "Indexing meaning",
  generating: "Writing scripts",
  rendering: "Rendering reels",
  ready: "Ready",
  failed: "Failed",
};
