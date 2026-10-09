/**
 * Turns the seed's relative dates into real ISO dates.
 *
 * data/seed.json stores dates as day offsets from "today" (0 = today,
 * -70 = 70 days ago) rather than absolute dates. A committed JSON file with
 * hard-coded dates looks stale within weeks and — worse — would make the
 * "repeat dig 70 days later" demo story silently stop being a repeat dig.
 * Resolving offsets at load time keeps the demo data always plausible.
 *
 * An absolute YYYY-MM-DD string is passed through untouched, so the two forms
 * can be mixed freely within one seed file.
 */

import type { SeedDate } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve a single offset (days from today) or absolute string to YYYY-MM-DD. */
export function resolveSeedDate(value: SeedDate, now: Date = new Date()): string {
  if (typeof value === "string") {
    if (!ISO_DATE.test(value)) {
      throw new Error(`Seed date must be YYYY-MM-DD or a day offset, got "${value}"`);
    }
    return value;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`Day offset must be an integer, got ${value}`);
  }

  // Work in UTC so the result does not shift with the server's timezone.
  const date = new Date(now.getTime());
  const utcDay = date.getUTCDate();
  date.setUTCDate(utcDay + value);
  return date.toISOString().slice(0, 10);
}

/** Resolve an optional offset. `null`/`undefined` stay null. */
export function resolveSeedDateOptional(
  value: SeedDate | null | undefined,
  now: Date = new Date(),
): string | null {
  if (value === null || value === undefined) return null;
  return resolveSeedDate(value, now);
}
