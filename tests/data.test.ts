import { describe, expect, it } from "vitest";
import { getDataMode, listProjects, listProjectsFromSeed } from "@/lib/data";

describe("data mode", () => {
  it("reports demo when no Supabase env vars are set", () => {
    expect(getDataMode()).toBe("demo");
  });

  it("always exposes is_simulated on every seeded project", () => {
    const projects = listProjectsFromSeed();
    for (const p of projects) {
      expect(p.is_simulated).toBe(true);
    }
  });

  it("has no projects before M2 fills the registry", () => {
    expect(listProjectsFromSeed()).toEqual([]);
  });
});

describe("listProjects (demo fallback)", () => {
  it("returns seed data without touching the network", async () => {
    await expect(listProjects()).resolves.toEqual([]);
  });
});
