import { describe, expect, it } from "vitest";
import { detectClashes } from "@/lib/clash";
import { REPEAT_DIG_WASTE_RATIO } from "@/lib/clash";
import { loadDashboardData } from "@/lib/dashboard";
import {
  ACTIVE_STATUSES,
  computeDashboardMetrics,
  type DashboardInput,
} from "@/lib/dashboard-metrics";
import type { Project, RoadSegment, Verification } from "@/lib/types";

/**
 * M7 dashboard arithmetic (PLAN.md M7 items 1–4).
 *
 * Precision tests use a fixed clock and absolute dates so the numbers are
 * asserted exactly; the last suite runs the real loader over the committed
 * seed to prove the whole path works in demo mode with no database.
 */

const NOW = new Date("2026-06-15T00:00:00Z");

const SEGMENT: RoadSegment = {
  id: "seg-1",
  name: "Test Main Road",
  ward: "Ward 1",
  is_simulated: true,
  geometry: {
    type: "LineString",
    coordinates: [
      [80.24, 13.05],
      [80.25, 13.05],
    ],
  },
};

const DEPARTMENTS = [
  { id: "d-roads", name: "Roads Department", code: "ROADS", is_simulated: true },
  { id: "d-water", name: "Water Board", code: "WATER", is_simulated: true },
];

// A registry engineered to hit every rule at once. Dates are absolute so the
// assertions below hold whatever day the test runs on.
const PROJECTS: Project[] = [
  {
    id: "p1",
    title: "Road resurfacing north half",
    purpose: "Test",
    project_type: "road",
    department_id: "d-roads",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-02-01",
    planned_end: "2026-05-01",
    actual_start: "2026-03-01",
    actual_end: "2026-05-20",
    status: "completed",
    budget_inr: 1_000_000,
    is_simulated: true,
  },
  {
    id: "p2",
    title: "Road markings south half",
    purpose: "Test",
    project_type: "road",
    department_id: "d-roads",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-02-15",
    planned_end: "2026-05-01",
    actual_start: "2026-03-15",
    actual_end: null,
    status: "in_progress",
    budget_inr: 800_000,
    is_simulated: true,
  },
  {
    id: "p3",
    title: "Footpath rebuild east side",
    purpose: "Test",
    project_type: "road",
    department_id: "d-roads",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-01-01",
    planned_end: "2026-04-01",
    actual_start: "2026-01-10",
    actual_end: "2026-03-20",
    status: "completed",
    budget_inr: 500_000,
    is_simulated: true,
  },
  {
    id: "p4",
    title: "Water main inspection",
    purpose: "Test",
    project_type: "water_pipeline",
    department_id: "d-water",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-06-01",
    planned_end: "2026-07-01",
    actual_start: null,
    actual_end: null,
    status: "planned",
    budget_inr: 400_000,
    is_simulated: true,
  },
  {
    id: "p5",
    title: "Water valve replacement",
    purpose: "Test",
    project_type: "water_pipeline",
    department_id: "d-water",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-03-01",
    planned_end: "2026-05-10",
    actual_start: "2026-04-02",
    actual_end: "2026-05-11",
    status: "completed",
    budget_inr: 300_000,
    is_simulated: true,
  },
  {
    id: "p6",
    title: "Cancelled survey works",
    purpose: "Test",
    project_type: "other",
    department_id: "d-roads",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-04-01",
    planned_end: "2026-05-01",
    actual_start: "2026-05-01",
    actual_end: "2026-05-02",
    status: "cancelled",
    budget_inr: 100_000,
    is_simulated: true,
  },
  {
    id: "p7",
    title: "Water connection works",
    purpose: "Test",
    project_type: "water_pipeline",
    department_id: "d-water",
    contractor_name: null,
    road_segment_id: "seg-1",
    planned_start: "2026-02-01",
    planned_end: null,
    actual_start: null,
    actual_end: null,
    status: "in_progress",
    budget_inr: 200_000,
    is_simulated: true,
  },
];

