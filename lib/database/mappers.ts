import type { Database } from "@/lib/database/types";
import type {
  CardEventType,
  CardState,
  CardType,
  ChatMessage,
  ChatThread,
  Citation,
  Difficulty,
  DocumentStatus,
  DocumentSummary,
  Profile,
  SourceChunk,
  StudyCard,
  StudyGoal,
  TopicPreference,
} from "@/lib/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/** DB rows → shared domain types. Cast-narrowing happens only here, at the
 * storage boundary, so screens never see raw string unions. */

export function mapProfile(row: Row<"profiles">, email: string | null): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    studyGoal: row.study_goal as StudyGoal,
    preferredDifficulty: row.preferred_difficulty as Difficulty,
    onboardingCompleted: row.onboarding_completed,
    email,
  };
}

export function mapTopicPreference(row: Row<"topic_preferences">): TopicPreference {
  return {
    topic: row.topic,
    explicitWeight: row.explicit_weight,
    learnedWeight: row.learned_weight,
  };
}

export function mapDocument(
  row: Row<"documents">,
  extras: { cardCount: number; chunkCount: number; topics: string[] },
): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    pageCount: row.page_count,
    fileSizeBytes: row.file_size_bytes,
    status: row.status as DocumentStatus,
    processingProgress: row.processing_progress,
    errorMessage: row.error_message,
    cardCount: extras.cardCount,
    chunkCount: extras.chunkCount,
    topics: extras.topics,
    lastStudiedAt: row.last_studied_at,
    createdAt: row.created_at,
  };
}

export function mapStudyCard(row: Row<"study_cards">, documentTitle: string): StudyCard {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle,
    cardType: row.card_type as CardType,
    topic: row.topic,
    title: row.title,
    explanation: row.explanation,
    question: row.question,
    answer: row.answer,
    takeaway: row.takeaway,
    difficulty: row.difficulty as Difficulty,
    sourceChunkIds: row.source_chunk_ids,
    sourceExcerpt: row.source_excerpt,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    createdAt: row.created_at,
  };
}

export function mapCardState(row: Row<"card_states">): CardState {
  return {
    cardId: row.card_id,
    saved: row.saved,
    masteryScore: row.mastery_score,
    timesSeen: row.times_seen,
    lastSeenAt: row.last_seen_at,
    nextReviewAt: row.next_review_at,
    lastAction: row.last_action as CardEventType | null,
  };
}

export function mapCardStateToRow(
  userId: string,
  state: CardState,
): Database["public"]["Tables"]["card_states"]["Insert"] {
  return {
    user_id: userId,
    card_id: state.cardId,
    saved: state.saved,
    mastery_score: state.masteryScore,
    times_seen: state.timesSeen,
    last_seen_at: state.lastSeenAt,
    next_review_at: state.nextReviewAt,
    last_action: state.lastAction,
  };
}

export function mapChunk(row: Row<"document_chunks">, documentTitle: string): SourceChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle,
    chunkIndex: row.chunk_index,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    content: row.content,
  };
}

export function mapThread(row: Row<"chat_threads">): ChatThread {
  return {
    id: row.id,
    title: row.title,
    selectedDocumentIds: row.selected_document_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: Row<"chat_messages">): ChatMessage {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    citations: Array.isArray(row.citations) ? (row.citations as unknown as Citation[]) : [],
    createdAt: row.created_at,
  };
}
