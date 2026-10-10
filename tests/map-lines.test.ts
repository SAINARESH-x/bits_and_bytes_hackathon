import { describe, expect, it } from "vitest";
import { PARALLEL_SPACING_M, buildProjectLines } from "@/lib/map-lines";
import type { Department, Project, RoadSegment } from "@/lib/types";

const dept: Department = {
  id: "d1",
  name: "Water Works Department",
  code: "WATER",
  is_simulated: true,
};

/** A straight east–west road, so a perpendicular offset is purely latitudinal. */
const segment: RoadSegment = {
  id: "s1",
  name: "Amber Garden Main Road",
  ward: "Ward 1",
  geometry: {
    type: "LineString",
    coordinates: [
      [80.23, 13.06],
      [80.24, 13.06],
    ],
  },
  is_simulated: true,
};

function project(overrides: Partial<Project>): Project {
  return {
    id: "p",
    title: "Project",
    purpose: "Purpose",
    project_type: "water_pipeline",
    department_id: "d1",
    contractor_name: "Ashwin & Co",
    road_segment_id: "s1",
    planned_start: "2026-01-01",
    planned_end: "2026-02-01",
    actual_start: null,
    actual_end: null,
    status: "planned",
    budget_inr: 1,
    is_simulated: true,
    ...overrides,
  };
}

const p1 = project({ id: "p1", title: "Alpha", planned_start: "2026-01-01" });
const p2 = project({ id: "p2", title: "Bravo", planned_start: "2026-02-01" });
const p3 = project({ id: "p3", title: "Charlie", planned_start: "2026-03-01" });

const all = [p1, p2, p3];
const segments = [segment];
const departments = [dept];

describe("buildProjectLines", () => {
  it("produces one line per project, resolved against segment and department", () => {
    const lines = buildProjectLines(all, all, segments, departments);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.segment.id === "s1")).toBe(true);
    expect(lines[0].department?.name).toBe("Water Works Department");
    expect(lines[0].style).toBeDefined();
  });

  it("returns Leaflet-ordered [lat, lng] pairs", () => {
    // Single project, single slot: no offset, so only the axis swap shows.
    const [line] = buildProjectLines([p1], [p1], segments, departments);
    // GeoJSON stores [lng, lat] = [80.23, 13.06]; Leaflet wants the reverse.
    expect(line.positions[0][0]).toBeCloseTo(13.06, 6);
    expect(line.positions[0][1]).toBeCloseTo(80.23, 6);
  });

  it("offsets concurrent works on one road so they do not overlap", () => {
    const lines = buildProjectLines(all, all, segments, departments);
    const firstLat = lines.map((l) => l.positions[0][0]);
    expect(new Set(firstLat).size).toBe(3);

    // Spaced symmetrically about the centre line, one spacing apart.
    const ordered = [...firstLat].sort((a, b) => a - b);
    const gapMeters = (ordered[1] - ordered[0]) * 111_320;
    expect(gapMeters).toBeCloseTo(PARALLEL_SPACING_M, 0);
    expect(ordered[0] + ordered[2]).toBeCloseTo(2 * 13.06, 6);
  });

  it("leaves a lone project on the centre line", () => {
    const [line] = buildProjectLines([p1], [p1], segments, departments);
    expect(line.positions[0][0]).toBeCloseTo(13.06, 9);
    expect(line.positions[1][1]).toBeCloseTo(80.24, 9);
  });

  it("keeps a project's offset stable when filters hide its neighbours", () => {
    const full = buildProjectLines(all, all, segments, departments);
    const alone = buildProjectLines([p3], all, segments, departments);

    const fromFull = full.find((l) => l.project.id === "p3")!;
    const fromAlone = alone.find((l) => l.project.id === "p3")!;

    // `allProjects` is what decides the slot, so filtering must not move it.
    expect(fromAlone.positions).toEqual(fromFull.positions);
  });

  it("does NOT keep that offset if the whole registry itself shrinks", () => {
    // Documents the other half of the contract: the offset follows the
    // registry, not the filter. With p2 removed entirely, p3 moves up a slot.
    const withHole = buildProjectLines([p1, p3], [p1, p3], segments, departments);
    const p3Line = withHole.find((l) => l.project.id === "p3")!;
    const inFull = buildProjectLines(all, all, segments, departments).find(
      (l) => l.project.id === "p3",
    )!;
    expect(p3Line.positions).not.toEqual(inFull.positions);
  });

  it("skips projects whose road segment is unknown", () => {
    const orphan = project({ id: "px", road_segment_id: "missing" });
    const lines = buildProjectLines([orphan, p1], all, segments, departments);
    expect(lines).toHaveLength(1);
    expect(lines[0].project.id).toBe("p1");
  });

  it("returns nothing when there is nothing to draw", () => {
    expect(buildProjectLines([], all, segments, departments)).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const before = all.map((p) => p.id);
    buildProjectLines(all, all, segments, departments);
    expect(all.map((p) => p.id)).toEqual(before);
  });

  it("paints each status with its own style", () => {
    const lines = buildProjectLines(
      [
        project({ id: "a", status: "planned" }),
        project({ id: "b", status: "completed" }),
      ],
      all,
      segments,
      departments,
    );
    expect(lines[0].style.color).not.toBe(lines[1].style.color);
    expect(lines[0].style.dashArray).not.toBe(lines[1].style.dashArray);
    expect(lines[0].style.symbol).not.toBe(lines[1].style.symbol);
  });
});
