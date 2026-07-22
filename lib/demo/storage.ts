import type {
  CardEventType,
  CardState,
  ChatMessage,
  ChatThread,
  DocumentSummary,
  Profile,
  TopicPreference,
} from "@/lib/types";
import { emptySkipTracker, type TopicSkipTracker } from "@/lib/feed/mastery";
import { DEMO_PROFILE, DEMO_TOPIC_PREFERENCES, buildInitialCardStates } from "@/lib/demo/seed";

/**
 * Demo-session persistence. The store is written against a tiny key-value
 * interface so unit tests can swap localStorage for an in-memory map.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryKV implements KeyValueStore {
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
}

export class LocalStorageKV implements KeyValueStore {
  get(key: string) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be full or blocked; the demo degrades to in-memory state.
    }
  }
  remove(key: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export interface DemoEvent {
  cardId: string;
  topic: string;
  eventType: CardEventType;
  dwellMs: number | null;
  createdAt: string;
}

export interface DemoPersistedState {
  version: number;
  profile: Profile;
  topicPrefs: TopicPreference[];
  states: Record<string, CardState>;
  events: DemoEvent[];
  skipTracker: TopicSkipTracker;
  deletedDocIds: string[];
  uploadedDocs: DocumentSummary[];
  threads: ChatThread[];
  messages: Record<string, ChatMessage[]>;
}

export const DEMO_STORAGE_KEY = "bloomscroll-demo-v1";
const STATE_VERSION = 1;
const MAX_EVENTS = 400;

export function freshDemoState(): DemoPersistedState {
  return {
    version: STATE_VERSION,
    profile: { ...DEMO_PROFILE },
    topicPrefs: DEMO_TOPIC_PREFERENCES.map((p) => ({ ...p })),
    states: buildInitialCardStates(),
    events: [],
    skipTracker: emptySkipTracker(),
    deletedDocIds: [],
    uploadedDocs: [],
    threads: [],
    messages: {},
  };
}

export class DemoStore {
  private cache: DemoPersistedState | null = null;

  constructor(private kv: KeyValueStore) {}

  load(): DemoPersistedState {
    if (this.cache) return this.cache;
    const raw = this.kv.get(DEMO_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoPersistedState;
        if (parsed && parsed.version === STATE_VERSION) {
          this.cache = parsed;
          return parsed;
        }
      } catch {
        // Corrupt state falls through to a fresh seed.
      }
    }
    this.cache = freshDemoState();
    return this.cache;
  }

  save(state: DemoPersistedState): void {
    if (state.events.length > MAX_EVENTS) {
      state = { ...state, events: state.events.slice(-MAX_EVENTS) };
    }
    this.cache = state;
    this.kv.set(DEMO_STORAGE_KEY, JSON.stringify(state));
  }

  /** Applies `fn` to the current state and persists the result. */
  update(fn: (state: DemoPersistedState) => DemoPersistedState): DemoPersistedState {
    const next = fn(this.load());
    this.save(next);
    return next;
  }

  reset(): void {
    this.cache = null;
    this.kv.remove(DEMO_STORAGE_KEY);
  }
}
