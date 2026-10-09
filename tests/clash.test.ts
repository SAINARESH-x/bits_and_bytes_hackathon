import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLASH_CONFIG,
  UTILITY_WEIGHTS,
  toWorkWindow,
} from "@/lib/clash";
import type { Project } from "@/lib/types";

const baseProject: Project = {
  id: "p1",
  corridor_id: "c1",
  department_id: "d1",
  contractor_id: null,
  title: "Water main replacement",
  purpose: "Replace aging water main",
  utility_type: "water",
  status: "planned",
  planned_start: "2026-01-20",
  planned_end: "2026-02-10",
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
      corridorId: "c1",
      departmentId: "d1",
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
  });
});
