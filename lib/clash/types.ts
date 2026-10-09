/**
 * Types for the clash-detection engine.
 *
 * Kept separate from lib/types.ts on purpose: these describe the ENGINE's
 * vocabulary, not the database's. The two meet only at toWorkWindow() in
 * index.ts, so the engine stays pure and DB-agnostic.
 */

export type UtilityType = "road" | "drain" | "water" | "power" | "fibre";

export interface WorkWindow {
  id: string;
  corridorId: string;
  departmentId: string;
  status: string;
  plannedStart?: string;
  plannedEnd?: string;
  actualEnd?: string;
  restoredAt?: string;
  budgetInr?: number;
  utility: UtilityType;
}

export type ClashType = "time_overlap" | "repeat_dig";

export type Severity = "low" | "medium" | "high" | "critical";

export interface ClashPair {
  type: ClashType;
  a: string;
  b: string;
  severity: Severity;
  overlapDays: number;
  gapDays: number;
  sameCorridor: boolean;
  reason: string;
}

export interface Suggestion {
  action: "coordinate" | "defer" | "merge" | "none";
  proposedStart?: string;
  proposedEnd?: string;
  rationale: string;
  savesDig: boolean;
  estSavingsInr?: number;
}

export interface ClashResult {
  pairs: ClashPair[];
  clusterCount: number;
  topSeverity: Severity;
  suggestions: Suggestion[];
  warnings: string[];
}

export interface ClashConfig {
  /** Works starting within this many days after a road is restored count as a repeat dig. */
  repeatGapDays: number;
  /** Buffer added to a deferred start so batched works share one trench. */
  coordinationBufferDays: number;
  /** Share of trench/restore cost saved when two works are merged. */
  mergeSavingsRatio: number;
  /** Hard ceiling on returned pairs so a dense city can't blow up the UI. */
  maxPairs: number;
}