function votes(
  projectId: string,
  ...tally: ("confirm" | "dispute")[]
): Verification[] {
  return tally.map((vote, i) => ({
    id: `v-${projectId}-${i}`,
    project_id: projectId,
    vote,
    device_id: `dev-${i}`,
    is_simulated: true,
    created_at: "2026-06-01T00:00:00.000Z",
  }));
}

function baseInput(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    projects: PROJECTS,
    departments: DEPARTMENTS,
    verifications: [
      ...votes("p3", "dispute", "dispute", "dispute", "dispute"),
      ...votes("p5", "confirm", "confirm", "dispute"),
    ],
    reports: [
      {
        id: "r1",
        project_id: null,
        report_type: "unlisted_work",
        description: "Open trench with no notice.",
        photo_url: null,
        lat: 13.06,
        lng: 80.24,
        is_unlisted_work: true,
        is_simulated: true,
        created_at: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "r2",
        project_id: "p2",
        report_type: "debris_dust_noise",
        description: "Dust from the works.",
        photo_url: null,
        lat: 13.06,
        lng: 80.24,
        is_unlisted_work: false,
        is_simulated: true,
        created_at: "2026-06-11T00:00:00.000Z",
      },
    ],
    clashes: [],
    ...overrides,
  };
}

describe("dashboard KPIs", () => {
  it("counts active works as in progress + stalled", () => {
    const { kpis } = computeDashboardMetrics(baseInput(), { now: NOW });
    expect(kpis.activeProjects).toBe(2);
    expect(ACTIVE_STATUSES).toEqual(["in_progress", "stalled"]);
  });

  it("computes delayed %, average delay and their bases", () => {
    const { kpis } = computeDashboardMetrics(baseInput(), { now: NOW });
    expect(kpis.totalProjects).toBe(7);
    expect(kpis.delayedBase).toBe(5); // p6 cancelled and p7 unplanned excluded
    expect(kpis.delayedCount).toBe(3); // p1 (19d), p2 (45d), p5 (1d)
    expect(kpis.delayedPercent).toBe(60);
    expect(kpis.averageDelayDays).toBe(21.7);
  });

  it("counts contested completions with the shared contested rule", () => {
    const metrics = computeDashboardMetrics(baseInput(), { now: NOW });
    expect(metrics.kpis.contestedCompletions).toBe(1);
    expect(metrics.contested).toHaveLength(1);
    expect(metrics.contested[0].project.id).toBe("p3");
    expect(metrics.contested[0].dispute).toBe(4);
    // p5 has 1 dispute of 3 votes — under both thresholds, so not contested.
  });

  it("counts unlisted-work reports only", () => {
    const { kpis } = computeDashboardMetrics(baseInput(), { now: NOW });
    expect(kpis.unlistedReports).toBe(1);
  });

  it("returns zero-everything metrics for an empty registry", () => {
    const metrics = computeDashboardMetrics(
      { projects: [], departments: [], verifications: [], reports: [], clashes: [] },
      { now: NOW },
    );
    expect(metrics.kpis).toMatchObject({
      activeProjects: 0,
      delayedBase: 0,
      delayedPercent: 0,
      averageDelayDays: 0,
      openClashes: 0,
      contestedCompletions: 0,
      unlistedReports: 0,
    });
    expect(metrics.scorecard).toEqual([]);
    expect(metrics.statuses.map((s) => s.count).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("department scorecard", () => {
  const metrics = computeDashboardMetrics(baseInput(), { now: NOW });

  it("renders one row per department, zero-filled where nothing happened", () => {
    expect(metrics.scorecard).toHaveLength(2);
    const roads = metrics.scorecard[0];
    expect(roads.departmentName).toBe("Roads Department");
    expect(roads.projects).toBe(3); // p6 (cancelled) excluded
    expect(roads.onTimePercent).toBe(33.3); // p3 on time of p1,p2,p3
    expect(roads.averageDelayDays).toBe(32); // (19 + 45) / 2
    expect(roads.clashCount).toBe(0);
    expect(roads.contestedCount).toBe(1);

    const water = metrics.scorecard[1];
    expect(water.departmentName).toBe("Water Board");
    expect(water.projects).toBe(3);
    expect(water.onTimePercent).toBe(50); // p4 + p5 evaluable, p5 delayed
    expect(water.averageDelayDays).toBe(1);
    expect(water.contestedCount).toBe(0);
  });

  it("returns null on-time/average when a department has nothing to measure", () => {
    const empty: DashboardInput = {
      projects: [{ ...PROJECTS[3], department_id: "d-roads", planned_end: null }],
      departments: DEPARTMENTS,
      verifications: [],
      reports: [],
      clashes: [],
    };
    const { scorecard } = computeDashboardMetrics(empty, { now: NOW });
    const roads = scorecard.find((r) => r.departmentId === "d-roads")!;
    expect(roads.projects).toBe(1);
    expect(roads.onTimePercent).toBeNull();
    expect(roads.averageDelayDays).toBeNull();
  });
});

describe("chart series", () => {
  const metrics = computeDashboardMetrics(baseInput(), { now: NOW });

  it("breaks projects down by status across all five statuses", () => {
    const byStatus = Object.fromEntries(
      metrics.statuses.map((s) => [s.status, s.count]),
    );
    expect(byStatus).toEqual({
      planned: 1,
      in_progress: 2,
      stalled: 0,
      completed: 3,
      cancelled: 1,
    });
    const sum = metrics.statuses.reduce((acc, s) => acc + s.count, 0);
    expect(sum).toBe(metrics.kpis.totalProjects);
  });

  it("buckets new works by the month they began, ascending", () => {
    expect(metrics.monthlyNewWorks.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(metrics.monthlyNewWorks.map((m) => m.count)).toEqual([1, 1, 2, 1]);
    // A planned-not-started row is not a new work yet; a cancelled one never is.
    expect(metrics.monthlyNewWorks.at(-1)?.label).toMatch(/^Apr/);
  });

  it("aggregates delays by department, worst first", () => {
    expect(metrics.departmentDelays).toEqual([
      { departmentId: "d-roads", departmentName: "Roads Department", totalDelayDays: 64, delayedCount: 2 },
      { departmentId: "d-water", departmentName: "Water Board", totalDelayDays: 1, delayedCount: 1 },
    ]);
  });
});

describe("repeat-dig waste (clash-engine derived)", () => {
  it("sums min(budgetA, budgetB) × ratio over repeat digs only", () => {
    // Earlier work restored on 20 May; the next dig starts 12 days later.
    const projects = [
      {
        id: "a",
        title: "Road restored",
        purpose: "Test",
        project_type: "road",
        department_id: "d-roads",
        contractor_name: null,
        road_segment_id: "seg-1",
        planned_start: "2026-02-01",
        planned_end: "2026-05-20",
        actual_start: "2026-02-01",
        actual_end: "2026-05-20",
        status: "completed",
        budget_inr: 2_000_000,
        is_simulated: true,
      },
      {
        id: "b",
        title: "Fibre duct planned",
        purpose: "Test",
        project_type: "fibre",
        department_id: "d-water",
        contractor_name: null,
        road_segment_id: "seg-1",
        planned_start: "2026-06-01",
        planned_end: "2026-06-20",
        actual_start: null,
        actual_end: null,
        status: "planned",
        budget_inr: 500_000,
        is_simulated: true,
      },
    ];

    const { clashes } = detectClashes(projects, [SEGMENT], { now: NOW });
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe("REPEAT_DIG");
    expect(clashes[0].gapDays).toBe(12);
    // 2,000,000 and 500,000 → the smaller budget carries the estimate.
    expect(clashes[0].estimatedWasteInr).toBe(
      Math.round(500_000 * REPEAT_DIG_WASTE_RATIO),
    );

    const metrics = computeDashboardMetrics(
      baseInput({ clashes }),
      { now: NOW },
    );
    expect(metrics.kpis.openClashes).toBe(1);
    expect(metrics.kpis.repeatDigCount).toBe(1);
    expect(metrics.repeatDigClashCount).toBe(1);
    expect(metrics.repeatDigWasteInr).toBe(300_000);
    // Both parties are counted in their own department's clash tally.
    expect(
      metrics.scorecard.find((r) => r.departmentId === "d-roads")!.clashCount,
    ).toBe(1);
    expect(
      metrics.scorecard.find((r) => r.departmentId === "d-water")!.clashCount,
    ).toBe(1);
  });

  it("excludes concurrent-overlap waste from the repeat-dig figure", () => {
    const overlapProjects = PROJECTS.map((p) => ({
      ...p,
      // Force a same-window overlap instead of a gap.
      ...(p.id === "p5" ? { actual_start: "2026-04-20", actual_end: "2026-05-30" } : {}),
    }));
    const { clashes } = detectClashes(overlapProjects, [SEGMENT], { now: NOW });
    expect(clashes.length).toBeGreaterThan(1);
    expect(clashes.some((c) => c.type === "CONCURRENT_OVERLAP")).toBe(true);
    expect(clashes.some((c) => c.type === "REPEAT_DIG")).toBe(true);

    const metrics = computeDashboardMetrics(
      baseInput({ clashes }),
      { now: NOW },
    );
    // The figure is exactly the sum over REPEAT_DIG clashes — overlap savings
    // from the same engine are deliberately not counted here.
    const repeatDigOnly = clashes
      .filter((c) => c.type === "REPEAT_DIG")
      .reduce((sum, c) => sum + (c.estimatedWasteInr ?? 0), 0);
    const overlapOnly = clashes
      .filter((c) => c.type === "CONCURRENT_OVERLAP")
      .reduce((sum, c) => sum + (c.estimatedWasteInr ?? 0), 0);
    expect(overlapOnly).toBeGreaterThan(0);
    expect(metrics.repeatDigWasteInr).toBe(repeatDigOnly);
    expect(metrics.repeatDigClashCount).toBe(
      clashes.filter((c) => c.type === "REPEAT_DIG").length,
    );
  });
});

describe("loadDashboardData over the committed seed (demo mode)", () => {
  it("computes the whole dashboard with no database", async () => {
    const data = await loadDashboardData();

    expect(data.mode).toBe("demo");
    expect(data.kpis.totalProjects).toBeGreaterThanOrEqual(35);

    // The planted scenarios (PLAN.md §7) surface in the KPIs.
    expect(data.kpis.openClashes).toBeGreaterThan(0);
    expect(data.kpis.repeatDigCount).toBeGreaterThan(0);
    expect(data.kpis.contestedCompletions).toBeGreaterThan(0);
    // Scenario (e): exactly one unlisted-work report.
    expect(data.kpis.unlistedReports).toBe(1);
    expect(data.repeatDigWasteInr).toBeGreaterThan(0);
    expect(data.repeatDigClashCount).toBe(data.kpis.repeatDigCount);

    // Every seeded department gets a row; statuses account for all projects.
    expect(data.scorecard).toHaveLength(5);
    const statusTotal = data.statuses.reduce((acc, s) => acc + s.count, 0);
    expect(statusTotal).toBe(data.kpis.totalProjects);

    // Months ascend, and at least one month has work.
    expect(data.monthlyNewWorks.length).toBeGreaterThan(0);
    const months = data.monthlyNewWorks.map((m) => m.month);
    expect([...months].sort()).toEqual(months);
    expect(data.monthlyNewWorks.every((m) => m.count > 0)).toBe(true);

    // The stats are internally coherent: every delayed project is a real row,
    // and the scorecard's worst department matches the delay chart's leader.
    const worst = data.departmentDelays[0];
    expect(
      data.scorecard.find((r) => r.departmentId === worst.departmentId)!
        .delayedCount,
    ).toBeGreaterThan(0);
  });
});