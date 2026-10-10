/**
 * Pure Geo helpers for drawing the registry map.
 *
 * Kept free of Leaflet on purpose: `offsetLineString` decides where a line is
 * drawn, and geometry that silently drifts is exactly the kind of bug that is
 * invisible until someone is looking at a map. It is unit-tested instead.
 *
 * Coordinates are GeoJSON order: [lng, lat].
 */

export type LngLat = [number, number];

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLng(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Shift a line sideways by `meters` (positive = left of travel direction).
 *
 * Several departments can be working on the same road segment at once. Drawn
 * at their natural position every project's polyline lands exactly on top of
 * its neighbours and all but the top one becomes unclickable — so the "two
 * departments digging the same road" story, which is the entire point of this
 * product, would render as a single line. Offsetting each project a few metres
 * apart turns them into parallel strokes, which reads the same way as a
 * coincidence on a real map and makes the clash visible.
 *
 * The offset follows each point's local tangent so the line keeps its shape
 * (including corners) rather than translating rigidly.
 */
export function offsetLineString(
  coords: readonly LngLat[],
  meters: number,
): LngLat[] {
  if (coords.length === 0) return [];
  if (coords.length === 1 || meters === 0) return coords.map((c) => [c[0], c[1]]);

  return coords.map((point, i) => {
    const [lng, lat] = point;

    // Tangent from the neighbouring vertices; ends use their only neighbour so
    // the first and last points don't fall out of line with the rest.
    const prev = i === 0 ? coords[0] : coords[i - 1];
    const next = i === coords.length - 1 ? coords[coords.length - 1] : coords[i + 1];
    const midLat = (prev[1] + next[1]) / 2;
    const perDegLng = metersPerDegLng(midLat);

    const tx = (next[0] - prev[0]) * perDegLng;
    const ty = (next[1] - prev[1]) * METERS_PER_DEG_LAT;
    const length = Math.hypot(tx, ty);
    if (length === 0) return [lng, lat]; // duplicate vertex: nowhere to be normal to

    // Perpendicular of the tangent, rotated 90° counter-clockwise.
    const nx = -ty / length;
    const ny = tx / length;

    return [
      lng + (nx * meters) / perDegLng,
      lat + (ny * meters) / METERS_PER_DEG_LAT,
    ];
  });
}

/** Midpoint of a line — used as the fallback centre when nothing is in view. */
export function lineMidpoint(coords: readonly LngLat[]): LngLat {
  if (coords.length === 0) return [80.2376, 13.0674];
  const total = coords.length;
  const lng = coords.reduce((sum, c) => sum + c[0], 0) / total;
  const lat = coords.reduce((sum, c) => sum + c[1], 0) / total;
  return [lng, lat];
}
