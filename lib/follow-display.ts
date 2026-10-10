/**
 * Human-friendly, de-duplicated rendering of update timestamps for the
 * followed-projects feed (PLAN.md M6 item 4).
 *
 * Kept pure and clock-injectable so it can be unit-tested and so the phrase is
 * stable across a server render and a client hydration. `now` defaults to the
 * current time; callers that need determinism pass it explicitly.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "3 hours ago", "2 days ago", else a YYYY-MM-DD date. */
export function formatRelativeUpdate(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime())) return "recently";

  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return then.toISOString().slice(0, 10);
}
