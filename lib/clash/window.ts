import type { Project, SkipReason } from "./types";

/**
 * Date handling for work windows.
 *
 * A "window" is the stretch of calendar days a work occupies. The engine
 * compares windows, so resolving them — and deciding what counts as an
 * unusable row — lives in exactly one place.
 */

export const DAY_MS = 86_400_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parsing is memoised: a clash board re-reads the same few hundred date
 * strings thousands of times (once per clash, for both works), and each miss
 * costs a `Date` allocation plus an `toISOString()` round-trip. Bounded so a
 * long-lived process cannot leak.
 */
const DAY_CACHE = new Map<string, number | null>();
const DAY_CACHE_LIMIT = 4096;

/**
 * Parse a date-only string to a UTC midnight timestamp, or null if it is not
 * a real calendar day.
 *
 * The round-trip check matters: `Date.parse("2026-02-30T00:00:00Z")` does not
 * fail, it silently rolls over to 2 March. A typo'd date must land in the
 * `skipped` list, not quietly become a different date.
 */
export function parseDay(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;

  // `undefined` means "not cached" — a cached miss is stored as `null`.
  const cached = DAY_CACHE.get(value);
  if (cached !== undefined) return cached;

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  const valid =
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
  const result = valid ? timestamp : null;

  if (DAY_CACHE.size >= DAY_CACHE_LIMIT) DAY_CACHE.clear();
  DAY_CACHE.set(value, result);
  return result;
}

const ISO_CACHE = new Map<number, string>();

export function toISODay(ms: number): string {
  const cached = ISO_CACHE.get(ms);
  if (cached !== undefined) return cached;
  const iso = new Date(ms).toISOString().slice(0, 10);
  if (ISO_CACHE.size >= DAY_CACHE_LIMIT) ISO_CACHE.clear();
  ISO_CACHE.set(ms, iso);
  return iso;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * `Intl.format` is by far the most expensive call in the whole engine — an
 * order of magnitude more than the geometry — and a clash board asks for the
 * same handful of dates and rupee amounts thousands of times. Memoising turns
 * a 500-project run from ~800 ms into tens of milliseconds, which is what
 * keeps the engine usable inside a request. Bounded so a long-lived process
 * cannot leak.
 */
const DAY_LABEL_CACHE = new Map<number, string>();
const LABEL_CACHE_LIMIT = 4096;

function cacheDayLabel(ms: number, label: string): string {
  if (DAY_LABEL_CACHE.size >= LABEL_CACHE_LIMIT) DAY_LABEL_CACHE.clear();
  DAY_LABEL_CACHE.set(ms, label);
  return label;
}

/** "2026-10-10"-style timestamp -> "10 Oct 2026", for human-readable text. */
export function formatDayLabel(ms: number): string {
  const cached = DAY_LABEL_CACHE.get(ms);
  return cached ?? cacheDayLabel(ms, DAY_LABEL.format(new Date(ms)));
}

export interface WorkWindow {
  /** UTC midnight of the first day of work. */
  start: number;
  /** UTC midnight of the last day of work. */
  end: number;
}

export type WindowResolution =
  | { ok: true; window: WorkWindow }
  | { ok: false; reason: SkipReason };

/**
 * The window a project actually occupies.
 *
 * Real dates win over planned ones field by field (`actual_start` overrides
 * `planned_start`, `actual_end` overrides `planned_end`) because a work that
 * started early is where it is, plans notwithstanding.
 *
 * Inverted dates are rejected rather than swapped: a row claiming to end
 * before it starts is a data problem to surface, and silently repairing it
 * would hide the very data-quality signal this registry exists to publish.
 */
export function resolveWorkWindow(project: Project): WindowResolution {
  const startRaw = project.actual_start ?? project.planned_start;
  const endRaw = project.actual_end ?? project.planned_end;

  if (startRaw == null || startRaw === "" || endRaw == null || endRaw === "") {
    return { ok: false, reason: "MISSING_DATES" };
  }

  const start = parseDay(startRaw);
  const end = parseDay(endRaw);
  if (start === null || end === null) return { ok: false, reason: "INVALID_DATES" };
  if (start > end) return { ok: false, reason: "INVERTED_DATES" };

  return { ok: true, window: { start, end } };
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY_MS);
}
