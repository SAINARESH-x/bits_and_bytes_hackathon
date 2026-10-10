import type { Verification } from "@/lib/types";

/**
 * "Contested completion" rule (PLAN.md M6, product spec item 5).
 *
 * A project marked `completed` stops being taken at face value once enough
 * residents dispute it. The threshold is deliberately asymmetric and
 * double-sided: a small number of credible disputes is enough even when few
 * people have voted (>= 3 disputes), but a large tally cannot be overridden by
 * a bare majority — a dispute still has to reach 40% of all votes to matter.
 *
 * Pure, so the rule is unit-tested and the project page, the dashboard and any
 * future API all read the exact same numbers.
 */

export const CONTEST_DISPUTE_MIN = 3;
export const CONTEST_DISPUTE_RATIO = 0.4;

export interface VoteTally {
  confirm: number;
  dispute: number;
  total: number;
}

/** Count confirm/dispute votes. Anything that is not a dispute is a confirm. */
export function tally(verifications: readonly Verification[]): VoteTally {
  let confirm = 0;
  let dispute = 0;
  for (const v of verifications) {
    if (v.vote === "dispute") dispute += 1;
    else confirm += 1;
  }
  return { confirm, dispute, total: confirm + dispute };
}

/**
 * True when a completion is contested: at least `CONTEST_DISPUTE_MIN` disputes,
 * OR disputes making up at least `CONTEST_DISPUTE_RATIO` of all votes.
 * An empty tally is never contested.
 */
export function isContested(tally: VoteTally): boolean {
  if (tally.total === 0) return false;
  if (tally.dispute >= CONTEST_DISPUTE_MIN) return true;
  return tally.dispute / tally.total >= CONTEST_DISPUTE_RATIO;
}

/** Convenience: does this project's vote list make it contested? */
export function verificationsContested(
  verifications: readonly Verification[],
): boolean {
  return isContested(tally(verifications));
}
