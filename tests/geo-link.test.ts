import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  AUTO_LINK_RADIUS_M,
  findNearbyActiveProjects,
  nearestActiveProject,
} from "@/lib/geo-link";
import type { Project, ProjectStatus, RoadSegment } from "@/lib/types";

/**
 * The auto-link rule decides whether a report is tied to a registry project or
 * flagged as unlisted work, so the 100 m boundary is pinned tightly.
 *
 * A short north-south road through central Chennai is used; ~1 degree of
 * latitude is ~111 km, so 0.0009 deg is ~100 m.
 */

function segment(id: string, coords: [number, number][]): RoadSegment {
  return {
    id,
    name: `Road ${id}`,
    ward: "Ward 1",
    geometry: { type: "LineString", coordinates: coords },
    is_simulated: true,
  };
}

function project(
  id: string,
  roadSegmentId: string,
  status: ProjectStatus = "in_progress",
): Project {
  return {
    id,
    title: `Project ${id}`,
    purpose: "Test",
    project_type: "road",
    department_id: "dept",
    contractor_name: null,
    road_segment_id: roadSegmentId,
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    status,
    budget_inr: null,
    is_simulated: true,
  };
}

// A road running north from (lng 80.24, lat 13.06) to (80.24, 13.07).
const ROAD = segment("road-1", [
  [80.24, 13.06],
  [80.24, 13.07],
]);

describe("findNearbyActiveProjects", () => {
  it("links a point on the road", () => {
    const projects = [project("p1", ROAD.id)];
    const matches = findNearbyActiveProjects([80.24, 13.065], projects, [ROAD]);
    expect(matches).toHaveLength(1);
    expect(matches[0].project.id).toBe("p1");
    expect(matches[0].distanceMeters).toBeLessThanOrEqual(AUTO_LINK_RADIUS_M);
  });

  it("does not link a point well beyond the radius", () => {
    const projects = [project("p1", ROAD.id)];
    // ~0.005 deg east of the road is roughly 540 m — far outside 100 m.
    const matches = findNearbyActiveProjects([80.245, 13.065], projects, [ROAD]);
    expect(matches).toHaveLength(0);
  });

  it("ignores completed and cancelled works", () => {
    const projects = [
      project("done", ROAD.id, "completed"),
      project("gone", ROAD.id, "cancelled"),
    ];
    expect(findNearbyActiveProjects([80.24, 13.065], projects, [ROAD])).toHaveLength(0);
  });

  it("includes planned, in_progress and stalled works", () => {
    const projects = [
      project("planned", ROAD.id, "planned"),
      project("running", ROAD.id, "in_progress"),
      project("stalled", ROAD.id, "stalled"),
    ];
    const ids = findNearbyActiveProjects([80.24, 13.065], projects, [ROAD])
      .map((m) => m.project.id)
      .sort();
    expect(ids).toEqual(["planned", "running", "stalled"]);
    expect(ACTIVE_STATUSES).toContain("planned");
  });

  it("sorts matches nearest-first", () => {
    const near = segment("road-near", [
      [80.2400, 13.06],
      [80.2400, 13.07],
    ]);
    const far = segment("road-far", [
      [80.2440, 13.06],
      [80.2440, 13.07],
    ]);
    const projects = [project("far", far.id), project("near", near.id)];
    const matches = findNearbyActiveProjects(
      [80.2410, 13.065],
      projects,
      [near, far],
      500,
    );
    expect(matches.map((m) => m.project.id)).toEqual(["near", "far"]);
  });

  it("ignores a project whose segment is missing", () => {
    const projects = [project("orphan", "no-such-road")];
    expect(findNearbyActiveProjects([80.24, 13.065], projects, [ROAD])).toHaveLength(0);
  });

  it("handles a single-vertex segment as a point", () => {
    const dot = segment("dot", [[80.24, 13.065]]);
    const projects = [project("p1", dot.id)];
    expect(findNearbyActiveProjects([80.24, 13.065], projects, [dot])).toHaveLength(1);
  });
});

describe("nearestActiveProject", () => {
  it("returns the closest active project or null", () => {
    const projects = [project("p1", ROAD.id)];
    expect(nearestActiveProject([80.24, 13.065], projects, [ROAD])?.project.id).toBe(
      "p1",
    );
    expect(nearestActiveProject([80.30, 13.30], projects, [ROAD])).toBeNull();
  });
});
