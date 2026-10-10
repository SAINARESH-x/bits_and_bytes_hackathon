import { z } from "zod";
import type {
  Department,
  Project,
  ProjectStatus,
  ProjectType,
  RoadSegment,
} from "@/lib/types";

/**
 * Pure filtering/sorting module for the registry views.
 *
 * Contract: no UI imports, no DB imports, no `useSearchParams` — the URL is
 * read and written by components in `components/filter-bar.tsx`, but the
 * interpretation of those params lives here so it can be unit-tested and
 * shared by /map and /projects without divergence.
 *
 * Filters arrive from the URL, i.e. from the user, so they are parsed with the
 * same Zod schemas the API routes use: a hand-edited or truncated query string
 * falls back to a default instead of throwing.
 */

export const STATUSES = [
  "planned",
  "in_progress",
  "stalled",
  "completed",
  "cancelled",
] as const satisfies readonly ProjectStatus[];

export const PROJECT_TYPES = [
  "road",
  "drain",
  "water_pipeline",
  "power_cable",
  "fibre",
  "other",
] as const satisfies readonly ProjectType[];

export const SORT_KEYS = [
  "title",
  "status",
  "planned_start",
  "planned_end",
  "department",
  "ward",
  "budget",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Display order for status columns; also the default status sort. */
export const STATUS_ORDER: Record<ProjectStatus, number> = {
  planned: 0,
  in_progress: 1,
  stalled: 2,
  completed: 3,
  cancelled: 4,
};

export interface FilterState {
  /** Department id, or "all". */
  department: string;
  status: ProjectStatus | "all";
  type: ProjectType | "all";
  /** Ward name, or "all". */
  ward: string;
  /** Inclusive YYYY-MM-DD bounds, or "" for unbounded. */
  from: string;
  to: string;
  /** Free-text search across title, purpose, road, ward, dept, contractor. */
  q: string;
  sort: SortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_FILTERS: FilterState = {
  department: "all",
  status: "all",
  type: "all",
  ward: "all",
  from: "",
  to: "",
  q: "",
  sort: "planned_start",
  dir: "asc",
};

/** Field name -> query-string key. Short keys keep shared URLs readable. */
const PARAM_KEY: Record<keyof FilterState, string> = {
  department: "dept",
  status: "status",
  type: "type",
  ward: "ward",
  from: "from",
  to: "to",
  q: "q",
  sort: "sort",
  dir: "dir",
};

/**
 * Every key `FilterState` owns. The URL writer uses this to strip only its own
 * keys before writing, so unrelated params (the map/list view toggle, the
 * disruptions ward) survive a filter change instead of silently vanishing.
 */
export const FILTER_PARAM_KEYS: readonly string[] = Object.values(PARAM_KEY);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `.catch()` is what makes this safe: an unknown status, a malformed date or
 * an over-long search term degrades to that field's default rather than
 * failing the whole parse and blanking the view.
 */
const filterSchema = z.object({
  department: z.string().max(64).catch("all"),
  status: z.enum(["all", ...STATUSES]).catch("all"),
  type: z.enum(["all", ...PROJECT_TYPES]).catch("all"),
  ward: z.string().max(80).catch("all"),
  from: z.string().regex(DATE_ONLY).catch(""),
  to: z.string().regex(DATE_ONLY).catch(""),
  q: z
    .string()
    .transform((v) => v.slice(0, 120))
    .catch(""),
  sort: z.enum(SORT_KEYS).catch("planned_start"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
});

/** Read filter state out of a query string. Never throws. */
export function parseFilters(params: URLSearchParams): FilterState {
  return filterSchema.parse({
    department: params.get(PARAM_KEY.department) ?? undefined,
    status: params.get(PARAM_KEY.status) ?? undefined,
    type: params.get(PARAM_KEY.type) ?? undefined,
    ward: params.get(PARAM_KEY.ward) ?? undefined,
    from: params.get(PARAM_KEY.from) ?? undefined,
    to: params.get(PARAM_KEY.to) ?? undefined,
    q: params.get(PARAM_KEY.q) ?? undefined,
    sort: params.get(PARAM_KEY.sort) ?? undefined,
    dir: params.get(PARAM_KEY.dir) ?? undefined,
  });
}

/**
 * Serialise back to a query string, omitting defaults so a clean view stays a
 * clean URL and shared links carry only what the viewer actually changed.
 */
export function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  (Object.keys(PARAM_KEY) as (keyof FilterState)[]).forEach((field) => {
    if (filters[field] !== DEFAULT_FILTERS[field]) {
      params.set(PARAM_KEY[field], String(filters[field]));
    }
  });
  return params;
}

/** True when the viewer has narrowed the results at all (drives "Clear"). */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.department !== DEFAULT_FILTERS.department ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.ward !== DEFAULT_FILTERS.ward ||
    filters.from !== DEFAULT_FILTERS.from ||
    filters.to !== DEFAULT_FILTERS.to ||
    filters.q !== DEFAULT_FILTERS.q
  );
}

/**
 * Write `filters` into an existing query string, preserving any params this
 * module does not own (e.g. `view`, `uward`).
 *
 * Pure so the merge rule is testable: the failure mode it prevents is a
 * viewer picking a ward, then tapping a department and losing the ward — a
 * bug that is easy to ship and very visible in a demo.
 */
