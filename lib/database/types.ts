/**
 * Hand-maintained database types mirroring supabase/migrations. If you
 * change the schema, regenerate with `supabase gen types typescript` or
 * update these by hand — they are the single typing seam for supabase-js.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  study_goal: string;
  preferred_difficulty: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

type TopicPreferenceRow = {
  id: string;
  user_id: string;
  topic: string;
  explicit_weight: number;
  learned_weight: number;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  page_count: number | null;
  status: string;
  processing_progress: number;
  error_message: string | null;
  last_studied_at: string | null;
  created_at: string;
  updated_at: string;
};

type DocumentChunkRow = {
  id: string;
  document_id: string;
  user_id: string;
  chunk_index: number;
  page_start: number;
  page_end: number;
  content: string;
  token_count: number;
  embedding: string | null;
  metadata: Json;
  created_at: string;
};

type StudyCardRow = {
  id: string;
  document_id: string;
  user_id: string;
  card_type: string;
  topic: string;
  title: string;
  explanation: string;
  question: string | null;
  answer: string | null;
  takeaway: string | null;
  difficulty: string;
  source_chunk_ids: string[];
  source_excerpt: string;
  page_start: number;
  page_end: number;
  generation_version: number;
  video_storage_path: string | null;
  video_duration_seconds: number | null;
  narration_script: string | null;
  created_at: string;
};

type CardEventRow = {
  id: string;
  user_id: string;
  card_id: string;
  event_type: string;
  dwell_ms: number | null;
  metadata: Json;
  created_at: string;
};

type CardStateRow = {
  user_id: string;
  card_id: string;
  saved: boolean;
  mastery_score: number;
  times_seen: number;
  last_seen_at: string | null;
  next_review_at: string | null;
  last_action: string | null;
  updated_at: string;
};

type ChatThreadRow = {
  id: string;
  user_id: string;
  title: string;
  selected_document_ids: string[];
  created_at: string;
  updated_at: string;
};

type ChatMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  role: string;
  content: string;
  citations: Json;
  created_at: string;
};

type TableDef<Row, Required extends keyof Row, Generated extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, "id", "created_at" | "updated_at">;
      topic_preferences: TableDef<
        TopicPreferenceRow,
        "user_id" | "topic",
        "id" | "created_at" | "updated_at"
      >;
      documents: TableDef<
        DocumentRow,
        "user_id" | "title" | "original_filename" | "storage_path" | "file_size_bytes",
        "id" | "created_at" | "updated_at"
      >;
      document_chunks: TableDef<
        DocumentChunkRow,
        "document_id" | "user_id" | "chunk_index" | "page_start" | "page_end" | "content",
        "id" | "created_at"
      >;
      study_cards: TableDef<
        StudyCardRow,
        | "document_id"
        | "user_id"
        | "card_type"
        | "topic"
        | "title"
        | "explanation"
        | "difficulty"
        | "source_excerpt"
        | "page_start"
        | "page_end",
        "id" | "created_at"
      >;
      card_events: TableDef<
        CardEventRow,
        "user_id" | "card_id" | "event_type",
        "id" | "created_at"
      >;
      card_states: TableDef<CardStateRow, "user_id" | "card_id", "updated_at">;
      chat_threads: TableDef<
        ChatThreadRow,
        "user_id" | "title",
        "id" | "created_at" | "updated_at"
      >;
      chat_messages: TableDef<
        ChatMessageRow,
        "thread_id" | "user_id" | "role" | "content",
        "id" | "created_at"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      match_document_chunks: {
        Args: {
          query_embedding: string;
          selected_document_ids?: string[] | null;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          chunk_id: string;
          document_id: string;
          document_title: string;
          chunk_index: number;
          page_start: number;
          page_end: number;
          content: string;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
