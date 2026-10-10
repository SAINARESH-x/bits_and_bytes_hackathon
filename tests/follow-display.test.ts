import { describe, expect, it } from "vitest";
import { formatRelativeUpdate } from "@/lib/follow-display";

/**
 * Clock-injectable relative formatting for the followed-projects feed.
 */
describe("formatRelativeUpdate", () => {
  const now = new Date("2026-01-10T12:00:00.000Z");

  it("says 'just now' under a minute", () => {
    expect(formatRelativeUpdate("2026-01-10T11:59:30.000Z", now)).toBe("just now");
  });

  it("counts minutes", () => {
    expect(formatRelativeUpdate("2026-01-10T11:55:00.000Z", now)).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeUpdate("2026-01-10T11:59:00.000Z", now)).toBe(
      "1 minute ago",
    );
  });

  it("counts hours", () => {
    expect(formatRelativeUpdate("2026-01-10T09:00:00.000Z", now)).toBe(
      "3 hours ago",
    );
    expect(formatRelativeUpdate("2026-01-10T11:00:00.000Z", now)).toBe(
      "1 hour ago",
    );
  });

  it("counts days up to a week", () => {
    expect(formatRelativeUpdate("2026-01-08T12:00:00.000Z", now)).toBe(
      "2 days ago",
    );
    expect(formatRelativeUpdate("2026-01-09T12:00:00.000Z", now)).toBe(
      "1 day ago",
    );
  });

  it("falls back to a date beyond a week", () => {
    expect(formatRelativeUpdate("2025-12-01T12:00:00.000Z", now)).toBe("2025-12-01");
  });

  it("degrades gracefully on an unparseable timestamp", () => {
    expect(formatRelativeUpdate("not-a-date", now)).toBe("recently");
  });
});
