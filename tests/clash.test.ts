import { describe, expect, it } from "vitest";
import seed from "@/data/seed.json";
import {
  DEFAULT_ADJACENCY_METERS,
  DEFAULT_REPEAT_DIG_WINDOW_DAYS,
  UTILITY_WEIGHTS,
  computeSegmentAdjacency,
  detectClashes,
  haversineMeters,
  lineStringDistanceMeters,
  parseDay,
  pointToSegmentMeters,
  proposeCoordination,
  resolveWorkWindow,
  severityScore,
  shiftMeters,
  type Clash,
  type Project,
  type RoadSegment,
} from "@/lib/clash";
import { resolveSeedDateOptional } from "@/lib/seed-dates";
import type {
  Project as AppProject,
  RoadSegment as AppRoadSegment,
  SeedData,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const NOW = new Date("2026-06-15T00:00:00Z");

const dayMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const plus = (iso: string, days: number): string =>
  new Date(dayMs(iso) + days * DAY).toISOString().slice(0, 10);

const ORIGIN: [number, number] = [80.2, 13.0];

/** A straight east-west line starting at `start`, offset `northM` metres up. */
function eastLine(northM = 0, lengthM = 90): [number, number][] {
  const a = shiftMeters(ORIGIN, 0, northM);
  return [a, shiftMeters(a, lengthM, 0)];
}

const LINE_ORIGIN = eastLine();
const LINE_30M = eastLine(30);
const LINE_500M = eastLine(500);

function segment(id: string, coords: [number, number][], name?: string): RoadSegment {
  return { id, name: name ?? `Road ${id}`, ward: "Test Ward", geometry: { type: "LineString", coordinates: coords } };
}

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    title: `Project ${overrides.id}`,
    project_type: "water_pipeline",
    department_id: "dept-water",
    road_segment_id: "seg-1",
    status: "planned",
    planned_start: "2026-01-01",
    planned_end: "2026-01-31",
    actual_start: null,
    actual_end: null,
    budget_inr: 1_000_000,
    ...overrides,
  };
}

function findClash(clashes: readonly Clash[], a: string, b: string): Clash | undefined {
  return clashes.find(
    (clash) =>
      (clash.projectA.id === a && clash.projectB.id === b) ||
      (clash.projectA.id === b && clash.projectB.id === a),
  );
}

const pairKey = (clash: Clash): string =>
  [clash.projectA.id, clash.projectB.id].sort().join("|");

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

