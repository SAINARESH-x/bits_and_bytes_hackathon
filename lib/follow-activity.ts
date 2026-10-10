import type { ProjectUpdate } from "@/lib/types";

/**
 * "What changed since your last visit" (PLAN.md M6 item 4).
 *
 * Follows live in `localStorage` — there is no account — so a device also
 * stores the timestamp it last acknowledged the followed projects. Anything
 * logged to a project's append-only status log AFTER that instant is "new".
 *
 * Pure and timezone-free: both sides are ISO-8601 UTC strings, which compare
 * correctly with a plain lexicographic `<`, so no Date parsing (and no
 * server/client clock skew) is involved.
 */

/**
 * Updates newer than `lastSeenAt`. A null baseline (a device that has never
 * acknowledged anything) yields an empty list: "new since last visit" is
 * meaningless before there has been a visit, so we say nothing rather than
 * flag the entire history as unread.
 */
export function updatesSince(
  updates: readonly ProjectUpdate[],
  lastSeenAt: string | null,
): ProjectUpdate[] {
  if (!lastSeenAt) return [];
  return updates.filter((u) => u.created_at > lastSeenAt);
}

/** Ids of projects that have at least one update newer than `lastSeenAt`. */
export function changedProjectIds(
  updates: readonly ProjectUpdate[],
  lastSeenAt: string | null,
): Set<string> {
  return new Set(updatesSince(updates, lastSeenAt).map((u) => u.project_id));
}

/** How many updates each project has since `lastSeenAt`. */
export function changeCountByProject(
  updates: readonly ProjectUpdate[],
  lastSeenAt: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const update of updatesSince(updates, lastSeenAt)) {
    counts.set(update.project_id, (counts.get(update.project_id) ?? 0) + 1);
  }
  return counts;
}
