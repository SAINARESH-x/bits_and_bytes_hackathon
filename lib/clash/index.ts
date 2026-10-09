import type { Project } from "../types";
import type { ClashConfig, UtilityType, WorkWindow } from "./types";

/**
 * CLASH DETECTION ENGINE — pure module.
 *
 * Contract (PLAN.md §4): NO UI imports, NO DB imports, no env reads.
 * Everything here is deterministic and unit-tested (tests/clash.test.ts).
 *
 * M2 ships the types, config and the Project->WorkWindow adapter only; the
 * detection rules land in M3. Do not add query or rendering code in here.
 */

export * from "./types";

export const DEFAULT_CLASH_CONFIG: ClashConfig = {
  repeatGapDays: 180,
  coordinationBufferDays: 7,
  mergeSavingsRatio: 0.6,
  maxPairs: 50,
};

/**
 * Severity weights per utility type. Road trenching is the most disruptive.
 *
 * The DB's `project_type` has two values the engine does not model
 * (`water_pipeline` and `power_cable`), plus `other`. They collapse onto the
 * five surface types here so the rules only ever see one vocabulary.
 */
export const UTILITY_WEIGHTS: Record<UtilityType, number> = {
  road: 1.0,
  water: 0.9,
  drain: 0.85,
  power: 0.7,
  fibre: 0.5,
};

const UTILITY_FROM_PROJECT_TYPE: Record<Project["project_type"], UtilityType> = {
  road: "road",
  drain: "drain",
  water_pipeline: "water",
  power_cable: "power",
  fibre: "fibre",
  // `other` is a placeholder for "somebody is digging" — treat it as fibre so
  // it is still detected, just weighted lowest rather than ignored.
  other: "fibre",
};

/**
 * Narrow a Project to the subset the engine needs.
 * This is the ONLY place the engine is allowed to know Project exists.
 */
export function toWorkWindow(project: Project): WorkWindow {
  return {
    id: project.id,
    corridorId: project.road_segment_id,
    departmentId: project.department_id,
    status: project.status,
    plannedStart: project.planned_start ?? undefined,
    plannedEnd: project.planned_end ?? undefined,
    actualEnd: project.actual_end ?? undefined,
    // The engine needs "when was this road put back", which is the actual end.
    restoredAt: project.actual_end ?? undefined,
    budgetInr: project.budget_inr ?? undefined,
    utility: UTILITY_FROM_PROJECT_TYPE[project.project_type],
  };
}