export function mergeFilterParams(
  current: URLSearchParams,
  filters: FilterState,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const key of FILTER_PARAM_KEYS) next.delete(key);
  const written = filtersToSearchParams(filters);
  written.forEach((value, key) => next.set(key, value));
  return next;
}

/** Ids-only lookups the pure functions need; callers build these once. */
export interface FilterLookup {
  segmentsById: ReadonlyMap<string, RoadSegment>;
  departmentsById: ReadonlyMap<string, Department>;
}

export function buildFilterLookup(
  segments: readonly RoadSegment[],
  departments: readonly Department[],
): FilterLookup {
  return {
    segmentsById: new Map(segments.map((s) => [s.id, s])),
    departmentsById: new Map(departments.map((d) => [d.id, d])),
  };
}

/**
 * The dates a project's window is judged on: planned when we have it, actual
 * as a fallback. Cancelled works carry no disruption window and are excluded
 * from date filtering entirely (see `matchesFilters`).
 */
export function projectDateWindow(project: Project): {
  start: string | null;
  end: string | null;
} {
  return {
    start: project.planned_start ?? project.actual_start,
    end: project.planned_end ?? project.actual_end,
  };
}

/**
 * Does this project's window intersect [from, to]?
 * Used by both the date-range filter and the "upcoming disruptions" panel.
 * A project with no dates at all cannot be placed in time, so it is excluded
 * as soon as either bound is set — rather than silently always matching.
 */
export function overlapsWindow(
  project: Project,
  from: string,
  to: string,
): boolean {
  const { start, end } = projectDateWindow(project);
  if (!start && !end) return false;
  // Open-ended window: clamp the missing side to the one we do have.
  const s = start ?? end!;
  const e = end ?? start!;
  if (from && e < from) return false;
  if (to && s > to) return false;
  return true;
}

function matchesFilters(
  project: Project,
  filters: FilterState,
  lookup: FilterLookup,
): boolean {
  if (filters.department !== "all" && project.department_id !== filters.department) {
    return false;
  }
  if (filters.status !== "all" && project.status !== filters.status) return false;
  if (filters.type !== "all" && project.project_type !== filters.type) return false;

  if (filters.ward !== "all") {
    const segment = lookup.segmentsById.get(project.road_segment_id);
    if (segment?.ward !== filters.ward) return false;
  }

  if (filters.from || filters.to) {
    // A cancelled project has no live window to intersect with.
    if (project.status === "cancelled") return false;
    if (!overlapsWindow(project, filters.from, filters.to)) return false;
  }

  if (filters.q) {
    const segment = lookup.segmentsById.get(project.road_segment_id);
    const department = lookup.departmentsById.get(project.department_id);
    const haystack = [
      project.title,
      project.purpose,
      project.contractor_name ?? "",
      segment?.name ?? "",
      segment?.ward ?? "",
      department?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }

  return true;
}

export function filterProjects(
  projects: readonly Project[],
  filters: FilterState,
  lookup: FilterLookup,
): Project[] {
  return projects.filter((p) => matchesFilters(p, filters, lookup));
}

/**
 * Type predicate on purpose: after the guard, control-flow analysis narrows
 * the value to `string | number` and `compareValues` needs no assertion.
 */
function isMissing(value: string | number | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en");
}

function valueFor(
  project: Project,
  key: SortKey,
  lookup: FilterLookup,
): string | number | null {
  switch (key) {
    case "title":
      return project.title;
    case "status":
      return STATUS_ORDER[project.status];
    case "planned_start":
      return project.planned_start;
    case "planned_end":
      return project.planned_end;
    case "department":
      return lookup.departmentsById.get(project.department_id)?.name ?? null;
    case "ward":
      return lookup.segmentsById.get(project.road_segment_id)?.ward ?? null;
    case "budget":
      return project.budget_inr;
  }
}

/** Stable, immutable sort. Returns a new array; the caller's list is untouched. */
export function sortProjects(
  projects: readonly Project[],
  filters: FilterState,
  lookup: FilterLookup,
): Project[] {
  const { sort, dir } = filters;
  const sign = dir === "desc" ? -1 : 1;
  return [...projects].sort((a, b) => {
    const aVal = valueFor(a, sort, lookup);
    const bVal = valueFor(b, sort, lookup);

    // Missing values are held back in BOTH directions. Letting them travel
    // with the arrow would put "no budget recorded" at the top of every
    // descending column, which is the opposite of useful.
    if (isMissing(aVal) || isMissing(bVal)) {
      if (isMissing(aVal) && isMissing(bVal)) {
        return a.title.localeCompare(b.title, "en");
      }
      return isMissing(aVal) ? 1 : -1;
    }

    const primary = compareValues(aVal, bVal) * sign;
    if (primary !== 0) return primary;
    // Deterministic tiebreak so equal keys never flicker between renders.
    return a.title.localeCompare(b.title, "en");
  });
}

/** Filter then sort — the one call both views make. */
export function applyFilters(
  projects: readonly Project[],
  filters: FilterState,
  lookup: FilterLookup,
): Project[] {
  return sortProjects(filterProjects(projects, filters, lookup), filters, lookup);
}
