import type { ClashType, Severity } from "./types";

/**
 * Clash severity.
 *
 * ---------------------------------------------------------------------------
 * THE FORMULA (kept in one comment so it can be checked, argued with and
 * reproduced; every term is a plain number with no hidden state).
 *
 *   score = time + money + utility + crowd            (0 … 100)
 *
 *   time        0–35
 *       CONCURRENT_OVERLAP : min(overlapDays, 60) / 60 * 35
 *           Longer simultaneous occupation of a road is harder to manage:
 *           two contractors, two sets of barricades, one carriageway.
 *       REPEAT_DIG         : (1 − min(gapDays, window) / window) * 35
 *           The sooner the road is re-opened after restoration, the more of
 *           that restoration is thrown away, so a short gap scores high.
 *
 *   money       0–25
 *       min((budgetA + budgetB) / 5_000_000, 1) * 25
 *           ₹50 lakh saturates the term. Missing budgets contribute 0, which
 *           only ever *lowers* a score — never invents a clash.
 *
 *   utility     0–20
 *       ((weight(A) + weight(B)) / 2) * 20
 *           Trenching a finished carriageway disrupts more people than
 *           pulling fibre through a duct, so road works weigh heaviest.
 *
 *   crowd       0–20
 *       min(clusterSize, 5) / 5 * 20
 *           `clusterSize` is how many projects are tangled together on the
 *           same stretch. A two-way clash contributes 8, a five-way tangle
 *           saturates. A five-way clash on one street is not merely five
 *           times a two-way clash — it is a street nobody can use.
 *
 *   bands: score >= 66 → "high"; score >= 33 → "medium"; else "low".
 *
 * Same-department pairs are reported but forced to "low": they are usually a
 * sequencing mistake inside one department rather than a cross-department
 * coordination failure. `detect.ts` applies that override, not this module.
 * ---------------------------------------------------------------------------
 */

export const UTILITY_WEIGHTS = {
  road: 1,
  drain: 0.85,
  water: 0.9,
  power: 0.7,
  fibre: 0.5,
} as const;

export type Utility = keyof typeof UTILITY_WEIGHTS;

/** Budget, in rupees, at which the money term stops growing. */
export const BUDGET_SATURATION_INR = 5_000_000;

export const MAX_CLUSTER_FOR_SCORE = 5;

const PROJECT_TYPE_TO_UTILITY: Record<string, Utility> = {
  road: "road",
  drain: "drain",
  water_pipeline: "water",
  power_cable: "power",
  fibre: "fibre",
};

/**
 * Fold the database's wider `project_type` enum onto the five surface
 * utilities. `other` is treated as fibre: still detected, weighed lightest.
 */
export function utilityOf(projectType: string): Utility {
  return PROJECT_TYPE_TO_UTILITY[projectType] ?? "fibre";
}

export function utilityWeight(projectType: string): number {
  return UTILITY_WEIGHTS[utilityOf(projectType)];
}

export interface SeverityInputs {
  type: ClashType;
  overlapDays: number;
  gapDays: number;
  repeatDigWindowDays: number;
  budgetA: number;
  budgetB: number;
  projectTypeA: string;
  projectTypeB: string;
  /** Projects tangled together in this clash's cluster; 2 for a lone pair. */
  clusterSize: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function severityScore(input: SeverityInputs): number {
  const time =
    input.type === "CONCURRENT_OVERLAP"
      ? clamp01(input.overlapDays / 60) * 35
      : (1 - clamp01(input.gapDays / Math.max(1, input.repeatDigWindowDays))) * 35;

  const money =
    clamp01(
      (Math.max(0, input.budgetA) + Math.max(0, input.budgetB)) /
        BUDGET_SATURATION_INR,
    ) * 25;

  const utility =
    ((utilityWeight(input.projectTypeA) + utilityWeight(input.projectTypeB)) / 2) *
    20;

  const crowd = clamp01(input.clusterSize / MAX_CLUSTER_FOR_SCORE) * 20;

  return Math.round(time + money + utility + crowd);
}

export function bandSeverity(score: number): Severity {
  if (score >= 66) return "high";
  if (score >= 33) return "medium";
  return "low";
}

export function computeSeverity(input: SeverityInputs): Severity {
  return bandSeverity(severityScore(input));
}

/** Severity rank for sorting, computed from the bands so the two agree. */
const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

export function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
