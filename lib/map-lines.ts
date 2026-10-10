import { STATUS_MAP_STYLE, type MapLineStyle } from "@/lib/format";
import { offsetLineString, type LngLat } from "@/lib/geometry";
import type { Department, Project, RoadSegment } from "@/lib/types";

/**
 * Turns registry rows into the geometry the map draws.
 *
 * Deliberately free of Leaflet: grouping and offsetting are pure arithmetic
 * and belong where they can be unit-tested. The Leaflet half lives behind an
 * `ssr: false` boundary and only ever receives these ready-made positions —
 * importing `leaflet` anywhere on the server is what crashes `next build`
 * and `next start` with "window is not defined".
 */

/** Metres between two projects working on the same segment. */
export const PARALLEL_SPACING_M = 5;

export interface ProjectLine {
  project: Project;
  segment: RoadSegment;
  department: Department | undefined;
  /** `[lat, lng]` pairs — Leaflet's order, parallel offset already applied. */
  positions: [number, number][];
  style: MapLineStyle;
  /** Clashes this project is involved in. 0 when the caller passes no board. */
  clashCount: number;
}

/**
 * Middle of a drawn line, in Leaflet's `[lat, lng]` order. Used to place the
 * clash badge on the road it belongs to rather than at an arbitrary vertex.
 */
export function lineMidPosition(
  positions: readonly [number, number][],
): [number, number] {
  if (positions.length === 0) return [0, 0];
  if (positions.length === 1) return positions[0];
  if (positions.length % 2 === 1) return positions[Math.floor(positions.length / 2)];
  const a = positions[positions.length / 2 - 1];
  const b = positions[positions.length / 2];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Build one polyline per project in `projects`.
 *
 * `allProjects` is the whole registry, not the filtered subset: the parallel
 * offset is derived from a project's slot in the full group so a line keeps
 * its position on the road when filters change. Offsetting against the
 * filtered list instead would make every line jump sideways on each keystroke
 * in the search box.
 */
export function buildProjectLines(
  projects: readonly Project[],
  allProjects: readonly Project[],
  segments: readonly RoadSegment[],
  departments: readonly Department[],
  /** Clash counts per project id, from `countClashesByProject`. */
  clashCountByProject?: ReadonlyMap<string, number>,
): ProjectLine[] {
  const segmentById = new Map(segments.map((s) => [s.id, s]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  // Group every project by the road it sits on, in a stable order.
  const groups = new Map<string, Project[]>();
  for (const project of allProjects) {
    const group = groups.get(project.road_segment_id);
    if (group) group.push(project);
    else groups.set(project.road_segment_id, [project]);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        (a.planned_start ?? "9999-99-99").localeCompare(
          b.planned_start ?? "9999-99-99",
        ) || a.title.localeCompare(b.title, "en"),
    );
  }

  const result: ProjectLine[] = [];
  for (const project of projects) {
    const segment = segmentById.get(project.road_segment_id);
    if (!segment) continue;

    const group = groups.get(project.road_segment_id) ?? [project];
    const index = Math.max(0, group.indexOf(project));
    const offset =
      group.length <= 1 ? 0 : (index - (group.length - 1) / 2) * PARALLEL_SPACING_M;

    const geo = segment.geometry.coordinates as unknown as LngLat[];
    const positions = offsetLineString(geo, offset).map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );

    result.push({
      project,
      segment,
      department: departmentById.get(project.department_id),
      positions,
      style: STATUS_MAP_STYLE[project.status],
      clashCount: clashCountByProject?.get(project.id) ?? 0,
    });
  }
  return result;
}
