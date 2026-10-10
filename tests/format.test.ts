import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDaysISO,
  daysFromToday,
  todayISO,
  todayUTCISO,
} from "@/lib/format";

/**
 * Every "today" in the app must be ONE anchor. The engine, the seed resolver
 * and the store all work in UTC midnights, so the UI's date helpers have to as
 * well — otherwise the Upcoming panel, the console's "past its planned end"
 * rule and the clash board could disagree about the same day near midnight in
 * a UTC+5:30 deployment. These tests pin the clock so the assertions cannot
 * drift with the calendar or the machine's timezone.
 */
describe("date anchors are UTC-consistent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T22:30:00+05:30")); // 17:00 UTC
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the same day through the local-calendar reader and the UTC reader", () => {
    // 10 Oct 10:00 PM IST = 10 Oct 5:00 PM UTC — a day where both calendars
    // agree. The real risk is a local day that differs from the UTC day; the
    // fix is that todayISO IS the UTC day, so this can never disagree.
    expect(todayISO()).toBe("2026-10-10");
    expect(todayUTCISO()).toBe("2026-10-10");
    expect(todayISO()).toBe(todayUTCISO());
  });

  it("is still one today when the local day would differ from the UTC day", () => {
    // 10 Oct 2:00 AM IST = 9 Oct 8:30 PM UTC: local says the 10th, UTC says
    // the 9th. Before the UTC anchor, todayISO() (local calendar) returned
    // 10 Oct while todayUTCISO() returned 9 Oct — a split calendar. Now both
    // helpers follow the UTC day and can never disagree.
    vi.setSystemTime(new Date("2026-10-10T02:00:00+05:30"));
    const utcDay = "2026-10-09";
    expect(new Date("2026-10-10T02:00:00+05:30").toISOString().slice(0, 10)).toBe(utcDay);
    expect(todayISO()).toBe(utcDay);
    expect(todayISO()).toBe(todayUTCISO());
  });

  it("treats todayISO as day zero on the daysFromToday clock", () => {
    expect(daysFromToday(todayISO())).toBe(0);
    expect(daysFromToday("2026-10-11")).toBe(1);
    expect(daysFromToday("2026-10-05")).toBe(-5);
  });

  it("adds whole days in the UTC calendar without timezone drift", () => {
    expect(addDaysISO(3)).toBe("2026-10-13");
    expect(addDaysISO(-2)).toBe("2026-10-08");
    // Across a month boundary: 30 Oct + 5 = 4 Nov.
    vi.setSystemTime(new Date("2026-10-30T18:00:00+05:30"));
    expect(addDaysISO(5)).toBe("2026-11-04");
  });
});