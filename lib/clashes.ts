import { detectClashes } from "@/lib/clash";
import type { ClashResult } from "@/lib/clash";
import { countClashes, type ClashResponse } from "@/lib/clash-view";
import { loadRegistry } from "@/lib/data";
import type { DataMode } from "@/lib/data";
import type { Department, Project, RoadSegment } from "@/lib/types";

/**
 * Server-side entry point for the clash board.
 *
 * Kept apart from `lib/clash-view.ts` on purpose: this file reaches the data
 * layer (and therefore Supabase), so it must never end up in a client bundle.
 * `lib/clash-view.ts` holds the pure helpers both sides share.
 */

export interface ClashBoard {
  result: ClashResult;
  segments: RoadSegment[];
  departments: Department[];
  projects: Project[];
  /** The source that actually answered — see `loadRegistry`. */
  mode: DataMode;
}

/** Load the registry and run the engine over it. Demo-safe: never throws here. */
export async function loadClashBoard(): Promise<ClashBoard> {
  const { projects, segments, departments, mode } = await loadRegistry();
  return {
    result: detectClashes(projects, segments),
    segments,
    departments,
    projects,
    mode,
  };
}

/** Shape the board for the wire, so the API and the page serve the same bytes. */
export function summarizeBoard(board: ClashBoard): ClashResponse {
  return {
    ...board.result,
    counts: {
      ...countClashes(board.result.clashes),
      clusters: board.result.clusters.length,
      skipped: board.result.skipped.length,
    },
    segments: board.segments,
    departments: board.departments,
    projects: board.projects,
    mode: board.mode,
  };
}
