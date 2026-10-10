"use client";

import { useMemo } from "react";
import { useFilters, SortSelect, FilterBar } from "@/components/filter-bar";
import { ClashCountBadge } from "@/components/clash-badge";
import { ProjectCard } from "@/components/project-card";
import { ProjectMap } from "@/components/project-map";
import { EmptyState } from "@/components/states";
import type { Clash } from "@/lib/clash/types";
import { countClashesByProject } from "@/lib/clash-view";
import {
  PROJECT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDate,
  formatINR,
  overrunDays,
} from "@/lib/format";
import { applyFilters, buildFilterLookup, type SortKey } from "@/lib/filters";
import type { Department, Project, RoadSegment } from "@/lib/types";

interface ProjectsViewProps {
  /** Every project in the registry — the unfiltered denominator. */
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
  /** Clashes over the whole registry, for the per-project badges. */
  clashes?: readonly Clash[];
}

function useView(): ["list" | "map", (next: "list" | "map") => void] {
  const { queryString, setParam } = useFilters();
  const raw = new URLSearchParams(queryString).get("view");
  const view = raw === "map" ? "map" : "list";
  return [view, (next) => setParam("view", next === "map" ? "map" : "")];
}

function ViewToggle({ view, onChange }: { view: "list" | "map"; onChange: (v: "list" | "map") => void }) {
  const base =
    "px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
  const active = "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900";
  const idle = "hover:bg-neutral-100 dark:hover:bg-neutral-800";
  return (
    <div
      role="group"
      aria-label="Choose how to view projects"
      className="inline-flex overflow-hidden rounded border border-neutral-300 dark:border-neutral-700"
    >
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")} className={`${base} ${view === "list" ? active : idle}`}>
        <span aria-hidden="true">☰ </span>List
      </button>
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
        className={`${base} border-l border-neutral-300 dark:border-neutral-700 ${view === "map" ? active : idle}`}
      >
        <span aria-hidden="true">▦ </span>Map
      </button>
    </div>
  );
}

function SortHeader({
  column,
  children,
  className = "",
}: {
  column: SortKey;
  children: React.ReactNode;
  className?: string;
}) {
  const { filters, setFilters } = useFilters();
  const active = filters.sort === column;
  const ariaSort = active ? (filters.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ${className}`}
    >
      <button
        type="button"
        onClick={() =>
          active
            ? setFilters({ dir: filters.dir === "asc" ? "desc" : "asc" })
            : setFilters({ sort: column, dir: "asc" })
        }
        className="rounded px-1 py-0.5 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-neutral-800"
      >
        {children}
        <span aria-hidden="true" className="ml-1 text-neutral-400">
          {active ? (filters.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
        <span className="sr-only">, {ariaSort === "none" ? "not sorted" : `sorted ${ariaSort}`}</span>
      </button>
    </th>
  );
}

function DelayCell({ project }: { project: Project }) {
  if (project.status === "cancelled") {
    return <span className="text-neutral-400">—</span>;
  }
  const late = overrunDays(project);
  if (late > 0) {
    return (
      <span className="font-medium text-orange-700 dark:text-orange-400">
        {late} day{late === 1 ? "" : "s"} late
      </span>
    );
  }
  return <span className="text-neutral-500">On plan</span>;
}

/**
 * The registry body: one filter bar, one Map/List choice, and the results.
 *
 * Rendered by `/projects`; `/map` renders a smaller variant of the same
 * pieces. Both read filter state from the URL, so a viewer can move between
 * the two views without losing what they had selected — and can paste the
 * address bar to a colleague and get the same screen back.
 */
export function ProjectsView({
  projects,
  segments,
  departments,
  clashes,
}: ProjectsViewProps) {
  const { filters, clearFilters } = useFilters();
  const [view, setView] = useView();

  const lookup = useMemo(
    () => buildFilterLookup(segments, departments),
    [segments, departments],
  );
  const clashCountByProject = useMemo(
    () => countClashesByProject(clashes ?? []),
    [clashes],
  );
  // `projects` is the whole registry and drives the "N of M" denominator plus
  // the map's stable line offsets; `visible` is what is actually drawn.
  const visible = useMemo(
    () => applyFilters(projects, filters, lookup),
    [projects, filters, lookup],
  );
  const wards = useMemo(
    () => [...new Set(segments.map((s) => s.ward))].sort((a, b) => a.localeCompare(b, "en")),
    [segments],
  );

  const segmentById = new Map(segments.map((s) => [s.id, s]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  const empty = (
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
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterBar departments={departments} wards={wards} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing <span className="font-semibold text-neutral-900 dark:text-neutral-100">{visible.length}</span>{" "}
          of {projects.length} project{projects.length === 1 ? "" : "s"}
          {filters.ward !== "all" ? ` in ${filters.ward}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {view === "list" ? <SortSelect /> : null}
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {view === "map" ? (
        <>
          {visible.length === 0 ? empty : null}
          <ProjectMap
            projects={visible}
            allProjects={projects}
            segments={segments}
            departments={departments}
            clashes={clashes}
          />
        </>
      ) : visible.length === 0 ? (
        empty
      ) : (
        <>
          {/* Desktop: a real table with sortable headers. */}
          <div className="hidden overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800 md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Public works projects. Use the buttons in the column headers to sort.
              </caption>
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <SortHeader column="title">Project</SortHeader>
                  <SortHeader column="department">Department</SortHeader>
                  <SortHeader column="ward">Ward</SortHeader>
                  <SortHeader column="status">Status</SortHeader>
                  <SortHeader column="planned_start">Planned</SortHeader>
                  <SortHeader column="budget" className="text-right">
                    Budget
                  </SortHeader>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                  >
                    Delay
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {visible.map((project) => (
                  <tr key={project.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <td className="px-3 py-2">
                      <a
                        href={`/projects/${project.id}`}
                        className="break-words font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        {project.title}
                      </a>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-neutral-500">
                          {PROJECT_TYPE_LABELS[project.project_type]} · {segmentById.get(project.road_segment_id)?.name ?? "—"}
                        </span>
                        <ClashCountBadge count={clashCountByProject.get(project.id) ?? 0} />
                      </span>
                    </td>
                    <td className="px-3 py-2">{departmentById.get(project.department_id)?.name ?? "—"}</td>
                    <td className="px-3 py-2">{segmentById.get(project.road_segment_id)?.ward ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {formatDate(project.planned_start)} – {formatDate(project.planned_end)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatINR(project.budget_inr)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      <DelayCell project={project} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. A seven-column table needs horizontal scrolling on
              a phone; cards keep every field visible without a gesture. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                department={departmentById.get(project.department_id) ?? null}
                segment={segmentById.get(project.road_segment_id) ?? null}
                clashCount={clashCountByProject.get(project.id) ?? 0}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
