import { describe, expect, it } from "vitest";
import {
  CONTEST_DISPUTE_MIN,
  CONTEST_DISPUTE_RATIO,
  isContested,
  tally,
  verificationsContested,
} from "@/lib/contested";
import type { Verification } from "@/lib/types";

/**
 * The contested rule is a product decision with two independent thresholds, so
 * both edges are pinned here: the minimum-dispute floor AND the ratio.
 */

function votes(confirm: number, dispute: number): Verification[] {
  const make = (vote: "confirm" | "dispute", i: number): Verification => ({
    id: `v-${vote}-${i}`,
    project_id: "p",
    vote,
    device_id: `d-${vote}-${i}`,
    is_simulated: true,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  return [
    ...Array.from({ length: confirm }, (_, i) => make("confirm", i)),
    ...Array.from({ length: dispute }, (_, i) => make("dispute", i)),
  ];
}

describe("tally", () => {
  it("counts confirm, dispute and total", () => {
    expect(tally(votes(5, 2))).toEqual({ confirm: 5, dispute: 2, total: 7 });
  });

  it("is all zeroes for an empty list", () => {
    expect(tally([])).toEqual({ confirm: 0, dispute: 0, total: 0 });
  });
});

describe("isContested", () => {
  it("never contests an empty tally", () => {
    expect(isContested({ confirm: 0, dispute: 0, total: 0 })).toBe(false);
  });

  it("contests once disputes reach the minimum, even with many confirms", () => {
    expect(
      isContested({ confirm: 97, dispute: CONTEST_DISPUTE_MIN, total: 100 }),
    ).toBe(true);
  });

  it("does not contest below the minimum when the ratio is also low", () => {
    // 2 disputes out of 20 = 10% and under the 3-dispute floor.
    expect(isContested({ confirm: 18, dispute: 2, total: 20 })).toBe(false);
  });

  it("contests on the ratio even with fewer than the minimum disputes", () => {
    // 2 disputes out of 4 = 50% >= 40%, though under the 3-dispute floor.
    expect(isContested({ confirm: 2, dispute: 2, total: 4 })).toBe(true);
  });

  it("does not contest exactly one dispute in a large tally", () => {
    expect(isContested({ confirm: 99, dispute: 1, total: 100 })).toBe(false);
  });

  it("treats exactly the ratio as contested (>=)", () => {
    // 40% of 5 is 2 disputes — but the floor is 3, so this is not contested.
    // Use 10 votes: 4 disputes = exactly 40%.
    expect(
      isContested({
        confirm: 6,
        dispute: Math.round(CONTEST_DISPUTE_RATIO * 10),
        total: 10,
      }),
    ).toBe(true);
  });
});

describe("verificationsContested", () => {
  it("wraps tally + isContested over raw rows", () => {
    expect(verificationsContested(votes(1, 3))).toBe(true);
    expect(verificationsContested(votes(5, 0))).toBe(false);
  });
});
