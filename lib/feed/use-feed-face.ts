"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The two interchangeable faces the feed can render for the same card. */
export type FeedFace = "text" | "video";

const FEED_FACE_STORAGE_KEY = "bloomscroll-feed-face";

/** Text is the default: it needs no credentials, no TTS spend, and no
 * rendered mp4, so a fresh visitor always gets a working feed. */
export const DEFAULT_FEED_FACE: FeedFace = "text";

const listeners = new Set<() => void>();
/** Authoritative for this tab when localStorage is unavailable (private
 * mode, blocked storage) so the toggle still works, just without persisting. */
let memoryFace: FeedFace | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` fires only in *other* tabs, so it complements the local emit.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readFace(): FeedFace {
  try {
    const stored = window.localStorage.getItem(FEED_FACE_STORAGE_KEY);
    if (stored === "video" || stored === "text") return stored;
  } catch {
    // fall through to the in-memory value
  }
  return memoryFace ?? DEFAULT_FEED_FACE;
}

/**
 * Persisted choice between the text-card and video-reel faces.
 *
 * Uses useSyncExternalStore rather than useState + a hydration effect
 * because this preference decides *which component renders*: the server
 * snapshot is pinned to DEFAULT_FEED_FACE so SSR and the first client
 * render always agree, and the stored value is adopted on subscribe
 * without a hydration mismatch. (The mute preference can get away with
 * plain useState because it only feeds a video property, never markup.)
 */
export function useFeedFacePreference(): [FeedFace, (face: FeedFace) => void] {
  const face = useSyncExternalStore(subscribe, readFace, () => DEFAULT_FEED_FACE);

  const setFace = useCallback((next: FeedFace) => {
    memoryFace = next;
    try {
      window.localStorage.setItem(FEED_FACE_STORAGE_KEY, next);
    } catch {
      // Storage may be blocked; the preference just won't survive a reload.
    }
    for (const listener of listeners) listener();
  }, []);

  return [face, setFace];
}
