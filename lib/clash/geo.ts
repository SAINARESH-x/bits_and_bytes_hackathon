/**
 * Pure geometry for the clash engine.
 *
 * DISCLOSURE: the distance maths here is written by hand — no turf, no GIS
 * library, no new dependency. Everything is deterministic and unit-tested.
 *
 * What is implemented and why:
 *
 *  - `haversineMeters` — exact great-circle distance for point-to-point.
 *  - `pointToSegmentMeters` — closest approach of a point to a line segment,
 *    computed in a local equirectangular frame anchored at the segment's
 *    first vertex. Over the ~50 m scales this engine cares about the frame
 *    error is far below a centimetre, and it keeps the maths readable. The
 *    final distance is a straight Euclidean length inside that metre frame.
 *  - Segment-to-segment distance — if the two segments intersect the answer is
 *    zero; otherwise the minimum is always attained at an endpoint of one
 *    segment (the distance function is convex over the segment-pair domain,
 *    so any interior minimum would imply an intersection). That gives an exact
 *    answer from four point-to-segment calls instead of an iterative solver.
 *
 * Coordinates are GeoJSON order: `[lng, lat]`.
 */

export type LngLat = [number, number];

export const EARTH_RADIUS_M = 6_371_008.8;
export const METERS_PER_DEG_LAT = 111_320;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Metres covered by one degree of longitude at a given latitude. */
export function metersPerDegLng(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos(toRad(lat));
}

/** Great-circle distance in metres. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance from `p` to the segment `a`–`b`, in metres, measured in the local
 * metre frame anchored at `a`.
 */
export function pointToSegmentMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = metersPerDegLng(a[1]);
  const ky = METERS_PER_DEG_LAT;

  // Segment vector and point vector, both in metres from `a`.
  const vx = (b[0] - a[0]) * kx;
  const vy = (b[1] - a[1]) * ky;
  const wx = (p[0] - a[0]) * kx;
  const wy = (p[1] - a[1]) * ky;

  const vv = vx * vx + vy * vy;
  // Degenerate segment (a === b): the "segment" is a point.
  const t = vv === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));

  return Math.hypot(wx - t * vx, wy - t * vy);
}

const orientation = (a: LngLat, b: LngLat, c: LngLat): number => {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
};

const onSegment = (a: LngLat, b: LngLat, c: LngLat): boolean =>
  Math.min(a[0], c[0]) <= b[0] &&
  b[0] <= Math.max(a[0], c[0]) &&
  Math.min(a[1], c[1]) <= b[1] &&
  b[1] <= Math.max(a[1], c[1]);

const isDegenerate = (a: LngLat, b: LngLat): boolean =>
  a[0] === b[0] && a[1] === b[1];

/**
 * True when the two segments touch or cross. Orientation is invariant under
 * the lng/lat scaling, so this works directly on degrees.
 */
export function segmentsIntersect(
  a1: LngLat,
  a2: LngLat,
  b1: LngLat,
  b2: LngLat,
): boolean {
  if (isDegenerate(a1, a2) || isDegenerate(b1, b2)) return false;

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;

  // Collinear touching cases.
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

/** Distance between two segments, exact, in metres. */
export function segmentPairDistanceMeters(
  a1: LngLat,
  a2: LngLat,
  b1: LngLat,
  b2: LngLat,
): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentMeters(a1, b1, b2),
    pointToSegmentMeters(a2, b1, b2),
    pointToSegmentMeters(b1, a1, a2),
    pointToSegmentMeters(b2, a1, a2),
  );
}

export interface Box {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function boundingBox(coords: readonly LngLat[]): Box | null {
  if (coords.length === 0) return null;
  let minLng = coords[0][0];
  let maxLng = coords[0][0];
  let minLat = coords[0][1];
  let maxLat = coords[0][1];
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * A lower bound on the distance between two boxes. Used to skip candidate
 * pairs that cannot possibly be close, which is what keeps the pair sweep
 * cheap on a dense dataset.
 */
export function boxGapMeters(a: Box, b: Box): number {
  const midLat = (a.minLat + a.maxLat + b.minLat + b.maxLat) / 4;
  const kx = metersPerDegLng(midLat);
  const ky = METERS_PER_DEG_LAT;

  const dxDeg = Math.max(0, a.minLng - b.maxLng, b.minLng - a.maxLng);
  const dyDeg = Math.max(0, a.minLat - b.maxLat, b.minLat - a.maxLat);
  return Math.hypot(dxDeg * kx, dyDeg * ky);
}

interface Segment {
  a: LngLat;
  b: LngLat;
  box: Box;
}

/** Tight bounding box of two points. */
function boxOf(a: LngLat, b: LngLat): Box {
  return {
    minLng: Math.min(a[0], b[0]),
    maxLng: Math.max(a[0], b[0]),
    minLat: Math.min(a[1], b[1]),
    maxLat: Math.max(a[1], b[1]),
  };
}

function toSegments(coords: readonly LngLat[]): Segment[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) {
    const point = coords[0];
    return [{ a: point, b: point, box: boxOf(point, point) }];
  }
  const out: Segment[] = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    out.push({ a, b, box: boxOf(a, b) });
  }
  return out;
}

