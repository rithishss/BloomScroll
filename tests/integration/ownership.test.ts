import { describe, expect, it } from "vitest";
import { FakeSupabaseClient } from "@/tests/integration/fakes/fake-supabase";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import { recordCardEvent } from "@/lib/api/events-service";
import {
  deleteDocumentCompletely,
  getDocumentDetail,
  listUserDocuments,
} from "@/lib/api/documents-service";
import { buildFeedPage } from "@/lib/api/feed-service";

function asClient(fake: FakeSupabaseClient): TypedSupabaseClient {
  return fake as unknown as TypedSupabaseClient;
}

/**
 * These tests exercise the real service modules against a fake Supabase
 * client that simulates Row Level Security (see fakes/fake-supabase.ts):
 * any row with a `user_id` column is invisible unless it matches the fake
 * client's `asUser`. This directly covers "unauthorized document access is
 * rejected" and "retrieval filters by authenticated owner" using the exact
 * code path production traffic runs, not a description of the SQL.
 */

describe("recordCardEvent — ownership", () => {
  it("returns null for a card owned by a different user (never mutates it)", async () => {
    const fake = new FakeSupabaseClient("user-a").seed("study_cards", [
      { id: "card-1", user_id: "user-b", topic: "CPU Scheduling", document_id: "doc-1" },
    ]);
    const result = await recordCardEvent(asClient(fake), "user-a", {
      cardId: "card-1",
      eventType: "understood",
    });
    expect(result).toBeNull();
    // No event should have been recorded for someone else's card.
    expect(fake.tables.card_events ?? []).toHaveLength(0);
  });

  it("records an event and updates mastery for a card the user actually owns", async () => {
    const fake = new FakeSupabaseClient("user-a").seed("study_cards", [
      { id: "card-1", user_id: "user-a", topic: "CPU Scheduling", document_id: "doc-1" },
    ]);
    const result = await recordCardEvent(asClient(fake), "user-a", {
      cardId: "card-1",
      eventType: "understood",
    });
    expect(result).not.toBeNull();
    expect(result!.masteryScore).toBeGreaterThan(0);
    expect(fake.tables.card_events).toHaveLength(1);
    expect(fake.tables.card_events![0]).toMatchObject({ user_id: "user-a", card_id: "card-1" });
  });

  it("cannot be tricked into writing an event under a different user_id", async () => {
    // Even if a card is visible, every write the service performs uses the
    // server-verified userId argument — there is no client-supplied user_id
    // for it to spoof.
    const fake = new FakeSupabaseClient("user-a").seed("study_cards", [
      { id: "card-1", user_id: "user-a", topic: "Topic", document_id: "doc-1" },
    ]);
    await recordCardEvent(asClient(fake), "user-a", { cardId: "card-1", eventType: "save" });
    for (const row of fake.tables.card_events ?? []) {
      expect(row.user_id).toBe("user-a");
    }
    for (const row of fake.tables.card_states ?? []) {
      expect(row.user_id).toBe("user-a");
    }
  });
});

describe("documents-service — ownership", () => {
  it("does not list another user's documents", async () => {
    const fake = new FakeSupabaseClient("user-a").seed("documents", [
      {
        id: "doc-a",
        user_id: "user-a",
        title: "My notes",
        original_filename: "a.pdf",
        storage_path: "user-a/doc-a/a.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 100,
        page_count: 1,
        status: "ready",
        processing_progress: 100,
        error_message: null,
        last_studied_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "doc-b",
        user_id: "user-b",
        title: "Someone else's notes",
        original_filename: "b.pdf",
        storage_path: "user-b/doc-b/b.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 100,
        page_count: 1,
        status: "ready",
        processing_progress: 100,
        error_message: null,
        last_studied_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const docs = await listUserDocuments(asClient(fake), "user-a");
    expect(docs.map((d) => d.id)).toEqual(["doc-a"]);
  });

  it("getDocumentDetail returns null for a document owned by another user", async () => {
    const fake = new FakeSupabaseClient("user-a").seed("documents", [
      {
        id: "doc-b",
        user_id: "user-b",
        title: "Not yours",
        original_filename: "b.pdf",
        storage_path: "user-b/doc-b/b.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 100,
        page_count: 1,
        status: "ready",
        processing_progress: 100,
        error_message: null,
        last_studied_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const detail = await getDocumentDetail(asClient(fake), "user-a", "doc-b");
    expect(detail).toBeNull();
  });

  it("refuses to delete a document belonging to another user", async () => {
    const fake = new FakeSupabaseClient("user-a").seed("documents", [
      {
        id: "doc-b",
        user_id: "user-b",
        title: "Not yours",
        original_filename: "b.pdf",
        storage_path: "user-b/doc-b/b.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 100,
        page_count: 1,
        status: "ready",
        processing_progress: 100,
        error_message: null,
        last_studied_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const deleted = await deleteDocumentCompletely(asClient(fake), "user-a", "doc-b");
    expect(deleted).toBe(false);
    // The other user's document must still exist.
    expect(fake.tables.documents).toHaveLength(1);
  });
});

describe("buildFeedPage — ownership", () => {
  function ownedCard(id: string, userId: string, documentId: string) {
    return {
      id,
      document_id: documentId,
      user_id: userId,
      card_type: "concept",
      topic: "Topic",
      title: `Card ${id}`,
      explanation: "Explanation text long enough to be meaningful for this test fixture.",
      question: null,
      answer: null,
      takeaway: null,
      difficulty: "core",
      source_chunk_ids: [],
      source_excerpt: "excerpt",
      page_start: 1,
      page_end: 1,
      generation_version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
    };
  }

  it("never returns another user's cards in the feed", async () => {
    const fake = new FakeSupabaseClient("user-a")
      .seed("profiles", [{ id: "user-a", preferred_difficulty: "core" }])
      .seed("documents", [
        { id: "doc-a", user_id: "user-a", title: "Mine", status: "ready" },
        { id: "doc-b", user_id: "user-b", title: "Not mine", status: "ready" },
      ])
      .seed("study_cards", [
        ownedCard("card-a", "user-a", "doc-a"),
        ownedCard("card-b", "user-b", "doc-b"),
      ])
      .seed("card_states", [])
      .seed("topic_preferences", [])
      .seed("card_events", []);

    const page = await buildFeedPage(asClient(fake), "user-a", { cursor: 0, limit: 8 });
    expect(page.items.map((i) => i.card.id)).toEqual(["card-a"]);
  });

  it("returns an empty feed when the user owns no ready documents", async () => {
    const fake = new FakeSupabaseClient("user-a")
      .seed("profiles", [{ id: "user-a", preferred_difficulty: "core" }])
      .seed("documents", [])
      .seed("study_cards", [])
      .seed("card_states", [])
      .seed("topic_preferences", [])
      .seed("card_events", []);
    const page = await buildFeedPage(asClient(fake), "user-a", { cursor: 0, limit: 8 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
