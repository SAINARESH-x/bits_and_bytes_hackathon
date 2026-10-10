import { describe, expect, it } from "vitest";
import {
  changeCountByProject,
  changedProjectIds,
  updatesSince,
} from "@/lib/follow-activity";
import type { ProjectUpdate } from "@/lib/types";

function update(id: string, projectId: string, createdAt: string): ProjectUpdate {
  return {
    id,
    project_id: projectId,
    status: "in_progress",
    note: null,
    delay_reason: null,
    new_planned_end: null,
    is_simulated: true,
    created_at: createdAt,
  };
}

const UPDATES: ProjectUpdate[] = [
  update("u1", "p1", "2026-01-01T00:00:00.000Z"),
  update("u2", "p2", "2026-01-02T00:00:00.000Z"),
  update("u3", "p1", "2026-01-03T00:00:00.000Z"),
  update("u4", "p3", "2026-01-04T00:00:00.000Z"),
];

describe("updatesSince", () => {
  it("returns nothing when there is no baseline", () => {
    expect(updatesSince(UPDATES, null)).toEqual([]);
  });

  it("returns only strictly-newer updates", () => {
    const since = updatesSince(UPDATES, "2026-01-02T00:00:00.000Z");
    expect(since.map((u) => u.id)).toEqual(["u3", "u4"]);
  });

  it("excludes an update exactly at the baseline", () => {
    const since = updatesSince(UPDATES, "2026-01-03T00:00:00.000Z");
    expect(since.map((u) => u.id)).toEqual(["u4"]);
  });

  it("returns everything after the earliest possible baseline", () => {
    expect(updatesSince(UPDATES, "1970-01-01T00:00:00.000Z")).toHaveLength(4);
  });
});

describe("changedProjectIds", () => {
  it("collects the distinct projects with new updates", () => {
    const ids = changedProjectIds(UPDATES, "2026-01-01T12:00:00.000Z");
    expect([...ids].sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("is empty with no baseline", () => {
    expect(changedProjectIds(UPDATES, null).size).toBe(0);
  });
});

describe("changeCountByProject", () => {
  it("counts updates per project since the baseline", () => {
    const counts = changeCountByProject(UPDATES, "2026-01-01T12:00:00.000Z");
    expect(counts.get("p1")).toBe(1);
    expect(counts.get("p2")).toBe(1);
    expect(counts.get("p3")).toBe(1);
  });

  it("counts multiple updates for the same project", () => {
    const counts = changeCountByProject(UPDATES, "1970-01-01T00:00:00.000Z");
    expect(counts.get("p1")).toBe(2);
  });

  it("is empty with no baseline", () => {
    expect(changeCountByProject(UPDATES, null).size).toBe(0);
  });
});
