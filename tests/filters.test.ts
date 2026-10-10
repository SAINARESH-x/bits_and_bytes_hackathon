import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  applyFilters,
  buildFilterLookup,
  filterProjects,
  filtersToSearchParams,
  hasActiveFilters,
  mergeFilterParams,
  overlapsWindow,
  parseFilters,
  sortProjects,
  type FilterState,
} from "@/lib/filters";
import type { Department, Project, ProjectStatus, RoadSegment } from "@/lib/types";

// --- fixtures -------------------------------------------------------------

const deptA: Department = {
  id: "d1",
  name: "Water Works Department",
  code: "WATER",
  is_simulated: true,
};
const deptB: Department = {
  id: "d2",
  name: "Road Infrastructure Department",
  code: "ROADS",
  is_simulated: true,
};

const segMain: RoadSegment = {
  id: "s1",
  name: "Amber Garden Main Road",
  ward: "Ward 1",
  geometry: {
    type: "LineString",
    coordinates: [
      [80.23, 13.06],
      [80.24, 13.07],
    ],
  },
  is_simulated: true,
};

const segSide: RoadSegment = {
  id: "s2",
  name: "Silver Bells Street",
  ward: "Ward 2",
  geometry: { type: "LineString", coordinates: [[80.25, 13.08]] },
  is_simulated: true,
};

function project(overrides: Partial<Project>): Project {
  return {
    id: "p1",
    title: "Water main relaying",
    purpose: "Replace a leaking trunk main",
    project_type: "water_pipeline",
    department_id: "d1",
    contractor_name: "Ashwin & Co",
    road_segment_id: "s1",
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    status: "planned",
    budget_inr: 1_000_000,
    is_simulated: true,
    ...overrides,
  };
}

const lookup = buildFilterLookup([segMain, segSide], [deptA, deptB]);

function withFilters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

// --- URL parsing ----------------------------------------------------------

describe("parseFilters", () => {
  it("returns defaults for an empty query string", () => {
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips every field", () => {
    const original: FilterState = {
      department: "d2",
      status: "stalled",
      type: "drain",
      ward: "Ward 3",
      from: "2026-11-01",
      to: "2026-12-31",
      q: "amber",
      sort: "budget",
      dir: "desc",
    };
    expect(parseFilters(filtersToSearchParams(original))).toEqual(original);
  });

  it("falls back to defaults instead of throwing on invalid input", () => {
    const params = new URLSearchParams(
      "status=definitely_not_a_status&type=bogus&from=31/12/2026&sort=nope&dir=sideways",
    );
    expect(parseFilters(params)).toEqual(DEFAULT_FILTERS);
  });

  it("survives a status that is valid but unknown to this build", () => {
    expect(parseFilters(new URLSearchParams("status=completed")).status).toBe(
      "completed",
    );
    expect(parseFilters(new URLSearchParams("status=liquidated")).status).toBe(
      "all",
    );
  });

  it("keeps valid fields when only one field is malformed", () => {
    const params = new URLSearchParams("status=stalled&from=nonsense");
    const parsed = parseFilters(params);
    expect(parsed.status).toBe("stalled");
    expect(parsed.from).toBe("");
  });

  it("truncates an absurd search term rather than dropping the query", () => {
    const params = new URLSearchParams({ q: "a".repeat(500) });
    expect(parseFilters(params).q).toHaveLength(120);
  });

  it("omits defaults from the query string", () => {
    const params = filtersToSearchParams(DEFAULT_FILTERS);
    expect([...params.keys()]).toEqual([]);
  });

  it("marks any non-default narrowing as an active filter", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters(withFilters({ q: "pipe" }))).toBe(true);
    // Sorting is a view preference, not a narrowing of the result set.
    expect(hasActiveFilters(withFilters({ sort: "budget", dir: "desc" }))).toBe(
      false,
    );
  });
});

describe("mergeFilterParams", () => {
  it("writes the current filters into an empty query string", () => {
    const out = mergeFilterParams(new URLSearchParams(), withFilters({ status: "stalled" }));
    expect(out.get("status")).toBe("stalled");
  });

  it("replaces stale values instead of accumulating them", () => {
    const first = mergeFilterParams(new URLSearchParams(), withFilters({ status: "stalled" }));
    const second = mergeFilterParams(first, withFilters({ status: "completed" }));
    expect(second.getAll("status")).toEqual(["completed"]);
  });

  it("preserves params this module does not own", () => {
    const current = new URLSearchParams("view=map&uward=Ward%204");
    const out = mergeFilterParams(current, withFilters({ q: "pipe" }));
    expect(out.get("view")).toBe("map");
    expect(out.get("uward")).toBe("Ward 4");
    expect(out.get("q")).toBe("pipe");
  });

  it("removes filter keys that are back to their default", () => {
    const current = new URLSearchParams("q=pipe&view=list");
    const out = mergeFilterParams(current, DEFAULT_FILTERS);
    expect(out.get("q")).toBeNull();
    expect(out.get("view")).toBe("list");
  });
});

