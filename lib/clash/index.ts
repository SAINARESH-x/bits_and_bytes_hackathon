import type { Project } from "../types";
import type { ClashConfig, UtilityType, WorkWindow } from "./types";

/**
 * CLASH DETECTION ENGINE — pure module.
 *
 * Contract (PLAN.md §4): NO UI imports, NO DB imports, no env reads.
 * Everything here is deterministic and unit-tested (tests/clash.test.ts).
 *
 * M1 ships the types, config and the Project->WorkWindow adapter only; the
 * detection rules land in M3. Do not add query or rendering code in here.
 */

export * from "./types";

export const DEFAULT_CLASH_CONFIG: ClashConfig = {
  repeatGapDays: 180,
  coordinationBufferDays: 7,
  mergeSavingsRatio: 0.6,
  maxPairs: 50,
};

/** Severity weights per utility type. Road trenching is the most disruptive. */
export const UTILITY_WEIGHTS: Record<UtilityType, number> = {
  road: 1.0,
  water: 0.9,
  drain: 0.85,
  power: 0.7,
  fibre: 0.5,
};

/**
 * Narrow a Project to the subset the engine needs.
 * This is the ONLY place the engine is allowed to know Project exists.
 */
export function toWorkWindow(project: Project): WorkWindow {
  return {
    id: project.id,
    corridorId: project.corridor_id,
    departmentId: project.department_id,
    status: project.status,
    plannedStart: project.planned_start,
    plannedEnd: project.planned_end,
    actualEnd: project.actual_end,
    restoredAt: project.restored_at,
    budgetInr: project.budget_inr,
    utility: project.utility_type,
  };
}
