import { describe, expect, it } from "vitest";
import {
  consoleProjectUpdateInputSchema,
  isPastPlannedEnd,
  projectInputSchema,
} from "@/lib/schemas";

const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";

describe("consoleProjectUpdateInputSchema", () => {
  it("allows a delay reason alongside a non-stalled status (console rule)", () => {
    const result = consoleProjectUpdateInputSchema.safeParse({
      project_id: PROJECT_UUID,
      status: "completed",
      delay_reason: "monsoon",
      new_planned_end: "2026-12-01",
    });
    expect(result.success).toBe(true);
  });

  it("also allows a reason on an in-progress late job", () => {
    const result = consoleProjectUpdateInputSchema.safeParse({
      project_id: PROJECT_UUID,
      status: "in_progress",
      delay_reason: "contractor_delay",
    });
    expect(result.success).toBe(true);
  });

  it("normalises empty form values to null", () => {
    const result = consoleProjectUpdateInputSchema.safeParse({
      project_id: PROJECT_UUID,
      status: "planned",
      note: "",
      delay_reason: "",
      new_planned_end: "",
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      note: null,
      delay_reason: null,
      new_planned_end: null,
    });
  });

  it("rejects a bogus project id or status", () => {
    expect(
      consoleProjectUpdateInputSchema.safeParse({
        project_id: "not-a-uuid",
        status: "planned",
      }).success,
    ).toBe(false);
    expect(
      consoleProjectUpdateInputSchema.safeParse({
        project_id: PROJECT_UUID,
        status: "exploded",
      }).success,
    ).toBe(false);
  });
});

describe("isPastPlannedEnd", () => {
  it("is true only when today is strictly after the planned end", () => {
    expect(isPastPlannedEnd("2026-10-01", "2026-10-10")).toBe(true);
    expect(isPastPlannedEnd("2026-10-10", "2026-10-10")).toBe(false);
    expect(isPastPlannedEnd("2026-10-11", "2026-10-10")).toBe(false);
  });

  it("is false without a planned end", () => {
    expect(isPastPlannedEnd(null, "2026-10-10")).toBe(false);
    expect(isPastPlannedEnd(undefined, "2026-10-10")).toBe(false);
    expect(isPastPlannedEnd("", "2026-10-10")).toBe(false);
  });
});

describe("projectInputSchema rejects impossible dates", () => {
  const base = {
    title: "Test work",
    purpose: "Exercise date validation.",
    project_type: "road",
    department_id: "a0000001-0000-4000-8000-000000000001",
    road_segment_id: "b0000002-0000-4000-8000-000000000001",
    status: "planned",
  };

  it("rejects a calendar-impossible date such as 2026-02-30", () => {
    const result = projectInputSchema.safeParse({
      ...base,
      planned_start: "2026-02-30",
      planned_end: "2026-03-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts real dates", () => {
    const result = projectInputSchema.safeParse({
      ...base,
      planned_start: "2026-10-10",
      planned_end: "2026-10-20",
      budget_inr: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an inverted window (end before start)", () => {
    const result = projectInputSchema.safeParse({
      ...base,
      planned_start: "2026-10-20",
      planned_end: "2026-10-10",
    });
    expect(result.success).toBe(false);
  });
});