// --- date window ----------------------------------------------------------

describe("overlapsWindow", () => {
  const running = project({ planned_start: "2026-06-01", planned_end: "2026-08-31" });

  it("includes a project fully inside the window", () => {
    expect(overlapsWindow(running, "2026-06-15", "2026-07-15")).toBe(true);
  });

  it("includes a project straddling the window", () => {
    expect(overlapsWindow(running, "2026-08-01", "2026-12-31")).toBe(true);
    expect(overlapsWindow(running, "2026-01-01", "2026-06-15")).toBe(true);
  });

  it("excludes a project entirely before or after the window", () => {
    expect(overlapsWindow(running, "2026-09-01", "2026-12-31")).toBe(false);
    expect(overlapsWindow(running, "2026-01-01", "2026-05-31")).toBe(false);
  });

  it("treats a single-day project as a point in time", () => {
    const oneDay = project({ planned_start: "2026-07-15", planned_end: "2026-07-15" });
    expect(overlapsWindow(oneDay, "2026-07-15", "2026-07-15")).toBe(true);
    expect(overlapsWindow(oneDay, "2026-07-16", "2026-07-20")).toBe(false);
  });

  it("falls back to actual dates when nothing was planned", () => {
    const unplanned = project({ actual_start: "2026-06-10", actual_end: "2026-06-20" });
    expect(overlapsWindow(unplanned, "2026-06-01", "2026-06-30")).toBe(true);
    expect(overlapsWindow(unplanned, "2026-07-01", "2026-07-31")).toBe(false);
  });

  it("clamps an open-ended window instead of matching everything", () => {
    const noEnd = project({ planned_start: "2026-06-01", planned_end: null });
    expect(overlapsWindow(noEnd, "2026-06-01", "2026-06-30")).toBe(true);
    expect(overlapsWindow(noEnd, "2026-01-01", "2026-05-31")).toBe(false);
  });

  it("refuses to place a project that has no dates at all", () => {
    expect(overlapsWindow(project({}), "2026-01-01", "2026-12-31")).toBe(false);
  });

  it("honours an unbounded side", () => {
    expect(overlapsWindow(running, "", "2026-05-01")).toBe(false);
    expect(overlapsWindow(running, "", "2026-06-15")).toBe(true);
    expect(overlapsWindow(running, "2026-09-01", "")).toBe(false);
    expect(overlapsWindow(running, "2026-08-01", "")).toBe(true);
  });
});

// --- filtering ------------------------------------------------------------

