import { describe, expect, it } from "vitest";
import { lineMidpoint, offsetLineString, type LngLat } from "@/lib/geometry";

const METERS_PER_DEG = 111_320;

function distanceMeters(a: LngLat, b: LngLat): number {
  // Planar approximation is fine at these scales (a few hundred metres).
  const meanLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * METERS_PER_DEG * Math.cos(meanLat);
  const dy = (b[1] - a[1]) * METERS_PER_DEG;
  return Math.hypot(dx, dy);
}

describe("offsetLineString", () => {
  it("returns an empty array for empty input", () => {
    expect(offsetLineString([], 10)).toEqual([]);
  });

  it("returns a zero offset untouched", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.24, 13.07],
    ];
    expect(offsetLineString(line, 0)).toEqual(line);
  });

  it("returns copies, never the caller's array", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.24, 13.07],
    ];
    const out = offsetLineString(line, 5);
    expect(out).not.toBe(line);
    expect(out[0]).not.toBe(line[0]);
  });

  it("shifts an east–west line north by roughly the requested distance", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.24, 13.06],
    ];
    const out = offsetLineString(line, 20);
    expect(out[0][1]).toBeGreaterThan(line[0][1]);
    expect(distanceMeters(line[0], out[0])).toBeCloseTo(20, 0);
    expect(distanceMeters(line[1], out[1])).toBeCloseTo(20, 0);
    // The line still runs east–west: no rotation, pure translation sideways.
    expect(out[1][0] - out[0][0]).toBeCloseTo(line[1][0] - line[0][0], 9);
  });

  it("shifts a north–south line west by roughly the requested distance", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.23, 13.07],
    ];
    const out = offsetLineString(line, 20);
    expect(out[0][0]).toBeLessThan(line[0][0]);
    expect(distanceMeters(line[0], out[0])).toBeCloseTo(20, 0);
    expect(out[1][1] - out[0][1]).toBeCloseTo(line[1][1] - line[0][1], 9);
  });

  it("reverses the side when the sign flips", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.24, 13.06],
    ];
    const north = offsetLineString(line, 12);
    const south = offsetLineString(line, -12);
    expect(north[0][1]).toBeGreaterThan(line[0][1]);
    expect(south[0][1]).toBeLessThan(line[0][1]);
    expect(north[0][1]).toBeCloseTo(2 * line[0][1] - south[0][1], 9);
  });

  it("keeps every offset point the same distance from its source", () => {
    const line: LngLat[] = [
      [80.22, 13.05],
      [80.235, 13.062],
      [80.25, 13.071],
    ];
    const out = offsetLineString(line, 8);
    expect(out).toHaveLength(3);
    out.forEach((pt, i) => {
      expect(distanceMeters(line[i], pt)).toBeCloseTo(8, 0);
    });
  });

  it("leaves a zero-tangent endpoint alone instead of dividing by zero", () => {
    // The guard matters where both tangent inputs coincide: a repeated first
    // vertex gives the head point nothing to be normal to.
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.23, 13.06],
      [80.24, 13.06],
    ];
    const out = offsetLineString(line, 15);
    expect(out).toHaveLength(3);
    expect(out.every((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))).toBe(true);
    expect(out[0]).toEqual(line[0]);
  });

  it("leaves a completely degenerate line untouched", () => {
    const line: LngLat[] = [
      [80.23, 13.06],
      [80.23, 13.06],
      [80.23, 13.06],
    ];
    expect(offsetLineString(line, 15)).toEqual(line);
  });

  it("offsets a single-point line by nothing", () => {
    const point: LngLat[] = [[80.23, 13.06]];
    expect(offsetLineString(point, 30)).toEqual(point);
  });

  it("follows the corner of an L-shaped line rather than translating it", () => {
    const corner: LngLat[] = [
      [80.23, 13.06],
      [80.23, 13.065],
      [80.24, 13.065],
    ];
    const out = offsetLineString(corner, 10);
    expect(out).toHaveLength(3);

    // Every vertex stays the requested distance off its source, including the
    // corner, whose tangent is the diagonal between its two neighbours.
    out.forEach((pt, i) => {
      expect(distanceMeters(corner[i], pt)).toBeCloseTo(10, 0);
    });

    // Start of the line has shifted west (perpendicular to its vertical leg).
    expect(out[0][0]).toBeLessThan(corner[0][0]);
    expect(out[0][1]).toBeCloseTo(corner[0][1], 9);
    // End of the line has shifted north (perpendicular to its horizontal leg).
    expect(out[2][1]).toBeGreaterThan(corner[2][1]);
    expect(out[2][0]).toBeCloseTo(corner[2][0], 9);

    // Not a rigid translation: the two legs get offset along different
    // perpendiculars, so relative vertex spacing must change.
    expect(out[1][1] - out[0][1]).not.toBeCloseTo(corner[1][1] - corner[0][1], 6);
  });
});

describe("lineMidpoint", () => {
  it("averages the vertices", () => {
    const mid = lineMidpoint([
      [80.2, 13.0],
      [80.4, 13.2],
    ]);
    expect(mid[0]).toBeCloseTo(80.3, 9);
    expect(mid[1]).toBeCloseTo(13.1, 9);
  });

  it("falls back to the city centre for empty geometry", () => {
    expect(lineMidpoint([])).toEqual([80.2376, 13.0674]);
  });
});
