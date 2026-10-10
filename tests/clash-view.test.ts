import { describe, expect, it } from "vitest";
import type { Clash, ClashResult, Severity } from "@/lib/clash/types";
import {
  clashAnchorId,
  clashPairLabel,
  clashesForProject,
  countClashes,
  countClashesByProject,
  counterpartOf,
  groupClashesBySeverity,
} from "@/lib/clash-view";
import { summarizeBoard, type ClashBoard } from "@/lib/clashes";
import { lineMidPosition } from "@/lib/map-lines";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function clash(
  a: string,
  b: string,
  severity: Severity,
  type: Clash["type"] = "CONCURRENT_OVERLAP",
): Clash {
  return {
    id: `clash:${type}:${a}:${b}`,
    type,
    severity,
    projectA: { id: a, title: `Project ${a}`, project_type: "road", department_id: "d1", road_segment_id: "s1", status: "planned" },
    projectB: { id: b, title: `Project ${b}`, project_type: "water_pipeline", department_id: "d2", road_segment_id: "s1", status: "planned" },
    segmentId: "s1",
    explanation: "because",
    suggestion: "instead",
  };
}

const CLASHES: Clash[] = [
  clash("p3", "p4", "low"),
  clash("p1", "p2", "high"),
  clash("p2", "p3", "medium", "REPEAT_DIG"),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("countClashes", () => {
  it("totals and bands", () => {
    const counts = countClashes(CLASHES);
    expect(counts).toMatchObject({ total: 3, high: 1, medium: 1, low: 1 });
  });

  it("returns zeroes for an empty board", () => {
    expect(countClashes([])).toMatchObject({ total: 0, high: 0, medium: 0, low: 0 });
  });
});

describe("countClashesByProject", () => {
  it("counts a clash once for EACH side", () => {
    const counts = countClashesByProject(CLASHES);
    expect(counts.get("p1")).toBe(1);
    expect(counts.get("p2")).toBe(2); // high pair + medium pair
    expect(counts.get("p3")).toBe(2);
    expect(counts.get("p4")).toBe(1);
    expect(counts.get("p9")).toBeUndefined();
  });
});

describe("clashesForProject / counterpartOf", () => {
  it("selects both roles and names the other side", () => {
    const mine = clashesForProject(CLASHES, "p2");
    expect(mine).toHaveLength(2);
    expect(counterpartOf(mine[0], "p2").id).toBe("p1");
    expect(counterpartOf(mine[1], "p2").id).toBe("p3");
  });

  it("returns nothing for a project with no clashes", () => {
    expect(clashesForProject(CLASHES, "nobody")).toEqual([]);
  });
});

describe("groupClashesBySeverity", () => {
  it("groups most urgent first and omits empty bands", () => {
    const one = clash("a", "b", "medium");
    const groups = groupClashesBySeverity([one]);
    expect(groups.map((g) => g.severity)).toEqual(["medium"]);
    expect(groups[0].clashes).toEqual([one]);
  });

  it("keeps the engine's input order inside a band", () => {
    const groups = groupClashesBySeverity(CLASHES);
    expect(groups.map((g) => g.severity)).toEqual(["high", "medium", "low"]);
    expect(groups[2].clashes[0].id).toBe(CLASHES[0].id);
  });
});

describe("labels", () => {
  it("falls back to the id when a project has no title", () => {
    const untitled = clash("x", "y", "low");
    delete untitled.projectA.title;
    expect(clashPairLabel(untitled)).toBe("x vs Project y");
  });

  it("makes a fragment-safe anchor out of an engine id", () => {
    expect(clashAnchorId("clash:REPEAT_DIG:p1:p2")).toBe("clash-REPEAT_DIG-p1-p2");
    expect(clashAnchorId("clash:CONCURRENT_OVERLAP:a:b")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("lineMidPosition", () => {
  it("takes the middle vertex of an odd-length line", () => {
    expect(lineMidPosition([[0, 0], [1, 1], [2, 2]])).toEqual([1, 1]);
  });

  it("averages the two middle vertices of an even-length line", () => {
    expect(lineMidPosition([[0, 0], [2, 4]])).toEqual([1, 2]);
    expect(lineMidPosition([[0, 0], [1, 1], [3, 3], [5, 5]])).toEqual([2, 2]);
  });

  it("survives a single point and an empty line without throwing", () => {
    expect(lineMidPosition([[7, 8]])).toEqual([7, 8]);
    expect(lineMidPosition([])).toEqual([0, 0]);
  });
});

describe("summarizeBoard", () => {
  const result: ClashResult = {
    clashes: CLASHES,
    clusters: [
      {
        id: "cluster:p1",
        projectIds: ["p1", "p2", "p3"],
        clashIds: CLASHES.map((c) => c.id),
        segmentId: "s1",
        severity: "high",
      },
    ],
    skipped: [{ projectId: "p9", title: "No dates", reason: "MISSING_DATES" }],
    generatedAt: "2026-10-10T06:00:00.000Z",
  };

  const board: ClashBoard = {
    result,
    segments: [],
    departments: [],
    projects: [],
    mode: "demo",
  };

  it("adds cluster and skipped counts on top of the severity bands", () => {
    const payload = summarizeBoard(board);
    expect(payload.counts).toEqual({
      total: 3,
      high: 1,
      medium: 1,
      low: 1,
      clusters: 1,
      skipped: 1,
    });
  });

  it("passes the raw result through untouched", () => {
    const payload = summarizeBoard(board);
    expect(payload.clashes).toBe(result.clashes);
    expect(payload.generatedAt).toBe(result.generatedAt);
    expect(payload.mode).toBe("demo");
  });
});
