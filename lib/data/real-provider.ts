import type { DataProvider } from "@/lib/data/provider";
import type {
  AskResult,
  CardEventType,
  CardState,
  ChatMessage,
  ChatThread,
  DocumentDetail,
  DocumentSummary,
  FeedPage,
  FeedItem,
  Profile,
  SourceChunk,
  StudyGoal,
  Difficulty,
  TopicPreference,
} from "@/lib/types";

/**
 * Real-mode provider: a thin, typed client over the /api routes. All
 * authorization happens server-side (session cookie + RLS); this class just
 * shapes requests and unwraps the typed error envelope.
 */

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error?.message) message = body.error.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export class RealProvider implements DataProvider {
  readonly mode = "real" as const;

  async getProfile(): Promise<Profile> {
    const { profile } = await call<{ profile: Profile }>("/api/profile");
    return profile;
  }

  async updateProfile(patch: {
    displayName?: string;
    studyGoal?: StudyGoal;
    preferredDifficulty?: Difficulty;
    onboardingCompleted?: boolean;
  }): Promise<Profile> {
    const { profile } = await call<{ profile: Profile }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return profile;
  }

  async getTopicPreferences(): Promise<TopicPreference[]> {
    const { topics } = await call<{ topics: TopicPreference[] }>("/api/topics");
    return topics;
  }

  async setTopicPreference(topic: string, explicitWeight: number): Promise<void> {
    await call("/api/topics", { method: "PUT", body: JSON.stringify({ topic, explicitWeight }) });
  }

  async removeTopicPreference(topic: string): Promise<void> {
    await call("/api/topics", { method: "DELETE", body: JSON.stringify({ topic }) });
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const { documents } = await call<{ documents: DocumentSummary[] }>("/api/documents");
    return documents;
  }

  async getDocument(documentId: string): Promise<DocumentDetail> {
    const { document } = await call<{ document: DocumentDetail }>(
      `/api/documents/${encodeURIComponent(documentId)}`,
    );
    return document;
  }

  async uploadDocument(file: File): Promise<DocumentSummary> {
    const formData = new FormData();
    formData.append("file", file);
    const { document } = await call<{ document: DocumentSummary }>("/api/documents", {
      method: "POST",
      body: formData,
    });
    // Kick off processing; it runs server-side while the user browses.
    // Fire-and-forget: failures are recorded on the document row and
    // surfaced in the library with a retry action.
    void fetch(`/api/documents/${encodeURIComponent(document.id)}/process`, {
      method: "POST",
    }).catch(() => {});
    return document;
  }

  async retryProcessing(documentId: string): Promise<void> {
    await call(`/api/documents/${encodeURIComponent(documentId)}/process`, { method: "POST" });
  }

  async deleteDocument(documentId: string): Promise<void> {
    await call(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  }

  async getDocumentUrl(documentId: string): Promise<{ url: string | null; note: string | null }> {
    return call(`/api/documents/${encodeURIComponent(documentId)}/signed-url`);
  }

  async getCardVideoUrl(cardId: string): Promise<{ url: string | null; note: string | null }> {
    return call(`/api/cards/${encodeURIComponent(cardId)}/video-url`);
  }

  async getFeed(opts: {
    documentIds?: string[];
    cursor?: string | null;
    limit?: number;
  }): Promise<FeedPage> {
    const params = new URLSearchParams();
    for (const id of opts.documentIds ?? []) params.append("documentId", id);
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    return call(`/api/feed?${params.toString()}`);
  }

  async recordEvent(input: {
    cardId: string;
    eventType: CardEventType;
    dwellMs?: number | null;
  }): Promise<CardState | null> {
    const { state } = await call<{ state: CardState | null }>("/api/events", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return state;
  }

  async listSavedCards(): Promise<FeedItem[]> {
    const { items } = await call<{ items: FeedItem[] }>("/api/saved");
    return items;
  }

  async searchCards(query: string): Promise<FeedItem[]> {
    const { items } = await call<{ items: FeedItem[] }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    );
    return items;
  }

  async getChunks(chunkIds: string[]): Promise<SourceChunk[]> {
    const { chunks } = await call<{ chunks: SourceChunk[] }>("/api/chunks", {
      method: "POST",
      body: JSON.stringify({ chunkIds }),
    });
    return chunks;
  }

  async ask(input: {
    question: string;
    documentIds: string[];
    threadId?: string | null;
  }): Promise<AskResult> {
    return call("/api/ask", { method: "POST", body: JSON.stringify(input) });
  }

  async listThreads(): Promise<ChatThread[]> {
    const { threads } = await call<{ threads: ChatThread[] }>("/api/threads");
    return threads;
  }

  async getThreadMessages(threadId: string): Promise<ChatMessage[]> {
    const { messages } = await call<{ messages: ChatMessage[] }>(
      `/api/threads/${encodeURIComponent(threadId)}`,
    );
    return messages;
  }

  async deleteAllData(): Promise<void> {
    await call("/api/account", { method: "DELETE" });
  }

  async signOut(): Promise<void> {
    await call("/api/auth/signout", { method: "POST" });
  }
}
