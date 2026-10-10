/**
 * CLASH DETECTION ENGINE — public surface.
 *
 * Contract (AGENTS.md / PLAN.md §4): this folder is PURE. No UI imports, no DB
 * imports, no `window`, no env reads, no `new Date()` except the one the caller
 * passes in. Everything is deterministic and unit-tested in
 * `tests/clash.test.ts`.
 *
 * Layers:
 *   types.ts    — the vocabulary (Clash, Severity, options, result shape)
 *   window.ts   — date parsing + work-window resolution
 *   geo.ts      — hand-written haversine / point-to-segment distance
 *   severity.ts — the documented 0–100 severity formula
 *   suggest.ts  — coordination proposals
 *   detect.ts   — detectClashes(): the rules themselves
 *
 * Usage:
 *   const { clashes, skipped } = detectClashes(projects, segments, { now });
 */

export * from "./types";
export { detectClashes } from "./detect";
export {
  proposeCoordination,
  formatInrSimulated,
  SIMULATED_LABEL,
  REPEAT_DIG_WASTE_RATIO,
  SHARED_TRENCH_SAVING_RATIO,
  FALLBACK_BUDGET_INR,
  type CoordinationProposal,
  type ProposedWindow,
} from "./suggest";
export {
  UTILITY_WEIGHTS,
  utilityOf,
  utilityWeight,
  severityScore,
  bandSeverity,
  computeSeverity,
  higherSeverity,
  BUDGET_SATURATION_INR,
  MAX_CLUSTER_FOR_SCORE,
  type SeverityInputs,
  type Utility,
} from "./severity";
export {
  parseDay,
  toISODay,
  formatDayLabel,
  resolveWorkWindow,
  daysBetween,
  DAY_MS,
  type WorkWindow,
  type WindowResolution,
} from "./window";
export {
  haversineMeters,
  pointToSegmentMeters,
  segmentPairDistanceMeters,
  lineStringDistanceMeters,
  segmentsIntersect,
  computeSegmentAdjacency,
  boundingBox,
  boxGapMeters,
  metersPerDegLng,
  shiftMeters,
  localMeters,
  EARTH_RADIUS_M,
  METERS_PER_DEG_LAT,
  type LngLat,
  type Box,
  type PositionedSegment,
} from "./geo";
