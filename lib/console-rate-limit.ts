/**
 * Failed-attempt limiter for the console login.
 *
 * A sliding window of FAILED attempts per client IP: five wrong passcodes in
 * fifteen minutes locks that IP out until the window drains. Correct logins
 * clear the count, so a typo followed by the right passcode is fine.
 *
 * In-memory, therefore per process instance: on a multi-instance deploy each
 * instance keeps its own counter. That is a fine demo gate (it still defeats
 * casual guessing) but NOT a substitute for a distributed limiter in
 * production. The window accepts an injectable clock so tests can advance it.
 */

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
/** Bounded so an unbounded number of spoofed IPs cannot leak memory. */
const MAX_TRACKED_IPS = 10_000;

const failures = new Map<string, number[]>();

// Shared with the citizen write-route limiter; re-exported so the console's
// public surface (and its tests) does not change.
export { getClientIp } from "@/lib/client-ip";

export function isRateLimited(ip: string, now: number = Date.now()): boolean {
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILED_ATTEMPTS;
}

export function recordFailedAttempt(ip: string, now: number = Date.now()): void {
  if (failures.size >= MAX_TRACKED_IPS && !failures.has(ip)) failures.clear();
  const list = failures.get(ip) ?? [];
  list.push(now);
  failures.set(ip, list);
}

export function clearAttempts(ip: string): void {
  failures.delete(ip);
}