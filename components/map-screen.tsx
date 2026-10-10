"use client";

import { useMemo } from "react";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { ProjectMap } from "@/components/project-map";
import { EmptyState } from "@/components/states";
import { UpcomingPanel } from "@/components/upcoming-panel";
import type { Clash } from "@/lib/clash/types";
import { applyFilters, buildFilterLookup } from "@/lib/filters";
import type { CitizenReport, Department, Project, RoadSegment } from "@/lib/types";

interface MapScreenProps {
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
  /** Clashes over the whole registry, so filtering the map keeps every badge. */
  clashes?: readonly Clash[];
  /** Unlisted-work reports to pin on the map (PLAN.md M6 item 3). */
  unlistedReports?: readonly CitizenReport[];
}

/**
 * The /map body. Lives on the client because the filter state it reacts to
 * comes from the query string — that is what makes a filtered map shareable
 * by copying the address bar.
 *
 * Data is fetched once on the server and handed down; every subsequent
 * filter change is pure in-memory work, so the map re-renders instantly
 * instead of paying a round trip per dropdown.
 */
export function MapScreen({
  projects,
  segments,
  departments,
  clashes,
  unlistedReports = [],
}: MapScreenProps) {
  const { filters, clearFilters } = useFilters();

  const lookup = useMemo(
    () => buildFilterLookup(segments, departments),
    [segments, departments],
  );
  const filtered = useMemo(
    () => applyFilters(projects, filters, lookup),
    [projects, filters, lookup],
  );
  const wards = useMemo(
    () => [...new Set(segments.map((s) => s.ward))].sort((a, b) => a.localeCompare(b, "en")),
    [segments],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Map</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Every simulated project drawn on the road it occupies. Colour, line
          style and symbol together encode status.
        </p>
      </div>

      <FilterBar departments={departments} wards={wards} />

      <p aria-live="polite" className="text-sm text-neutral-600 dark:text-neutral-400">
        Showing <span className="font-semibold text-neutral-900 dark:text-neutral-100">{filtered.length}</span>{" "}
        of {projects.length} project{projects.length === 1 ? "" : "s"}
        {filters.ward !== "all" ? ` in ${filters.ward}` : ""}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No projects match these filters"
          body="Try widening the date range, clearing the search, or selecting a different ward."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Clear all filters
            </button>
          }
        />
      ) : null}

      <ProjectMap
        projects={filtered}
        allProjects={projects}
        segments={segments}
        departments={departments}
        clashes={clashes}
        unlistedReports={unlistedReports}
        showTextList
      />

      <UpcomingPanel projects={filtered} segments={segments} departments={departments} />
    </div>
  );
}