describe("filterProjects", () => {
  const projects: Project[] = [
    project({ id: "p1", department_id: "d1", status: "in_progress", project_type: "water_pipeline", road_segment_id: "s1", planned_start: "2026-06-01", planned_end: "2026-07-01", title: "Water main relaying", purpose: "Replace a leaking trunk main" }),
    project({ id: "p2", department_id: "d2", status: "planned", project_type: "road", road_segment_id: "s2", planned_start: "2026-09-01", planned_end: "2026-10-01", title: "Resurfacing work", contractor_name: "Blue Stone Infra", purpose: "Overlay the worn carriageway" }),
    project({ id: "p3", department_id: "d1", status: "cancelled", project_type: "fibre", road_segment_id: "s1", title: "Abandoned fibre run", purpose: "Lay a new duct corridor" }),
  ];

  const ids = (f: FilterState) => filterProjects(projects, f, lookup).map((p) => p.id);

  it("returns everything when no filter is set", () => {
    expect(ids(DEFAULT_FILTERS)).toEqual(["p1", "p2", "p3"]);
  });

  it("filters by department", () => {
    expect(ids(withFilters({ department: "d2" }))).toEqual(["p2"]);
  });

  it("filters by status", () => {
    expect(ids(withFilters({ status: "planned" }))).toEqual(["p2"]);
  });

  it("filters by project type", () => {
    expect(ids(withFilters({ type: "fibre" }))).toEqual(["p3"]);
  });

  it("filters by ward through the segment", () => {
    expect(ids(withFilters({ ward: "Ward 2" }))).toEqual(["p2"]);
  });

  it("excludes projects whose segment is missing when a ward is selected", () => {
    const orphan = project({ id: "p4", road_segment_id: "s-missing" });
    const both = [...projects, orphan];
    expect(
      filterProjects(both, withFilters({ ward: "Ward 1" }), lookup).map((p) => p.id),
    ).toEqual(["p1", "p3"]);
  });

  it("searches title, purpose, road, ward, department and contractor", () => {
    expect(ids(withFilters({ q: "amber" }))).toEqual(["p1", "p3"]); // segment name
    expect(ids(withFilters({ q: "BLUE STONE" }))).toEqual(["p2"]); // contractor, case-insensitive
    expect(ids(withFilters({ q: "leaking" }))).toEqual(["p1"]); // purpose
    expect(ids(withFilters({ q: "Road Infrastructure" }))).toEqual(["p2"]); // dept
  });

  it("applies the date range and drops cancelled works from it", () => {
    expect(ids(withFilters({ from: "2026-06-15", to: "2026-06-30" }))).toEqual(["p1"]);
    expect(ids(withFilters({ from: "2026-01-01", to: "2026-12-31" }))).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("combines filters with AND semantics", () => {
    expect(ids(withFilters({ department: "d1", status: "in_progress", ward: "Ward 1" }))).toEqual(
      ["p1"],
    );
    expect(ids(withFilters({ department: "d2", status: "in_progress" }))).toEqual([]);
  });
});

// --- sorting --------------------------------------------------------------

describe("sortProjects", () => {
  const projects: Project[] = [
    project({ id: "a", title: "Zebra works", department_id: "d2", planned_start: "2026-05-01", budget_inr: 500, status: "completed" }),
    project({ id: "b", title: "Alpha works", department_id: "d1", planned_start: "2026-03-01", budget_inr: 900, status: "stalled" }),
    project({ id: "c", title: "Mango works", department_id: "d1", planned_start: null, budget_inr: null, status: "planned" }),
  ];

  const order = (f: FilterState) => sortProjects(projects, f, lookup).map((p) => p.id);

  it("sorts titles alphabetically ascending", () => {
    expect(order(withFilters({ sort: "title" }))).toEqual(["b", "c", "a"]);
  });

  it("reverses on descending direction", () => {
    expect(order(withFilters({ sort: "title", dir: "desc" }))).toEqual(["a", "c", "b"]);
  });

  it("sorts by status in pipeline order, not alphabetically", () => {
    expect(order(withFilters({ sort: "status" }))).toEqual(["c", "b", "a"]);
  });

  it("sorts dates chronologically", () => {
    expect(order(withFilters({ sort: "planned_start" }))).toEqual(["b", "a", "c"]);
  });

  it("sorts numerically by budget", () => {
    expect(order(withFilters({ sort: "budget", dir: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("sorts by department name", () => {
    expect(order(withFilters({ sort: "department" }))).toEqual(["a", "b", "c"]);
  });

  it("puts records with no value last in BOTH directions", () => {
    // c has no planned_start; nulls must not jump to the front on desc.
    expect(order(withFilters({ sort: "planned_start", dir: "desc" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(order(withFilters({ sort: "budget", dir: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the input array", () => {
    const before = projects.map((p) => p.id);
    sortProjects(projects, withFilters({ sort: "title", dir: "desc" }), lookup);
    expect(projects.map((p) => p.id)).toEqual(before);
  });

  it("is deterministic for equal keys", () => {
    const tied = [
      project({ id: "x1", title: "Same", status: "planned" as ProjectStatus }),
      project({ id: "x2", title: "Same", status: "planned" as ProjectStatus }),
    ];
    const first = sortProjects(tied, withFilters({ sort: "status" }), lookup).map((p) => p.id);
    const second = sortProjects(tied, withFilters({ sort: "status" }), lookup).map((p) => p.id);
    expect(first).toEqual(second);
  });
});

describe("applyFilters", () => {
  it("filters first, then sorts what is left", () => {
    const projects = [
      project({ id: "n1", title: "Alpha", status: "planned" }),
      project({ id: "n2", title: "Zulu", status: "planned" }),
      project({ id: "n3", title: "Middle", status: "completed" }),
    ];
    expect(
      applyFilters(projects, withFilters({ status: "planned", sort: "title" }), lookup).map(
        (p) => p.id,
      ),
    ).toEqual(["n1", "n2"]);
  });
});
