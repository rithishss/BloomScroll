/**
 * Minimal per-user sliding-window rate limiter. In-memory and therefore
 * per-server-instance — adequate protection against accidental rapid-fire
 * AI requests in a portfolio deployment; swap for Redis/Upstash in a
 * multi-instance production setup.
 */

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000) };
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export const ASK_RATE_LIMIT = { limit: 10, windowMs: 60_000 };
export const PROCESS_RATE_LIMIT = { limit: 4, windowMs: 10 * 60_000 };
export const UPLOAD_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };
