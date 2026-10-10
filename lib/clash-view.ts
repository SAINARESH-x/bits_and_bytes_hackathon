/**
 * Presentation helpers over a `ClashResult`.
 *
 * Deliberately importable from the browser: everything here is pure arithmetic
 * over plain objects, with no Supabase, no `lib/data` and no Node built-ins.
 * The server-side loader lives in `lib/clashes.ts` so a client component that
 * only needs a count never drags the database client into the bundle.
 */

import type {
  Clash,
  ClashResult,
  ClashType,
  Severity,
} from "@/lib/clash/types";
import { SEVERITY_ORDER } from "@/lib/clash/types";
import type { Department, Project, RoadSegment } from "@/lib/types";

export interface ClashCounts {
  total: number;
  high: number;
  medium: number;
  low: number;
  clusters: number;
  skipped: number;
}

/**
 * Mirrors `DataMode` in `lib/data.ts`.
 *
 * Duplicated rather than imported: a `import type` from `lib/data` would be
 * erased at compile time, but keeping this module free of *any* reference to
 * the data layer is what guarantees a client component can import it without
 * pulling the Supabase client into the browser bundle.
 */
export type ClashDataMode = "demo" | "supabase";

/** The payload both the /clashes page and `GET /api/clashes` serve. */
export interface ClashResponse extends ClashResult {
  counts: ClashCounts;
  segments: RoadSegment[];
  departments: Department[];
  /**
   * The registry rows a clash refers to, so a card can draw the same geometry
   * the big map draws. The clash itself carries only the engine's structural
   * view of a project, which is not enough to pick a line style or a link.
   */
  projects: Project[];
  /**
   * The source this payload was computed from — "demo" means the simulated
   * registry in `data/seed.json`, not a live database. It is part of the
   * snapshot, so it is stamped alongside `generatedAt`: a cached payload
   * truthfully reports where its own bytes came from.
   */
  mode: ClashDataMode;
}

export function countClashes(clashes: readonly Clash[]): ClashCounts {
  const counts: ClashCounts = {
    total: clashes.length,
    high: 0,
    medium: 0,
    low: 0,
    clusters: 0,
    skipped: 0,
  };
  for (const clash of clashes) counts[clash.severity] += 1;
  return counts;
}

/** How many clashes mention each project, keyed by project id. */
export function countClashesByProject(
  clashes: readonly Clash[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const clash of clashes) {
    counts.set(clash.projectA.id, (counts.get(clash.projectA.id) ?? 0) + 1);
    counts.set(clash.projectB.id, (counts.get(clash.projectB.id) ?? 0) + 1);
  }
  return counts;
}

export function clashesForProject(
  clashes: readonly Clash[],
  projectId: string,
): Clash[] {
  return clashes.filter(
    (clash) => clash.projectA.id === projectId || clash.projectB.id === projectId,
  );
}

/** The other side of a clash, from `projectId`'s point of view. */
export function counterpartOf(clash: Clash, projectId: string): Clash["projectA"] {
  return clash.projectA.id === projectId ? clash.projectB : clash.projectA;
}

/**
 * Split a clash list into one group per severity, most urgent first. Groups
 * that would be empty are omitted so the UI never renders a bare heading.
 */
export function groupClashesBySeverity(
  clashes: readonly Clash[],
): { severity: Severity; clashes: Clash[] }[] {
  const buckets: Record<Severity, Clash[]> = { high: [], medium: [], low: [] };
  for (const clash of clashes) buckets[clash.severity].push(clash);

  return (Object.keys(buckets) as Severity[])
    .sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])
    .filter((severity) => buckets[severity].length > 0)
    .map((severity) => ({ severity, clashes: buckets[severity] }));
}

/** One-line label for a pair of works, e.g. "A vs B" — used in summaries. */
export function clashPairLabel(clash: Clash): string {
  const name = (project: Clash["projectA"]): string =>
    project.title?.trim() || project.id;
  return `${name(clash.projectA)} vs ${name(clash.projectB)}`;
}

/**
 * DOM id for a clash card, so `/projects/[id]` can deep-link straight to the
 * matching entry on /clashes. Engine ids already read `clash:TYPE:a:b`, so
 * this only swabs the separators — every character outside `[A-Za-z0-9_-]`
 * becomes a dash, which keeps the fragment boring and copy-pasteable.
 */
export function clashAnchorId(clashId: string): string {
  return clashId.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** "Concurrent overlap" / "Repeat dig", for a linked summary. */
export function clashTypeSummary(type: ClashType): string {
  return type === "CONCURRENT_OVERLAP" ? "Concurrent overlap" : "Repeat dig";
}
