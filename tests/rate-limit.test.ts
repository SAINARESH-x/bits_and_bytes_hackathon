import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

/**
 * The limiter is a sliding window: hits leave the bucket once they age out.
 * The clock is injectable, so these run instantly and deterministically.
 */

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows up to the limit then blocks", () => {
    const limit = 3;
    const windowMs = 60_000;
    const now = 1_000_000;

    expect(checkRateLimit("k", limit, windowMs, now).allowed).toBe(true);
    expect(checkRateLimit("k", limit, windowMs, now).allowed).toBe(true);
    const third = checkRateLimit("k", limit, windowMs, now);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = checkRateLimit("k", limit, windowMs, now);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    const now = 1_000_000;
    for (let i = 0; i < 2; i += 1) checkRateLimit("a", 2, 60_000, now);
    expect(checkRateLimit("a", 2, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit("b", 2, 60_000, now).allowed).toBe(true);
  });

  it("frees capacity once hits age out of the window", () => {
    const windowMs = 1_000;
    checkRateLimit("k", 1, windowMs, 0);
    expect(checkRateLimit("k", 1, windowMs, 500).allowed).toBe(false);
    // After the window has elapsed the old hit is gone.
    expect(checkRateLimit("k", 1, windowMs, 1_001).allowed).toBe(true);
  });

  it("does not extend the lockout when a blocked call keeps hammering", () => {
    const windowMs = 1_000;
    checkRateLimit("k", 1, windowMs, 0);
    // Blocked calls at t=100..900 must not push the release time out.
    for (let t = 100; t < 1_000; t += 100) {
      expect(checkRateLimit("k", 1, windowMs, t).allowed).toBe(false);
    }
    expect(checkRateLimit("k", 1, windowMs, 1_001).allowed).toBe(true);
  });

  it("reports retryAfterSeconds relative to the oldest hit", () => {
    const windowMs = 10_000;
    checkRateLimit("k", 1, windowMs, 1_000);
    const blocked = checkRateLimit("k", 1, windowMs, 3_000);
    expect(blocked.allowed).toBe(false);
    // Oldest hit was at 1000; window ends at 11_000; from 3_000 that is 8s.
    expect(blocked.retryAfterSeconds).toBe(8);
  });

  it("remaining counts down", () => {
    resetRateLimits();
    const first = checkRateLimit("k", 5, 60_000, 0);
    expect(first.remaining).toBe(4);
    const second = checkRateLimit("k", 5, 60_000, 0);
    expect(second.remaining).toBe(3);
  });
});