/** Minimum distance between two polylines, in metres. */
export function lineStringDistanceMeters(
  a: readonly LngLat[],
  b: readonly LngLat[],
): number {
  if (a.length === 0 || b.length === 0) return Number.POSITIVE_INFINITY;
  if (a.length === 1 && b.length === 1) return haversineMeters(a[0], b[0]);

  const left = toSegments(a);
  const right = toSegments(b);
  let best = Number.POSITIVE_INFINITY;

  for (const sa of left) {
    for (const sb of right) {
      // Cheap rejection first — most pairs of road segments are nowhere near
      // each other, and this avoids four point-to-segment calls.
      if (boxGapMeters(sa.box, sb.box) >= best) continue;
      const d = segmentPairDistanceMeters(sa.a, sa.b, sb.a, sb.b);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

export interface PositionedSegment {
  id: string;
  coords: readonly LngLat[];
}

/**
 * Which segments lie within `meters` of which, by id.
 *
 * Complexity: segments are bucketed into a grid whose cells are one adjacency
 * radius across, so only segments sharing (or neighbouring) a cell are ever
 * compared. Without that, this would be O(n²) over *every* segment in the
 * city — including the thousands that carry no projects at all.
 *
 * The returned map always contains an entry for each input id (possibly
 * empty); a segment is never listed as its own neighbour.
 */
export function computeSegmentAdjacency(
  segments: readonly PositionedSegment[],
  meters: number,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const segment of segments) adjacency.set(segment.id, new Set());

  if (meters <= 0 || segments.length < 2) return adjacency;

  const boxes = segments.map((s) => boundingBox(s.coords));
  const usable: Array<{ index: number; box: Box }> = [];
  for (let i = 0; i < segments.length; i += 1) {
    const box = boxes[i];
    if (box && segments[i].coords.length > 0) usable.push({ index: i, box });
  }
  if (usable.length < 2) return adjacency;

  // One cell == one adjacency radius, so anything within `meters` shares a
  // cell with its neighbourhood once each box is padded by a cell.
  let latSum = 0;
  let count = 0;
  for (const { index } of usable) {
    for (const [, lat] of segments[index].coords) {
      latSum += lat;
      count += 1;
    }
  }
  const meanLat = count > 0 ? latSum / count : 0;

  const latStep = meters / METERS_PER_DEG_LAT;
  const lngStep = meters / Math.max(1e-6, metersPerDegLng(meanLat));

  const cells = new Map<string, number[]>();
  for (const { index, box } of usable) {
    const x0 = Math.floor((box.minLng - lngStep) / lngStep);
    const x1 = Math.floor((box.maxLng + lngStep) / lngStep);
    const y0 = Math.floor((box.minLat - latStep) / latStep);
    const y1 = Math.floor((box.maxLat + latStep) / latStep);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = `${x}:${y}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(index);
        else cells.set(key, [index]);
      }
    }
  }

  const candidates = new Set<string>();
  for (const bucket of cells.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const p = bucket[i];
        const q = bucket[j];
        candidates.add(p < q ? `${p}|${q}` : `${q}|${p}`);
      }
    }
  }

  for (const key of candidates) {
    const [i, j] = key.split("|").map(Number);
    const boxI = boxes[i];
    const boxJ = boxes[j];
    if (!boxI || !boxJ) continue;
    if (boxGapMeters(boxI, boxJ) > meters) continue;
    const distance = lineStringDistanceMeters(segments[i].coords, segments[j].coords);
    if (distance <= meters) {
      adjacency.get(segments[i].id)?.add(segments[j].id);
      adjacency.get(segments[j].id)?.add(segments[i].id);
    }
  }

  return adjacency;
}

/** Metres between two lng/lat points, in the local frame — for tests/tools. */
export function localMeters(a: LngLat, b: LngLat): number {
  const kx = metersPerDegLng((a[1] + b[1]) / 2);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * METERS_PER_DEG_LAT);
}

/** Shift a point by an east/north offset in metres — test helper. */
export function shiftMeters(point: LngLat, east: number, north: number): LngLat {
  const kx = metersPerDegLng(point[1]);
  return [point[0] + east / kx, point[1] + north / METERS_PER_DEG_LAT];
}