describe("engine contract", () => {
  it("keeps the documented defaults", () => {
    expect(DEFAULT_ADJACENCY_METERS).toBe(50);
    expect(DEFAULT_REPEAT_DIG_WINDOW_DAYS).toBe(180);
  });

  it("weights road trenching as the most disruptive utility", () => {
    expect(UTILITY_WEIGHTS.road).toBeGreaterThan(UTILITY_WEIGHTS.fibre);
    expect(UTILITY_WEIGHTS.water).toBeGreaterThan(UTILITY_WEIGHTS.power);
    for (const weight of Object.values(UTILITY_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("bands the severity score into exactly three levels", () => {
    const base = {
      type: "CONCURRENT_OVERLAP" as const,
      overlapDays: 1,
      gapDays: 0,
      repeatDigWindowDays: 180,
      budgetA: 0,
      budgetB: 0,
      projectTypeA: "fibre",
      projectTypeB: "fibre",
      clusterSize: 2,
    };
    expect(severityScore(base)).toBeLessThanOrEqual(100);
    expect(
      severityScore({ ...base, overlapDays: 60, budgetA: 9_000_000, budgetB: 9_000_000, projectTypeA: "road", projectTypeB: "road", clusterSize: 5 }),
    ).toBeGreaterThan(
      severityScore(base),
    );
  });
});

// ---------------------------------------------------------------------------
// Geometry (hand-written, no turf)
// ---------------------------------------------------------------------------

describe("geometry helpers", () => {
  it("haversine agrees with the local metre frame at street scale", () => {
    const a = ORIGIN;
    const b = shiftMeters(a, 30, 40); // 3-4-5 triangle: 50 m
    expect(haversineMeters(a, b)).toBeCloseTo(50, 0);
  });

  it("measures point-to-segment distance perpendicular to the line", () => {
    const mid: [number, number] = shiftMeters(ORIGIN, 45, 0);
    const above = shiftMeters(mid, 0, 30);
    expect(pointToSegmentMeters(above, LINE_ORIGIN[0], LINE_ORIGIN[1])).toBeCloseTo(30, 1);
  });

  it("clamps to the nearest endpoint beyond the segment", () => {
    const past = shiftMeters(LINE_ORIGIN[1], 25, 0);
    expect(pointToSegmentMeters(past, LINE_ORIGIN[0], LINE_ORIGIN[1])).toBeCloseTo(25, 1);
  });

  it("measures parallel polylines and finds crossings", () => {
    expect(lineStringDistanceMeters(LINE_ORIGIN, LINE_30M)).toBeCloseTo(30, 1);
    expect(lineStringDistanceMeters(LINE_ORIGIN, LINE_500M)).toBeCloseTo(500, 0);

    const mid: [number, number] = shiftMeters(ORIGIN, 45, 0);
    const crossing: [number, number][] = [
      shiftMeters(mid, 0, -50),
      shiftMeters(mid, 0, 50),
    ];
    expect(lineStringDistanceMeters(LINE_ORIGIN, crossing)).toBe(0);
  });

  it("returns Infinity for empty geometry rather than throwing", () => {
    expect(lineStringDistanceMeters([], LINE_ORIGIN)).toBe(Number.POSITIVE_INFINITY);
    expect(lineStringDistanceMeters(LINE_ORIGIN, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it("buckets segments into a grid and finds only the close ones", () => {
    const adjacency = computeSegmentAdjacency(
      [
        { id: "a", coords: LINE_ORIGIN },
        { id: "near", coords: LINE_30M },
        { id: "far", coords: LINE_500M },
      ],
      50,
    );

    expect([...adjacency.get("a")!]).toEqual(["near"]);
    expect([...adjacency.get("near")!]).toEqual(["a"]);
    expect([...adjacency.get("far")!]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Date resolution
// ---------------------------------------------------------------------------

describe("work-window resolution", () => {
  it("rejects dates that are not real calendar days", () => {
    // Note: `Date.parse` would silently roll 2026-02-30 over to 2 March.
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("15/06/2026")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay(undefined)).toBeNull();
    expect(parseDay("2026-02-28")).not.toBeNull();
  });

  it("prefers actual dates over planned ones, field by field", () => {
    const resolved = resolveWorkWindow(
      project({ id: "p1", actual_start: "2026-02-01", actual_end: "2026-02-20" }),
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.window.start).toBe(dayMs("2026-02-01"));
    expect(resolved.window.end).toBe(dayMs("2026-02-20"));
  });

  it("classifies missing, invalid and inverted windows", () => {
    expect(resolveWorkWindow(project({ id: "p1", planned_start: null }))).toEqual({
      ok: false,
      reason: "MISSING_DATES",
    });
    expect(resolveWorkWindow(project({ id: "p1", planned_end: "" }))).toEqual({
      ok: false,
      reason: "MISSING_DATES",
    });
    expect(resolveWorkWindow(project({ id: "p1", planned_end: "2026-02-30" }))).toEqual({
      ok: false,
      reason: "INVALID_DATES",
    });
    expect(
      resolveWorkWindow(project({ id: "p1", planned_start: "2026-03-01", planned_end: "2026-01-01" })),
    ).toEqual({ ok: false, reason: "INVERTED_DATES" });
  });
});

// ---------------------------------------------------------------------------
// Concurrent overlap
// ---------------------------------------------------------------------------

describe("CONCURRENT_OVERLAP", () => {
  const overlapProjects = [
    project({
      id: "p-road",
      title: "Resurfacing",
      project_type: "road",
      department_id: "dept-roads",
      road_segment_id: "seg-1",
      planned_start: "2026-01-01",
      planned_end: "2026-01-31",
    }),
    project({
      id: "p-water",
      title: "Water main",
      project_type: "water_pipeline",
      department_id: "dept-water",
      road_segment_id: "seg-1",
      planned_start: "2026-01-15",
      planned_end: "2026-02-15",
    }),
  ];

  it("flags two departments overlapping on an identical segment", () => {
    const result = detectClashes(overlapProjects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
    expect(result.clashes).toHaveLength(1);

    const clash = result.clashes[0];
    expect(clash.type).toBe("CONCURRENT_OVERLAP");
    // 15 Jan .. 31 Jan inclusive.
    expect(clash.overlapDays).toBe(17);
    expect(clash.gapDays).toBeUndefined();
    expect(clash.projectA.id).toBe("p-road");
    expect(clash.projectB.id).toBe("p-water");
    expect(clash.segmentId).toBe("seg-1");
    expect(clash.explanation).toContain("Resurfacing");
    expect(clash.explanation).toContain("17 days");
    expect(clash.suggestion.length).toBeGreaterThan(20);
    expect(clash.estimatedWasteInr).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(clash.severity);
  });

  it("flags an overlap across two adjacent segments", () => {
    const projects = [
      overlapProjects[0],
      { ...overlapProjects[1], road_segment_id: "seg-2" },
    ];
    const result = detectClashes(
      projects,
      [segment("seg-1", LINE_ORIGIN), segment("seg-2", LINE_30M)],
      { now: NOW },
    );

    expect(result.clashes).toHaveLength(1);
    // Deterministic pick: the lower segment id.
    expect(result.clashes[0].segmentId).toBe("seg-1");
    expect(result.clashes[0].explanation).toContain("next to");
  });

  it("ignores two works on segments further apart than the adjacency radius", () => {
    const projects = [
      overlapProjects[0],
      { ...overlapProjects[1], road_segment_id: "seg-2" },
    ];
    const result = detectClashes(
      projects,
      [segment("seg-1", LINE_ORIGIN), segment("seg-2", LINE_500M)],
      { now: NOW },
    );
    expect(result.clashes).toEqual([]);
  });

  it("honours a custom adjacency radius", () => {
    const projects = [
      overlapProjects[0],
      { ...overlapProjects[1], road_segment_id: "seg-2" },
    ];
    const segments = [segment("seg-1", LINE_ORIGIN), segment("seg-2", LINE_30M)];

    expect(detectClashes(projects, segments, { now: NOW, adjacencyMeters: 10 }).clashes).toEqual([]);
    expect(detectClashes(projects, segments, { now: NOW, adjacencyMeters: 40 }).clashes).toHaveLength(1);
  });

  it("counts touching windows (end == start) as one day of overlap", () => {
    const projects = [
      project({ id: "a", planned_start: "2026-01-01", planned_end: "2026-01-31" }),
      project({
        id: "b",
        department_id: "dept-power",
        planned_start: "2026-01-31",
        planned_end: "2026-02-20",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("CONCURRENT_OVERLAP");
    expect(result.clashes[0].overlapDays).toBe(1);
  });

  it("does not flag non-overlapping windows on the same segment", () => {
    const projects = [
      project({ id: "a", planned_start: "2026-01-01", planned_end: "2026-01-10" }),
      project({
        id: "b",
        department_id: "dept-power",
        planned_start: "2026-09-01",
        planned_end: "2026-09-10",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
    expect(result.clashes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Repeat dig
// ---------------------------------------------------------------------------

describe("REPEAT_DIG", () => {
  function repeatPair(gapDays: number, options?: { firstType?: string }) {
    const projects = [
      project({
        id: "p-first",
        title: "Road restored",
        project_type: options?.firstType ?? "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: "2026-01-01",
        planned_end: "2026-01-31",
        actual_start: "2026-01-01",
        actual_end: "2026-01-31",
      }),
      project({
        id: "p-second",
        title: "Cable dug",
        project_type: "power_cable",
        department_id: "dept-power",
        planned_start: plus("2026-01-31", gapDays),
        planned_end: plus("2026-01-31", gapDays + 20),
      }),
    ];
    return detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
  }

  it("flags a dig inside the repeat-dig window", () => {
    const result = repeatPair(30);
    expect(result.clashes).toHaveLength(1);

    const clash = result.clashes[0];
    expect(clash.type).toBe("REPEAT_DIG");
    expect(clash.gapDays).toBe(30);
    expect(clash.overlapDays).toBeUndefined();
    expect(clash.projectA.id).toBe("p-first");
    expect(clash.projectB.id).toBe("p-second");
    expect(clash.explanation).toContain("30 days after");
    expect(clash.explanation).toContain("repeat-dig window");
  });

  it("includes the boundary at exactly repeatDigWindowDays", () => {
    expect(repeatPair(180).clashes).toHaveLength(1);
    expect(repeatPair(180).clashes[0].gapDays).toBe(180);
  });

  it("does not flag a dig outside the repeatDigWindow", () => {
    expect(repeatPair(181).clashes).toEqual([]);
    expect(repeatPair(400).clashes).toEqual([]);
  });

  it("honours a custom repeat-dig window", () => {
    const projects = [
      project({
        id: "p-first",
        status: "completed",
        actual_end: "2026-01-31",
        planned_start: "2026-01-01",
        planned_end: "2026-01-31",
      }),
      project({
        id: "p-second",
        department_id: "dept-power",
        planned_start: plus("2026-01-31", 60),
        planned_end: plus("2026-01-31", 80),
      }),
    ];
    const segments = [segment("seg-1", LINE_ORIGIN)];
    expect(detectClashes(projects, segments, { now: NOW, repeatDigWindowDays: 30 }).clashes).toEqual([]);
    expect(detectClashes(projects, segments, { now: NOW, repeatDigWindowDays: 90 }).clashes).toHaveLength(1);
  });

  it("scores a shorter gap higher than a longer one", () => {
    const soon = repeatPair(10).clashes[0];
    const late = repeatPair(170).clashes[0];
    expect((soon.estimatedWasteInr ?? 0)).toBe((late.estimatedWasteInr ?? 0));
    expect(["low", "medium", "high"]).toContain(soon.severity);
    expect(["low", "medium", "high"]).toContain(late.severity);
  });
});

// ---------------------------------------------------------------------------
// Same department
// ---------------------------------------------------------------------------

describe("same-department pairs", () => {
  const sameDept = [
    project({
      id: "a",
      department_id: "dept-roads",
      project_type: "road",
      planned_start: "2026-01-01",
      planned_end: "2026-01-31",
      budget_inr: 4_750_000,
    }),
    project({
      id: "b",
      department_id: "dept-roads",
      planned_start: "2026-01-05",
      planned_end: "2026-02-20",
      budget_inr: 3_200_000,
    }),
  ];

  it("reports them at low severity by default", () => {
    const result = detectClashes(sameDept, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].severity).toBe("low");
    expect(result.clashes[0].explanation).toContain("same department");
  });

  it("drops them entirely when ignoreSameDepartment is set", () => {
    const result = detectClashes(sameDept, [segment("seg-1", LINE_ORIGIN)], {
      now: NOW,
      ignoreSameDepartment: true,
    });
    expect(result.clashes).toEqual([]);
  });

  it("does not apply the same-department override across departments", () => {
    const projects = [{ ...sameDept[0] }, { ...sameDept[1], department_id: "dept-water" }];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
    expect(result.clashes[0].severity).not.toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Excluded and unusable rows
// ---------------------------------------------------------------------------

describe("engine robustness", () => {
  it("returns empty results for empty input", () => {
    const result = detectClashes([], []);
    expect(result.clashes).toEqual([]);
    expect(result.clusters).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  it("stamps generatedAt from options.now", () => {
    expect(detectClashes([], [], { now: NOW }).generatedAt).toBe(NOW.toISOString());
  });

  it("excludes cancelled projects without reporting them as skipped", () => {
    const projects = [
      project({ id: "a", planned_start: "2026-01-01", planned_end: "2026-01-31" }),
      project({
        id: "b",
        department_id: "dept-power",
        status: "cancelled",
        planned_start: "2026-01-05",
        planned_end: "2026-02-01",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });
    expect(result.clashes).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("skips missing, invalid and inverted dates with a reason and never throws", () => {
    const projects = [
      project({ id: "ok-1", planned_start: "2026-01-01", planned_end: "2026-01-31" }),
      project({
        id: "ok-2",
        department_id: "dept-power",
        planned_start: "2026-01-10",
        planned_end: "2026-02-10",
      }),
      project({ id: "bad-missing", planned_start: null }),
      project({ id: "bad-invalid", planned_end: "not-a-date" }),
      project({ id: "bad-inverted", planned_start: "2026-05-01", planned_end: "2026-04-01" }),
    ];

    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    // The two good rows still clash: one bad row must not blank the board.
    expect(result.clashes).toHaveLength(1);
    expect(result.skipped.map((row) => [row.projectId, row.reason])).toEqual([
      ["bad-invalid", "INVALID_DATES"],
      ["bad-inverted", "INVERTED_DATES"],
      ["bad-missing", "MISSING_DATES"],
    ]);
  });

  it("tolerates missing or malformed segment geometry", () => {
    const projects = [
      project({ id: "a", road_segment_id: "seg-1", planned_start: "2026-01-01", planned_end: "2026-01-31" }),
      project({
        id: "b",
        department_id: "dept-power",
        road_segment_id: "seg-1",
        planned_start: "2026-01-10",
        planned_end: "2026-02-10",
      }),
      project({
        id: "c",
        department_id: "dept-fibre",
        road_segment_id: "seg-unknown",
        planned_start: "2026-01-10",
        planned_end: "2026-02-10",
      }),
    ];

    // The segment carries a name but no geometry: the same-segment rule must
    // still fire, and the explanation falls back to the name.
    const result = detectClashes(
      projects,
      [{ id: "seg-1", name: "Test Road seg-1", ward: "W", geometry: null }],
      { now: NOW },
    );

    expect(result.clashes).toHaveLength(1);
    expect(findClash(result.clashes, "a", "b")).toBeDefined();
    expect(result.clashes[0].explanation).toContain("Test Road seg-1");

    // With no segment row at all, the same-segment rule still works.
    const bare = detectClashes(projects, [], { now: NOW });
    expect(bare.clashes).toHaveLength(1);
    expect(bare.clashes[0].explanation).toContain("the same road");
  });
});

// ---------------------------------------------------------------------------
// Clusters + determinism + performance
// ---------------------------------------------------------------------------

function clusterFixture(): Project[] {
  return [
    project({ id: "p-a", department_id: "dept-1", planned_start: "2026-01-01", planned_end: "2026-01-10" }),
    project({ id: "p-b", department_id: "dept-2", planned_start: "2026-01-05", planned_end: "2026-01-15" }),
    project({ id: "p-c", department_id: "dept-3", planned_start: "2026-01-12", planned_end: "2026-01-25" }),
  ];
}

describe("three-way clusters", () => {
  const segments = [segment("seg-1", LINE_ORIGIN)];

  it("groups a 3-way conflict into one cluster without duplicate pairs", () => {
    const result = detectClashes(clusterFixture(), segments, { now: NOW });

    // A×B overlap, B×C overlap, A×C repeat dig.
    expect(result.clashes).toHaveLength(3);
    expect(new Set(result.clashes.map(pairKey)).size).toBe(3);

    for (const clash of result.clashes) {
      expect(clash.clusterSize).toBe(3);
      expect(clash.clusterId).toBe("cluster:p-a");
    }

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].projectIds).toEqual(["p-a", "p-b", "p-c"]);
    expect(result.clusters[0].clashIds).toHaveLength(3);
    expect(result.clusters[0].severity).toBe(
      result.clashes.some((clash) => clash.severity === "high")
        ? "high"
        : result.clashes.some((clash) => clash.severity === "medium")
          ? "medium"
          : "low",
    );

    const repeat = findClash(result.clashes, "p-a", "p-c");
    expect(repeat?.type).toBe("REPEAT_DIG");
    expect(repeat?.gapDays).toBe(2);
  });

  it("does not cluster a lone pair", () => {
    const result = detectClashes(clusterFixture().slice(0, 2), segments, { now: NOW });
    expect(result.clashes).toHaveLength(1);
    expect(result.clusters).toEqual([]);
    expect(result.clashes[0].clusterId).toBeUndefined();
    expect(result.clashes[0].clusterSize).toBeUndefined();
  });
});

describe("determinism", () => {
  it("returns the same result for the same input", () => {
    const segments = [segment("seg-1", LINE_ORIGIN)];
    const first = detectClashes(clusterFixture(), segments, { now: NOW });
    const second = detectClashes(clusterFixture(), segments, { now: NOW });
    expect(second).toEqual(first);
  });

  it("is insensitive to the order of the input array", () => {
    const segments = [segment("seg-1", LINE_ORIGIN)];
    const projects = clusterFixture();
    const forward = detectClashes(projects, segments, { now: NOW });
    const reversed = detectClashes([...projects].reverse(), segments, { now: NOW });

    expect(reversed.clashes.map((clash) => clash.id)).toEqual(
      forward.clashes.map((clash) => clash.id),
    );
    expect(reversed.clusters).toEqual(forward.clusters);
  });

  it("sorts by severity, then by estimated waste", () => {
    const seedNow = new Date("2026-10-10T00:00:00Z");
    const { projects, segments } = loadSeed(seedNow);
    const result = detectClashes(projects, segments, { now: seedNow });

    const order = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < result.clashes.length; i += 1) {
      const previous = result.clashes[i - 1];
      const current = result.clashes[i];
      expect(order[previous.severity]).toBeLessThanOrEqual(order[current.severity]);
      if (previous.severity === current.severity) {
        expect(previous.estimatedWasteInr ?? 0).toBeGreaterThanOrEqual(current.estimatedWasteInr ?? 0);
      }
    }
  });
});

describe("performance", () => {
  it("detects clashes across 500 projects in well under 300 ms", () => {
    const SEGMENT_COUNT = 100;
    const PER_SEGMENT = 5;
    const types = ["road", "drain", "water_pipeline", "power_cable", "fibre"];

    const segments: RoadSegment[] = [];
    const projects: Project[] = [];

    for (let s = 0; s < SEGMENT_COUNT; s += 1) {
      const row = Math.floor(s / 10);
      const col = s % 10;
      // A 10x10 district with streets 45 m apart: close enough that the
      // adjacency grid has real candidate pairs to reject or accept, dense
      // enough that a naive O(projects²) sweep would be 124,750 comparisons.
      const anchor = shiftMeters(ORIGIN, col * 45, row * 45);
      const id = `seg-${s}`;
      segments.push(segment(id, [anchor, shiftMeters(anchor, 90, 0)]));

      for (let k = 0; k < PER_SEGMENT; k += 1) {
        const index = s * PER_SEGMENT + k;
        // Phases are spread over ~55 years so different streets mostly do not
        // collide; within a street, consecutive works sit right on the
        // repeat-dig boundary. That keeps the clash count realistic.
        const start = plus("2026-01-01", ((s * 997) % 20_000) + k * 200);
        projects.push(
          project({
            id: `p-${index}`,
            road_segment_id: id,
            department_id: `dept-${index % 4}`,
            project_type: types[index % types.length],
            planned_start: start,
            planned_end: plus(start, 20),
            budget_inr: 500_000 + (index % 7) * 250_000,
          }),
        );
      }
    }

    expect(projects).toHaveLength(500);

    // Warm up so the measurement is not dominated by first-call JIT work.
    detectClashes(projects, segments, { now: NOW });

    const started = performance.now();
    const result = detectClashes(projects, segments, { now: NOW });
    const elapsed = performance.now() - started;

    expect(result.clashes.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

describe("proposeCoordination", () => {
  it("proposes one merged window for an overlap and never mutates the clash", () => {
    const result = detectClashes(
      [
        project({ id: "a", title: "Resurfacing", department_id: "dept-roads", planned_start: "2026-01-01", planned_end: "2026-01-20", budget_inr: 2_000_000 }),
        project({ id: "b", title: "Water main", department_id: "dept-water", planned_start: "2026-01-10", planned_end: "2026-02-05", budget_inr: 4_000_000 }),
      ],
      [segment("seg-1", LINE_ORIGIN)],
      { now: NOW },
    );

    const clash = result.clashes[0];
    const snapshot = JSON.parse(JSON.stringify(clash)) as Clash;
    const proposal = proposeCoordination(clash);

    expect(clash).toEqual(snapshot);
    expect(proposal.action).toBe("merge");
    expect(proposal.savesDig).toBe(true);
    expect(proposal.proposedWindow).toEqual({ start: "2026-01-01", end: "2026-02-05" });
    // 35% of the smaller budget (2,000,000).
    expect(proposal.estimatedWasteInr).toBe(700_000);
    expect(proposal.suggestion).toContain("Water main");
    expect(proposal.suggestion).toContain("Resurfacing");
    expect(proposal.suggestion).toContain("simulated estimate");
  });

  it("tells the truth when the earlier work is already finished", () => {
    const result = detectClashes(
      [
        project({
          id: "a",
          title: "Road restored",
          project_type: "road",
          department_id: "dept-roads",
          status: "completed",
          planned_start: "2026-01-01",
          planned_end: "2026-01-31",
          actual_start: "2026-01-01",
          actual_end: "2026-01-31",
          budget_inr: 4_750_000,
        }),
        project({
          id: "b",
          title: "Cable dug",
          department_id: "dept-power",
          planned_start: plus("2026-01-31", 91),
          planned_end: plus("2026-01-31", 111),
          budget_inr: 3_200_000,
        }),
      ],
      [segment("seg-1", LINE_ORIGIN)],
      { now: NOW },
    );

    const proposal = proposeCoordination(result.clashes[0]);
    expect(proposal.action).toBe("batch");
    expect(proposal.suggestion).toContain("re-opens a road");
    expect(proposal.suggestion).not.toContain("Bring");
    // 60% of the smaller budget (3,200,000).
    expect(proposal.estimatedWasteInr).toBe(1_920_000);
  });

  it("degrades gracefully when the dates cannot be read", () => {
    const clash = {
      id: "clash:REPEAT_DIG:a:b",
      type: "REPEAT_DIG" as const,
      severity: "high" as const,
      projectA: project({ id: "a", planned_start: null }),
      projectB: project({ id: "b" }),
      segmentId: "seg-1",
      explanation: "",
      suggestion: "",
    };

    const proposal = proposeCoordination(clash);
    expect(proposal.proposedWindow).toBeNull();
    expect(proposal.estimatedWasteInr).toBeNull();
    expect(proposal.suggestion.length).toBeGreaterThan(0);
  });

  it("falls back to a nominal budget when neither work records one", () => {
    const clash = {
      id: "clash:CONCURRENT_OVERLAP:a:b",
      type: "CONCURRENT_OVERLAP" as const,
      severity: "medium" as const,
      projectA: project({ id: "a", budget_inr: null }),
      projectB: project({ id: "b", budget_inr: null, department_id: "dept-power" }),
      segmentId: "seg-1",
      explanation: "",
      suggestion: "",
    };

    const proposal = proposeCoordination(clash);
    expect(proposal.estimatedWasteInr).toBeGreaterThan(0);
    expect(proposal.suggestion).toContain("simulated estimate");
  });
});

// ---------------------------------------------------------------------------
// The planted demo stories (data/seed.json)
// ---------------------------------------------------------------------------

/**
 * The seed stores dates as day offsets, so the fixtures are resolved against a
 * pinned "today" — otherwise these assertions would drift with the calendar.
 * The projects are returned with the APP's types on purpose: passing them to
 * the engine is a compile-time proof that the engine's structural `Project`
 * accepts the data layer's `Project` unchanged.
 */
function loadSeed(now: Date): { projects: AppProject[]; segments: AppRoadSegment[] } {
  const data = seed as unknown as SeedData;
  const projects: AppProject[] = data.projects.map((row) => ({
    ...row,
    planned_start: resolveSeedDateOptional(row.planned_start, now),
    planned_end: resolveSeedDateOptional(row.planned_end, now),
    actual_start: resolveSeedDateOptional(row.actual_start, now),
    actual_end: resolveSeedDateOptional(row.actual_end, now),
  }));
  return { projects, segments: data.road_segments };
}

describe("flagship seed story", () => {
  const seedNow = new Date("2026-10-10T00:00:00Z");
  const { projects, segments } = loadSeed(seedNow);
  const result = detectClashes(projects, segments, { now: seedNow });

  const byTitle = (fragment: string): AppProject => {
    const found = projects.find((candidate) => candidate.title.includes(fragment));
    if (!found) throw new Error(`seed project not found: ${fragment}`);
    return found;
  };

  it("accepts the data layer's rows and finds clashes", () => {
    expect(projects).toHaveLength(39);
    expect(result.clashes.length).toBeGreaterThan(10);
    expect(result.skipped).toEqual([]);
  });

  it("flags the flagship water-main-then-power-cable repeat dig (91 days)", () => {
    const water = byTitle("Water pipeline replacement, Amber Garden Road");
    const power = byTitle("Underground power cable, Amber Garden Road");

    const clash = findClash(result.clashes, water.id, power.id);
    expect(clash).toBeDefined();
    expect(clash?.type).toBe("REPEAT_DIG");
    expect(clash?.gapDays).toBe(91);
    expect(["medium", "high"]).toContain(clash?.severity);
    expect(clash?.projectA.id).toBe(water.id);
    expect(clash?.projectB.id).toBe(power.id);
    expect(clash?.estimatedWasteInr).toBeGreaterThan(0);
    expect(clash?.suggestion).toContain("simulated estimate");
  });

  it("groups the four Amber Garden Road works into one cluster", () => {
    const amber = new Set(
      [
        "Footpath rebuilding, Amber Garden Road",
        "Water pipeline replacement, Amber Garden Road",
        "Underground power cable, Amber Garden Road",
        "5G small-cell fibre, Amber Garden Road",
      ].map((fragment) => byTitle(fragment).id),
    );

    const cluster = result.clusters.find((candidate) =>
      candidate.projectIds.some((id) => amber.has(id)),
    );
    expect(cluster).toBeDefined();
    expect(cluster?.projectIds.sort()).toEqual([...amber].sort());
    expect(cluster?.clashIds).toHaveLength(6);
  });

  it("flags the Vasanth Nagar road-and-fibre overlap (scenario a)", () => {
    const road = byTitle("Carriageway resurfacing, Vasanth Nagar 1st Street");
    const fibre = byTitle("Fibre duct laying, Vasanth Nagar 1st Street");

    const clash = findClash(result.clashes, road.id, fibre.id);
    expect(clash?.type).toBe("CONCURRENT_OVERLAP");
    expect(clash?.overlapDays).toBe(26);
    // Roads and Telecom Fibre are different departments.
    expect(clash?.severity).not.toBe("low");
  });

  it("flags the Kaveri Cross Road 60-day repeat dig (scenario b)", () => {
    const road = byTitle("Resurfacing, Kaveri Cross Road");
    const water = byTitle("Water main replacement, Kaveri Cross Road");

    const clash = findClash(result.clashes, road.id, water.id);
    expect(clash?.type).toBe("REPEAT_DIG");
    expect(clash?.gapDays).toBe(60);
  });

  it("excludes cancelled seed projects", () => {
    const cancelled = projects.filter((candidate) => candidate.status === "cancelled").map((c) => c.id);
    expect(cancelled.length).toBeGreaterThan(0);
    for (const id of cancelled) {
      expect(result.clashes.some((clash) => clash.projectA.id === id || clash.projectB.id === id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Window edge cases
// ---------------------------------------------------------------------------

/**
 * The engine's contract on awkward windows, pinned as regression tests:
 * zero-length jobs, year boundaries and projects with no plan at all must
 * behave exactly like the documented rules — never silently collapse.
 */
describe("window edge cases", () => {
  it("counts two zero-length (same-day) windows as one day of overlap", () => {
    const projects = [
      project({ id: "a", planned_start: "2026-01-10", planned_end: "2026-01-10" }),
      project({
        id: "b",
        department_id: "dept-power",
        planned_start: "2026-01-10",
        planned_end: "2026-01-10",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("CONCURRENT_OVERLAP");
    expect(result.clashes[0].overlapDays).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it("treats a zero-length job followed the next day as a 1-day repeat dig", () => {
    const projects = [
      project({
        id: "p-first",
        title: "Road restored",
        project_type: "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: "2026-01-31",
        planned_end: "2026-01-31",
        actual_start: "2026-01-31",
        actual_end: "2026-01-31",
      }),
      project({
        id: "p-second",
        department_id: "dept-power",
        planned_start: "2026-02-01",
        planned_end: "2026-02-21",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].gapDays).toBe(1);
  });

  it("flags a repeat dig across two adjacent segments", () => {
    const projects = [
      project({
        id: "p-first",
        title: "Road restored",
        project_type: "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: "2026-01-01",
        planned_end: "2026-01-31",
        actual_start: "2026-01-01",
        actual_end: "2026-01-31",
        road_segment_id: "seg-1",
      }),
      project({
        id: "p-second",
        department_id: "dept-power",
        road_segment_id: "seg-2",
        planned_start: "2026-03-01",
        planned_end: "2026-03-21",
      }),
    ];
    const result = detectClashes(
      projects,
      [segment("seg-1", LINE_ORIGIN), segment("seg-2", LINE_30M)],
      { now: NOW },
    );

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].gapDays).toBe(29);
    expect(result.clashes[0].segmentId).toBe("seg-1");
    expect(result.clashes[0].explanation).toContain("next to");
  });

  it("forces a same-department repeat dig to low severity", () => {
    const projects = [
      project({
        id: "p-first",
        project_type: "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: "2026-01-01",
        planned_end: "2026-01-31",
        actual_start: "2026-01-01",
        actual_end: "2026-01-31",
      }),
      project({
        id: "p-second",
        department_id: "dept-roads",
        planned_start: "2026-03-01",
        planned_end: "2026-03-21",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].severity).toBe("low");
  });

  it("resolves a project that records only actual dates", () => {
    const projects = [
      project({
        id: "p-first",
        title: "Road restored",
        project_type: "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: null,
        planned_end: null,
        actual_start: "2026-01-01",
        actual_end: "2026-01-31",
      }),
      project({
        id: "p-second",
        department_id: "dept-power",
        planned_start: "2026-03-01",
        planned_end: "2026-03-21",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.skipped).toEqual([]);
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].gapDays).toBe(29);
  });

  it("measures a gap across a year boundary", () => {
    const projects = [
      project({
        id: "p-first",
        project_type: "road",
        department_id: "dept-roads",
        status: "completed",
        planned_start: "2025-12-01",
        planned_end: "2025-12-31",
        actual_start: "2025-12-01",
        actual_end: "2025-12-31",
      }),
      project({
        id: "p-second",
        department_id: "dept-power",
        planned_start: "2026-01-02",
        planned_end: "2026-01-22",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].gapDays).toBe(2);
  });

  it("counts an inclusive touching overlap across a year boundary", () => {
    const projects = [
      project({ id: "a", planned_start: "2025-12-30", planned_end: "2025-12-31" }),
      project({
        id: "b",
        department_id: "dept-power",
        planned_start: "2025-12-31",
        planned_end: "2026-01-01",
      }),
    ];
    const result = detectClashes(projects, [segment("seg-1", LINE_ORIGIN)], { now: NOW });

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("CONCURRENT_OVERLAP");
    expect(result.clashes[0].overlapDays).toBe(1);
  });

  it("proposes the union window covering both works for a repeat dig", () => {
    const result = detectClashes(
      [
        project({
          id: "a",
          title: "Road restored",
          project_type: "road",
          department_id: "dept-roads",
          planned_start: "2026-01-01",
          planned_end: "2026-01-31",
          budget_inr: 4_000_000,
        }),
        project({
          id: "b",
          title: "Cable dug",
          department_id: "dept-power",
          planned_start: plus("2026-01-31", 30),
          planned_end: plus("2026-01-31", 50),
          budget_inr: 3_000_000,
        }),
      ],
      [segment("seg-1", LINE_ORIGIN)],
      { now: NOW },
    );

    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].type).toBe("REPEAT_DIG");
    expect(result.clashes[0].gapDays).toBe(30);

    const proposal = proposeCoordination(result.clashes[0]);
    expect(proposal.proposedWindow).toEqual({
      start: "2026-01-01",
      // Jan 31 + 50 days = 22 Mar 2026 — the union of both works' windows.
      end: "2026-03-22",
    });
    expect(proposal.action).toBe("merge");
    expect(proposal.savesDig).toBe(true);
  });
});
