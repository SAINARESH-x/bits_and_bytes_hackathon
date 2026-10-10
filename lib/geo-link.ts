import { pointToSegmentMeters, type LngLat } from "@/lib/clash/geo";
import type { Project, ProjectStatus, RoadSegment } from "@/lib/types";

/**
 * Auto-linking a citizen report to a registry project (PLAN.md M6 item 3).
 *
 * When someone reports an issue at a location, we look for an ACTIVE project
 * whose road segment passes within `AUTO_LINK_RADIUS_M` of the point. A match
 * means "this is probably the work you are standing next to" and the report is
 * linked to it; no match means the report describes work nobody announced, so
 * it is flagged `is_unlisted_work`.
 *
 * Pure and free of DB/UI imports — it takes plain rows and returns distances —
 * so the same maths backs both the live suggestion in the browser and the
 * server's decision, and the two can never disagree.
 */

/** Within 100 m of a project's segment links the report to that project. */
export const AUTO_LINK_RADIUS_M = 100;

/**
 * A little slack on top of the radius, applied only when a client *chooses* a
 * project from the suggestion list: floating-point rounding in the browser
 * could otherwise reject a project the server itself just offered at 99.9 m.
 */
export const EXPLICIT_LINK_TOLERANCE_M = 120;

/**
 * A project still moving earth (or about to). `completed` and `cancelled`
 * works are excluded: you cannot report a live hazard on a job that is over or
 * abandoned, and a completed job is handled by the confirm/dispute flow.
 */
export const ACTIVE_STATUSES: readonly ProjectStatus[] = [
  "planned",
  "in_progress",
  "stalled",
];

export interface NearbyProject {
  project: Project;
  segment: RoadSegment;
  /** Closest approach of the point to the segment, in whole metres. */
  distanceMeters: number;
}

/** Shortest distance from a point to a polyline, in metres. */
function distanceToSegment(point: LngLat, segment: RoadSegment): number {
  const coords = segment.geometry.coordinates as unknown as LngLat[];
  if (coords.length === 0) return Number.POSITIVE_INFINITY;
  if (coords.length === 1) {
    // A one-vertex "segment" is a point; measure point-to-point.
    return pointToSegmentMeters(point, coords[0], coords[0]);
  }

  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const d = pointToSegmentMeters(point, coords[i], coords[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Active projects whose road comes within `radiusMeters` of `point`, nearest
 * first. Ties break on project title so the order is stable across renders.
 */
export function findNearbyActiveProjects(
  point: LngLat,
  projects: readonly Project[],
  segments: readonly RoadSegment[],
  radiusMeters: number = AUTO_LINK_RADIUS_M,
): NearbyProject[] {
  const segmentById = new Map(segments.map((s) => [s.id, s]));
  const matches: NearbyProject[] = [];

  for (const project of projects) {
    if (!ACTIVE_STATUSES.includes(project.status)) continue;
    const segment = segmentById.get(project.road_segment_id);
    if (!segment) continue;

    const metres = distanceToSegment(point, segment);
    if (metres <= radiusMeters) {
      matches.push({
        project,
        segment,
        distanceMeters: Math.round(metres),
      });
    }
  }

  matches.sort(
    (a, b) =>
      a.distanceMeters - b.distanceMeters ||
      a.project.title.localeCompare(b.project.title, "en"),
  );
  return matches;
}

/** The single nearest active project, or null when nothing is in range. */
export function nearestActiveProject(
  point: LngLat,
  projects: readonly Project[],
  segments: readonly RoadSegment[],
  radiusMeters: number = AUTO_LINK_RADIUS_M,
): NearbyProject | null {
  return findNearbyActiveProjects(point, projects, segments, radiusMeters)[0] ?? null;
}
