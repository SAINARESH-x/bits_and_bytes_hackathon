import { describe, expect, it } from "vitest";
import seed from "@/data/seed.json";
import type { SeedData, SeedDate } from "@/lib/types";
import { citizenReportInputSchema, projectInputSchema } from "@/lib/schemas";
import { resolveSeedDate, resolveSeedDateOptional } from "@/lib/seed-dates";

// The JSON import widens tuple types (e.g. LineString coordinates), so the
// cast goes through unknown rather than pretending the shapes line up.
const data = seed as unknown as SeedData;
const DEPARTMENTS = new Set(data.departments.map((d) => d.id));
const SEGMENTS = new Set(data.road_segments.map((s) => s.id));
const PROJECT_IDS = new Set(data.projects.map((p) => p.id));
const TODAY = new Date();

/**
 * The planted demo stories. If any of these stop holding, the demo video's
 * flagship segment silently breaks — so they are asserted, not assumed.
 */
describe("seed integrity", () => {
  it("is marked as simulated at the top level", () => {
    expect(data.is_simulated).toBe(true);
  });

  it("marks EVERY row as simulated", () => {
    const rows = [
      ...data.departments,
      ...data.road_segments,
      ...data.projects,
      ...data.project_updates,
      ...data.citizen_reports,
      ...data.verifications,
    ];
    const offenders = rows.filter((r) => r.is_simulated !== true);
    expect(offenders.map((o) => o.id)).toEqual([]);
  });

  it("has the expected volumes", () => {
    expect(data.departments).toHaveLength(5);
    expect(data.road_segments).toHaveLength(12);
    expect(data.projects.length).toBeGreaterThanOrEqual(35);
    expect(data.citizen_reports.length).toBeGreaterThanOrEqual(15);
  });

  it("uses only fictional road names", () => {
    // Guards against a real street name sneaking in and being read as real data.
    const banned = ["Anna Salai", "MG Road", "GST Road", "Mount Road"];
    for (const seg of data.road_segments) {
      expect(banned.some((b) => seg.name.includes(b))).toBe(false);
    }
  });

  it("keeps every segment geometry a non-empty LineString near Chennai", () => {
    for (const seg of data.road_segments) {
      expect(seg.geometry.type).toBe("LineString");
      expect(seg.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      for (const [lng, lat] of seg.geometry.coordinates) {
        expect(lng).toBeGreaterThan(80.0);
        expect(lng).toBeLessThan(80.5);
        expect(lat).toBeGreaterThan(12.9);
        expect(lat).toBeLessThan(13.3);
      }
    }
  });

  it("resolves every project date to a well-formed ISO date", () => {
    for (const p of data.projects) {
      for (const d of [p.planned_start, p.planned_end, p.actual_start, p.actual_end]) {
        if (d === null) continue;
        expect(resolveSeedDate(d, TODAY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("never produces an inverted planned window", () => {
    for (const p of data.projects) {
      const start = resolveSeedDateOptional(p.planned_start, TODAY);
      const end = resolveSeedDateOptional(p.planned_end, TODAY);
      if (start && end) expect(end >= start).toBe(true);
    }
  });

  it("never produces an inverted actual window", () => {
    for (const p of data.projects) {
      const start = resolveSeedDateOptional(p.actual_start, TODAY);
      const end = resolveSeedDateOptional(p.actual_end, TODAY);
      if (start && end) expect(end >= start).toBe(true);
    }
  });

  it("satisfies every project against the shared Zod schema", () => {
    for (const p of data.projects) {
      const resolved = {
        ...p,
        planned_start: resolveSeedDateOptional(p.planned_start, TODAY),
        planned_end: resolveSeedDateOptional(p.planned_end, TODAY),
        actual_start: resolveSeedDateOptional(p.actual_start, TODAY),
        actual_end: resolveSeedDateOptional(p.actual_end, TODAY),
      };
      expect(() => projectInputSchema.parse(resolved)).not.toThrow();
    }
  });

  it("points every foreign key at a row that exists", () => {
    for (const p of data.projects) {
      expect(DEPARTMENTS.has(p.department_id)).toBe(true);
      expect(SEGMENTS.has(p.road_segment_id)).toBe(true);
    }
    for (const u of data.project_updates) {
      expect(PROJECT_IDS.has(u.project_id)).toBe(true);
    }
    for (const v of data.verifications) {
      expect(PROJECT_IDS.has(v.project_id)).toBe(true);
    }
    for (const r of data.citizen_reports) {
      if (r.project_id) expect(PROJECT_IDS.has(r.project_id)).toBe(true);
    }
  });

  it("keeps unlisted reports free of a project link", () => {
    const unlisted = data.citizen_reports.filter((r) => r.is_unlisted_work);
    expect(unlisted.length).toBeGreaterThanOrEqual(1);
    for (const r of unlisted) expect(r.project_id).toBeNull();
  });

  it("validates every report against the shared schema", () => {
    for (const r of data.citizen_reports) {
      expect(() =>
        citizenReportInputSchema.parse({
          project_id: r.project_id ?? null,
          report_type: r.report_type,
          description: r.description,
          photo_url: r.photo_url ?? null,
          lat: r.lat,
          lng: r.lng,
          is_unlisted_work: r.is_unlisted_work,
        }),
      ).not.toThrow();
    }
  });
});

describe("planted demo scenarios", () => {
  const segByName = (needle: string) =>
    data.road_segments.find((s) => s.name.includes(needle))!;
  const onSegment = (name: string) =>
    data.projects.filter((p) => p.road_segment_id === segByName(name).id);

  it("(a) has two concurrent works by different departments on one segment", () => {
    const running = onSegment("Vasanth Nagar").filter(
      (p) => p.status === "in_progress",
    );
    expect(running.length).toBeGreaterThanOrEqual(2);
    expect(new Set(running.map((p) => p.department_id)).size).toBeGreaterThanOrEqual(2);

    const [a, b] = running;
    const aStart = resolveSeedDate(a.planned_start!, TODAY);
    const bStart = resolveSeedDate(b.planned_start!, TODAY);
    const aEnd = resolveSeedDate(a.planned_end!, TODAY);
    const bEnd = resolveSeedDate(b.planned_end!, TODAY);
    // Overlap: each starts before the other ends.
    expect(aStart < bEnd).toBe(true);
    expect(bStart < aEnd).toBe(true);
  });

  it("(b) has a repeat dig 60-90 days after a road was resurfaced", () => {
    const seg = segByName("Kaveri Cross");
    const completed = data.projects.find(
      (p) =>
        p.road_segment_id === seg.id &&
        p.project_type === "road" &&
        p.status === "completed",
    )!;
    const nextDig = data.projects.find(
      (p) =>
        p.road_segment_id === seg.id &&
        p.id !== completed.id &&
        p.status === "planned",
    )!;

    const restored = new Date(`${resolveSeedDate(completed.actual_end!, TODAY)}T00:00:00Z`);
    const starts = new Date(`${resolveSeedDate(nextDig.planned_start!, TODAY)}T00:00:00Z`);
    const gapDays = Math.round((starts.getTime() - restored.getTime()) / 86_400_000);
    expect(gapDays).toBeGreaterThanOrEqual(60);
    expect(gapDays).toBeLessThanOrEqual(90);
  });

  it("(c) has a project 3x over its planned end with 2-3 delay reasons", () => {
    const seg = segByName("Thendral Main");
    const delayed = data.projects.find(
      (p) => p.road_segment_id === seg.id && p.status === "stalled",
    )!;
    const delays = data.project_updates.filter(
      (u) => u.project_id === delayed.id && u.delay_reason,
    );
    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays.length).toBeLessThanOrEqual(3);

    const asDate = (d: SeedDate) =>
      new Date(`${resolveSeedDate(d, TODAY)}T00:00:00Z`);
    const plannedDays =
      (asDate(delayed.planned_end!).getTime() -
        asDate(delayed.planned_start!).getTime()) /
      86_400_000;
    // Still stalled with no actual_end, so elapsed runs from start to today.
    const elapsedDays = (TODAY.getTime() - asDate(delayed.planned_start!).getTime()) / 86_400_000;

    expect(elapsedDays).toBeGreaterThan(plannedDays * 3);
  });

  it("(d) has a completed project with exactly 4 disputes", () => {
    const seg = segByName("Amber Garden");
    const disputed = data.projects.find(
      (p) =>
        p.road_segment_id === seg.id &&
        p.project_type === "road" &&
        p.status === "completed",
    )!;
    const votes = data.verifications.filter((v) => v.project_id === disputed.id);
    expect(votes.filter((v) => v.vote === "dispute")).toHaveLength(4);
    expect(votes.filter((v) => v.vote === "confirm").length).toBeGreaterThanOrEqual(0);
  });

  it("(e) has an unlisted report with no matching project", () => {
    const unlisted = data.citizen_reports.filter((r) => r.is_unlisted_work);
    expect(unlisted).toHaveLength(1);
    expect(unlisted[0].project_id).toBeNull();
    expect(unlisted[0].report_type).toBe("unlisted_digging");
  });

  it("(f) FLAGSHIP: water completed ~70 days ago, power cable starting in ~3 weeks", () => {
    const seg = segByName("Amber Garden");
    const water = data.projects.find(
      (p) => p.road_segment_id === seg.id && p.project_type === "water_pipeline",
    )!;
    const power = data.projects.find(
      (p) => p.road_segment_id === seg.id && p.project_type === "power_cable",
    )!;

    expect(water.status).toBe("completed");
    expect(power.status).toBe("planned");

    const restored = new Date(`${resolveSeedDate(water.actual_end!, TODAY)}T00:00:00Z`);
    const starts = new Date(`${resolveSeedDate(power.planned_start!, TODAY)}T00:00:00Z`);

    const sinceRestore = Math.round(
      (TODAY.getTime() - restored.getTime()) / 86_400_000,
    );
    const untilStart = Math.round(
      (starts.getTime() - TODAY.getTime()) / 86_400_000,
    );

    expect(sinceRestore).toBeGreaterThanOrEqual(60);
    expect(sinceRestore).toBeLessThanOrEqual(80);
    expect(untilStart).toBeGreaterThanOrEqual(14);
    expect(untilStart).toBeLessThanOrEqual(28);
  });
});
