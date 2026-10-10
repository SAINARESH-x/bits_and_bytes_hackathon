"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { STATUSES } from "@/lib/filters";
import { STATUS_LABELS, STATUS_MAP_STYLE } from "@/lib/format";
import { buildProjectLines } from "@/lib/map-lines";
import type { Department, Project, RoadSegment } from "@/lib/types";

/**
 * Public wrapper around the real Leaflet tree.
 *
 * `ssr: false` is what keeps `window` off the server: `leaflet` touches the
 * DOM at import time, and a client component is still *executed* during SSR
 * unless its import is deferred. Without this boundary `next start` dies with
 * "ReferenceError: window is not defined" the moment /map or /projects is hit.
 */
const LeafletProjectMap = dynamic(
  () => import("./project-map-leaflet").then((mod) => mod.LeafletProjectMap),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex h-[420px] w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-500 sm:h-[520px] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
      >
        <span className="sr-only">Loading map…</span>
        <span aria-hidden="true">Loading map…</span>
      </div>
    ),
  },
);

/**
 * Legend entry drawn with the same pattern the map uses, plus a glyph — never
 * colour alone. A reader who cannot tell violet from blue still sees a dashed
 * line labelled ○ Planned against a solid line labelled ▶ In progress, and it
 * survives greyscale and a projector.
 *
 * Lives out here rather than in the Leaflet file so the legend ships in the
 * server-rendered HTML instead of arriving after hydration.
 */
export function MapLegend() {
  return (
    <section
      aria-label="Map legend"
      className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-sm font-semibold">Legend</h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STATUSES.map((status) => {
          const style = STATUS_MAP_STYLE[status];
          return (
            <li key={status} className="flex items-center gap-3">
              <svg
                width="44"
                height="12"
                viewBox="0 0 44 12"
                aria-hidden="true"
                focusable="false"
                className="shrink-0"
              >
                <line
                  x1="2"
                  y1="6"
                  x2="42"
                  y2="6"
                  stroke={style.color}
                  strokeWidth={Math.min(style.weight, 6)}
                  strokeDasharray={style.dashArray ?? undefined}
                  strokeLinecap="butt"
                />
              </svg>
              <span aria-hidden="true" className="text-sm leading-none">
                {style.symbol}
              </span>
              <span className="text-sm">{STATUS_LABELS[status]}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
        Line style and symbol both encode status, so the map stays readable in
        greyscale. Map data © OpenStreetMap contributors.
      </p>
    </section>
  );
}

interface ProjectMapProps {
  /** What to draw — the filtered set. */
  projects: readonly Project[];
  /**
   * Every project in the registry. Used only to decide the parallel offset,
   * so a line keeps its slot on the road when filters change.
   */
  allProjects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
  /** Hide the text list on views that already render one. */
  showTextList?: boolean;
  className?: string;
}

/**
 * Map + legend + optional text list. Geometry is computed here (pure, no
 * Leaflet) so the text list below the map is available in server HTML — that
 * list is the keyboard path into projects, since Leaflet paths cannot take
 * focus.
 */
export function ProjectMap({
  projects,
  allProjects,
  segments,
  departments,
  showTextList = false,
  className = "",
}: ProjectMapProps) {
  const lines = useMemo(
    () => buildProjectLines(projects, allProjects, segments, departments),
    [projects, allProjects, segments, departments],
  );

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <LeafletProjectMap lines={lines} totalCount={projects.length} />

      <MapLegend />

      {showTextList ? (
        <details className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Projects on this map (text list)
          </summary>
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            Leaflet paths cannot take keyboard focus, so every project drawn
            above is also reachable here.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
            {lines.map((line) => (
              <li key={line.project.id}>
                <Link
                  href={`/projects/${line.project.id}`}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <span>
                    <span aria-hidden="true">{line.style.symbol}</span>{" "}
                    {line.project.title}
                    <span className="block text-xs text-neutral-500">
                      {line.segment.name} · {line.department?.name ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-400">
                    {STATUS_LABELS[line.project.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
