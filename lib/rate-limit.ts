/**
 * Simple in-memory sliding-window rate limiter for the citizen write routes
 * (report, photo upload, verdict). PLAN.md M6 item 6.
 *
 * In-memory and therefore PER PROCESS INSTANCE: on a multi-instance deploy each
 * instance keeps its own counters, so the effective limit is `limit x instances`.
 * That is an honest demo-grade guard against casual spam — NOT a substitute for
 * a distributed limiter (e.g. Upstash/Redis) in production. It is deliberately
 * never used for authentication (the console has its own, stricter limiter in
 * lib/console-rate-limit.ts).
 *
 * Memory is bounded: the map holds at most `MAX_KEYS` buckets; when full and a
 * new key arrives, the whole map is cleared. A three-second window means all
 * keys are cheap to hold, so a blunt clear is safe and avoids a leak.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still permitted in the current window (0 once blocked). */
  remaining: number;
  /** Seconds until the oldest hit leaves the window — for `Retry-After`. */
  retryAfterSeconds: number;
}

const MAX_KEYS = 10_000;
const buckets = new Map<string, number[]>();

/**
 * Record one hit for `key` and report whether it is allowed. A blocked call is
 * NOT recorded, so a client that keeps hammering the endpoint cannot extend its
 * own lockout — the window always drains after `windowMs`.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - hits[0])) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  if (buckets.size >= MAX_KEYS && !buckets.has(key)) buckets.clear();
  hits.push(now);
  buckets.set(key, hits);
  return {
    allowed: true,
    remaining: Math.max(0, limit - hits.length),
    retryAfterSeconds: 0,
  };
}

/** Clear every bucket — test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Per-route limits. The write routes are idempotent enough to be hit a few
 * times by a real person, but a burst this size in a minute is not human.
 */
export const REPORT_RATE_LIMIT = { limit: 8, windowMs: 60_000 } as const;
export const PHOTO_RATE_LIMIT = { limit: 8, windowMs: 60_000 } as const;
export const VERDICT_RATE_LIMIT = { limit: 15, windowMs: 60_000 } as const;
