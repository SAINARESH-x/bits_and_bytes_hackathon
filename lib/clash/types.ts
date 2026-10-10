/**
 * Vocabulary of the clash-detection engine.
 *
 * This module deliberately declares the *structural* shapes the engine
 * consumes instead of importing the database types from `@/lib/types`.
 * TypeScript's structural typing means the rows handed out by `lib/data.ts`
 * satisfy these interfaces unchanged, while the engine stays free of any
 * dependency on the app's data layer, UI or framework — the contract AGENTS.md
 * calls for ("lib/clash/ — pure clash-detection module. No UI or DB imports").
 *
 * Nothing in here (or in detect/severity/suggest/geo) touches `window`, the
 * network or Supabase, so the whole engine is deterministic and unit-testable.
 */

export type ClashType = "CONCURRENT_OVERLAP" | "REPEAT_DIG";

export type Severity = "low" | "medium" | "high";

/** Most urgent first. Also the order the UI lists clashes in. */
export const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CLASH_TYPE_LABELS: Record<ClashType, string> = {
  CONCURRENT_OVERLAP: "Concurrent overlap",
  REPEAT_DIG: "Repeat dig",
};

/**
 * The engine's minimal view of a project. Callers may pass a richer object —
 * extra fields are ignored — which is what lets the data layer's `Project`
 * flow straight in without a mapping step.
 */
export interface Project {
  id: string;
  title?: string;
  /** "road" | "drain" | "water_pipeline" | "power_cable" | "fibre" | "other". */
  project_type: string;
  department_id: string;
  road_segment_id: string;
  /** "planned" | "in_progress" | "stalled" | "completed" | "cancelled". */
  status: string;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  budget_inr?: number | null;
}

/** GeoJSON LineString in `[lng, lat]` order. */
export interface SegmentGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

/** The engine's minimal view of a road segment. */
export interface RoadSegment {
  id: string;
  name?: string;
  ward?: string;
  geometry?: SegmentGeometry | null;
}

export interface Clash {
  id: string;
  type: ClashType;
  severity: Severity;
  /** The earlier of the two works — the one that finished first. */
  projectA: Project;
  /** The later work. For a repeat dig this is the one that re-opens the road. */
  projectB: Project;
  /** Shared segment when the two are on one road, else the lower segment id. */
  segmentId: string;
  overlapDays?: number;
  gapDays?: number;
  /** Money at risk if the clash is not coordinated — a simulated estimate. */
  estimatedWasteInr?: number;
  /** Plain-language "why was this flagged", safe to show a citizen. */
  explanation: string;
  /** Plain-language coordination proposal. */
  suggestion: string;
  /** The window the suggestion proposes, when it proposes one. */
  proposedStart?: string;
  proposedEnd?: string;
  /** True when acting on the suggestion removes one excavation. */
  savesDig?: boolean;
  /** Set when this pair is part of a 3+-way tangle on the same road. */
  clusterId?: string;
  /** How many projects are tangled together in that cluster. */
  clusterSize?: number;
}

export type SkipReason = "MISSING_DATES" | "INVALID_DATES" | "INVERTED_DATES";

/**
 * A project the engine could not evaluate. Reported rather than thrown: one
 * row with a typo in its dates must not blank the whole clash board.
 */
export interface SkippedProject {
  projectId: string;
  title: string;
  reason: SkipReason;
}

/**
 * A group of three or more works that all clash with each other, directly or
 * transitively. The pairwise clashes are still returned individually (so the
 * money can be added up), but the cluster is what a coordinator actually has
 * to sit down and re-plan.
 */
export interface ClashCluster {
  id: string;
  projectIds: string[];
  clashIds: string[];
  segmentId: string;
  severity: Severity;
}

export interface ClashResult {
  /** Sorted: severity, then estimated waste, then ids — never map order. */
  clashes: Clash[];
  clusters: ClashCluster[];
  skipped: SkippedProject[];
  /** When the result was computed. The only use of `options.now`. */
  generatedAt: string;
}

export interface DetectClashesOptions {
  /** Two segments closer than this are treated as the same street. */
  adjacencyMeters?: number;
  /** How soon after a road is restored a new dig counts as a repeat dig. */
  repeatDigWindowDays?: number;
  /** Drop same-department pairs instead of reporting them at low severity. */
  ignoreSameDepartment?: boolean;
  /** Reference instant, stamped onto the result as `generatedAt`. */
  now?: Date;
}

export const DEFAULT_ADJACENCY_METERS = 50;
export const DEFAULT_REPEAT_DIG_WINDOW_DAYS = 180;

/**
 * How two clashes are described to the user, and the tone of the badge that
 * carries it. Kept beside the enum so the three label maps cannot drift.
 */
export const CLASH_TYPE_HINTS: Record<ClashType, string> = {
  CONCURRENT_OVERLAP:
    "Two departments are scheduled on the same stretch of road at the same time.",
  REPEAT_DIG:
    "A road is being opened again shortly after it was restored — one excavation could have served both.",
};
