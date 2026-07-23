"use client";

import { useCallback, useState } from "react";

const MUTE_STORAGE_KEY = "bloomscroll-reel-muted";

/**
 * Persisted mute preference for the reel feed. Starts muted (autoplay with
 * sound is blocked by browsers without a prior user gesture); once someone
 * unmutes, later reels in this browser stay unmuted until they mute again.
 */
export function useReelMutePreference(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(MUTE_STORAGE_KEY) !== "false";
  });

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch {
        // Storage may be blocked; the preference just won't persist.
      }
      return next;
    });
  }, []);

  return [muted, toggle];
}
