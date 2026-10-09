import { describe, expect, it } from "vitest";
import { resolveSeedDate, resolveSeedDateOptional } from "@/lib/seed-dates";

const FIXED = new Date("2026-10-10T12:00:00Z");

describe("resolveSeedDate", () => {
  it("passes an absolute date through untouched", () => {
    expect(resolveSeedDate("2026-01-05", FIXED)).toBe("2026-01-05");
  });

  it("treats 0 as today", () => {
    expect(resolveSeedDate(0, FIXED)).toBe("2026-10-10");
  });

  it("resolves negative offsets into the past", () => {
    expect(resolveSeedDate(-70, FIXED)).toBe("2026-08-01");
  });

  it("resolves positive offsets into the future", () => {
    expect(resolveSeedDate(21, FIXED)).toBe("2026-10-31");
  });

  it("crosses month and year boundaries correctly", () => {
    expect(resolveSeedDate(-300, FIXED)).toBe("2025-12-14");
    expect(resolveSeedDate(90, FIXED)).toBe("2027-01-08");
  });

  it("stays correct across a leap day", () => {
    const leapEve = new Date("2028-02-28T12:00:00Z");
    expect(resolveSeedDate(1, leapEve)).toBe("2028-02-29");
    expect(resolveSeedDate(2, leapEve)).toBe("2028-03-01");
  });

  it("does not drift with the server timezone", () => {
    // A late-evening local time in a positive-offset zone must not shift the
    // UTC date the seed resolves to.
    const lateEvening = new Date("2026-10-10T18:30:00+05:30");
    expect(resolveSeedDate(0, lateEvening)).toBe("2026-10-10");
    expect(resolveSeedDate(-1, lateEvening)).toBe("2026-10-09");
  });

  it("rejects a malformed absolute date", () => {
    expect(() => resolveSeedDate("05/01/2026", FIXED)).toThrow(/YYYY-MM-DD/);
  });

  it("rejects a non-integer offset", () => {
    expect(() => resolveSeedDate(1.5, FIXED)).toThrow(/integer/);
  });
});

describe("resolveSeedDateOptional", () => {
  it("keeps null as null", () => {
    expect(resolveSeedDateOptional(null, FIXED)).toBeNull();
  });

  it("keeps undefined as null", () => {
    expect(resolveSeedDateOptional(undefined, FIXED)).toBeNull();
  });

  it("resolves a present value", () => {
    expect(resolveSeedDateOptional(-30, FIXED)).toBe("2026-09-10");
  });
});
