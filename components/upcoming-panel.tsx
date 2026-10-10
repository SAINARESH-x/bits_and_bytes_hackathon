"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFilters } from "@/components/filter-bar";
import { EmptyState } from "@/components/states";
import { overlapsWindow } from "@/lib/filters";
import {
  STATUS_MAP_STYLE,
  STATUS_LABELS,
  addDaysISO,
  daysFromToday,
  formatDate,
  relativeDays,
  todayISO,
} from "@/lib/format";
import type { Department, Project, RoadSegment } from "@/lib/types";

/** How far ahead "upcoming disruptions" looks. */
const HORIZON_DAYS = 30;

interface UpcomingPanelProps {
  /** Already filtered by the main filter bar, so the two never disagree. */
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
}

/**
 * What is about to happen to the roads.
 *
 * The ward selector here writes the same `ward` filter the filter bar uses,
 * rather than a private copy: two ward controls pointing at one piece of
 * state stay in sync and can never contradict each other on screen, which is
 * what a second, panel-local ward would eventually do.
 *
 * Criteria: not cancelled, and the project's work window intersects today
 * .. today+30. That single overlap test covers a project that starts next
 * week, one already dug up, and one that began months ago but is still open.
 */
export function UpcomingPanel({ projects, segments, departments }: UpcomingPanelProps) {
  const { filters, setFilters } = useFilters();
  const ward = filters.ward;

  const departmentById = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments],
  );
  const segmentById = useMemo(
    () => new Map(segments.map((s) => [s.id, s])),
    [segments],
  );
  const wards = useMemo(
    () => [...new Set(segments.map((s) => s.ward))].sort((a, b) => a.localeCompare(b, "en")),
    [segments],
  );

  const from = todayISO();
  const to = addDaysISO(HORIZON_DAYS);

  const upcoming = useMemo(() => {
    return projects
      .filter((p) => p.status !== "cancelled")
      .filter((p) => overlapsWindow(p, from, to))
      .filter((p) => ward === "all" || segmentById.get(p.road_segment_id)?.ward === ward)
      .sort((a, b) => {
        const aStart = a.planned_start ?? a.actual_start ?? "9999-99-99";
        const bStart = b.planned_start ?? b.actual_start ?? "9999-99-99";
        return aStart.localeCompare(bStart) || a.title.localeCompare(b.title, "en");
      });
    // `from`/`to` are recomputed each render; keying on the day would be
    // enough, but listing them keeps the intent explicit for a reader.
  }, [projects, segmentById, ward, from, to]);

  /** "Starts in 5 days" vs "under way since 12 Sep" — whichever is true. */
  function whenLabel(project: Project): string {
    const start = project.planned_start ?? project.actual_start;
    const end = project.planned_end ?? project.actual_end;
    const startDelta = start ? daysFromToday(start) : null;
    const endDelta = end ? daysFromToday(end) : null;

    const head =
      startDelta === null
        ? "Dates not recorded"
        : startDelta > 0
          ? `Starts ${relativeDays(start)}`
          : `Under way since ${formatDate(start)}`;
    const tail = endDelta !== null && endDelta >= 0 ? ` · ends ${relativeDays(end)}` : "";
    return `${head}${tail}`;
  }

  return (
    <section
      aria-labelledby="upcoming-heading"
      className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="upcoming-heading" className="text-sm font-semibold">
          Upcoming disruptions
        </h2>
        <div className="flex items-center gap-2">
          <label
            htmlFor="upcoming-ward"
            className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
          >
            Ward
          </label>
          <select
            id="upcoming-ward"
            value={ward}
            onChange={(event) => setFilters({ ward: event.target.value })}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="all">All wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
        Works starting or still open between {formatDate(from)} and {formatDate(to)}.
      </p>

      <p className="mt-2 text-xs font-medium text-neutral-500" aria-live="polite">
        {upcoming.length} work{upcoming.length === 1 ? "" : "s"} listed
        {ward === "all" ? "" : ` in ${ward}`}
      </p>

      {upcoming.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nothing scheduled here"
            body={
              ward === "all"
                ? "No works start or remain open in the next 30 days under the current filters."
                : `No works start or remain open in the next 30 days in ${ward} under the current filters.`
            }
          />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {upcoming.map((project) => {
            const segment = segmentById.get(project.road_segment_id);
            const department = departmentById.get(project.department_id);
            const style = STATUS_MAP_STYLE[project.status];
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded border border-neutral-200 p-3 hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium leading-snug">
                      <span aria-hidden="true">{style.symbol}</span> {project.title}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${style.color}22`, color: style.color }}
                    >
                      {STATUS_LABELS[project.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {segment?.name ?? "Unknown road"} · {segment?.ward ?? "—"} ·{" "}
                    {department?.name ?? "Unknown department"}
                  </p>
                  <p className="mt-1 text-xs font-medium">{whenLabel(project)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
