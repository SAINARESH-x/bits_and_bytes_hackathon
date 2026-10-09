import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLASH_CONFIG,
  UTILITY_WEIGHTS,
  toWorkWindow,
} from "@/lib/clash";
import type { Project, ProjectType } from "@/lib/types";

const baseProject: Project = {
  id: "p1",
  road_segment_id: "seg-1",
  department_id: "dept-water",
  contractor_name: "AquaCore Builders",
  title: "Water main replacement",
  purpose: "Replace aging water main",
  project_type: "water_pipeline",
  status: "planned",
  planned_start: "2026-01-20",
  planned_end: "2026-02-10",
  actual_start: null,
  actual_end: null,
  budget_inr: null,
  is_simulated: true,
};

describe("clash engine contract", () => {
  it("keeps the documented thresholds", () => {
    expect(DEFAULT_CLASH_CONFIG.repeatGapDays).toBe(180);
    expect(DEFAULT_CLASH_CONFIG.coordinationBufferDays).toBe(7);
  });

  it("weights road trenching as the most disruptive utility", () => {
    expect(UTILITY_WEIGHTS.road).toBeGreaterThan(UTILITY_WEIGHTS.fibre);
    expect(UTILITY_WEIGHTS.water).toBeGreaterThan(UTILITY_WEIGHTS.power);
  });

  it("maps a Project to a WorkWindow without leaking extra fields", () => {
    const window = toWorkWindow(baseProject);
    expect(window).toEqual({
      id: "p1",
      corridorId: "seg-1",
      departmentId: "dept-water",
      status: "planned",
      plannedStart: "2026-01-20",
      plannedEnd: "2026-02-10",
      actualEnd: undefined,
      restoredAt: undefined,
      budgetInr: undefined,
      utility: "water",
    });
    expect(window).not.toHaveProperty("is_simulated");
    expect(window).not.toHaveProperty("purpose");
    expect(window).not.toHaveProperty("contractor_name");
  });

  it("folds every project_type onto one of the five surface utilities", () => {
    // The DB enum is wider than the engine's vocabulary; none may be dropped.
    const types: ProjectType[] = [
      "road",
      "drain",
      "water_pipeline",
      "power_cable",
      "fibre",
      "other",
    ];
    for (const project_type of types) {
      const window = toWorkWindow({ ...baseProject, project_type });
      expect(UTILITY_WEIGHTS[window.utility]).toBeGreaterThan(0);
    }
  });

  it("uses actual_end as the restored timestamp for repeat-dig checks", () => {
    const window = toWorkWindow({
      ...baseProject,
      status: "completed",
      actual_end: "2026-03-01",
    });
    expect(window.restoredAt).toBe("2026-03-01");
    expect(window.actualEnd).toBe("2026-03-01");
  });

  it("maps null numeric and date fields to undefined", () => {
    const window = toWorkWindow(baseProject);
    expect(window.plannedStart).toBe("2026-01-20");
    expect(window.budgetInr).toBeUndefined();
  });
});
