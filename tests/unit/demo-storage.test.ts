import { describe, expect, it } from "vitest";
import { DemoStore, MemoryKV, freshDemoState } from "@/lib/demo/storage";

describe("DemoStore", () => {
  it("seeds fresh state on first load", () => {
    const store = new DemoStore(new MemoryKV());
    const state = store.load();
    expect(state.profile.id).toBe("demo-user");
    expect(state.events).toEqual([]);
  });

  it("persists updates across separate store instances sharing the same KV", () => {
    const kv = new MemoryKV();
    const first = new DemoStore(kv);
    first.update((s) => ({ ...s, profile: { ...s.profile, displayName: "Ada" } }));

    const second = new DemoStore(kv);
    expect(second.load().profile.displayName).toBe("Ada");
  });

  it("caches state in memory rather than re-reading the KV on every load", () => {
    let reads = 0;
    const kv = new MemoryKV();
    const countingKv = {
      get: (key: string) => {
        reads += 1;
        return kv.get(key);
      },
      set: (key: string, value: string) => kv.set(key, value),
      remove: (key: string) => kv.remove(key),
    };
    const store = new DemoStore(countingKv);
    store.load();
    store.load();
    store.load();
    expect(reads).toBe(1);
  });

  it("falls back to fresh state when the stored JSON is corrupt", () => {
    const kv = new MemoryKV();
    kv.set("bloomscroll-demo-v1", "{not valid json");
    const store = new DemoStore(kv);
    expect(store.load().profile.id).toBe("demo-user");
  });

  it("falls back to fresh state when the stored version is stale", () => {
    const kv = new MemoryKV();
    kv.set("bloomscroll-demo-v1", JSON.stringify({ ...freshDemoState(), version: 0 }));
    const store = new DemoStore(kv);
    expect(store.load().version).toBe(1);
  });

  it("reset() clears state so the next load reseeds", () => {
    const kv = new MemoryKV();
    const store = new DemoStore(kv);
    store.update((s) => ({ ...s, profile: { ...s.profile, displayName: "Changed" } }));
    store.reset();
    expect(store.load().profile.displayName).toBe("Demo Student");
  });

  it("caps the retained event log at 400 entries", () => {
    const store = new DemoStore(new MemoryKV());
    store.update((s) => ({
      ...s,
      events: Array.from({ length: 450 }, (_, i) => ({
        cardId: `c${i}`,
        topic: "Topic",
        eventType: "impression" as const,
        dwellMs: null,
        createdAt: new Date().toISOString(),
      })),
    }));
    expect(store.load().events.length).toBe(400);
  });
});
