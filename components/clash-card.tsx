"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ClashMap } from "@/components/clash-map";
import {
  ClashTypeBadge,
  SEVERITY_CARD_RING,
  SeverityBadge,
} from "@/components/clash-badge";
import type { Clash } from "@/lib/clash/types";
import { clashAnchorId, clashPairLabel } from "@/lib/clash-view";
import { formatDate, formatINR } from "@/lib/format";
import { buildProjectLines } from "@/lib/map-lines";
import type { Department, Project, RoadSegment } from "@/lib/types";

export interface ClashCardProps {
  clash: Clash;
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
}

/** One number from the engine, with a label a non-engineer can read. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

export function ClashCard({ clash, projects, segments, departments }: ClashCardProps) {
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  // The clash carries the engine's structural view of both works; the registry
  // rows are what carries the map style, the department name and the link.
  const earlier = projectById.get(clash.projectA.id) ?? null;
  const later = projectById.get(clash.projectB.id) ?? null;
  const earlierName = earlier?.title ?? clash.projectA.title ?? clash.projectA.id;
  const laterName = later?.title ?? clash.projectB.title ?? clash.projectB.id;

  const segment = segments.find((s) => s.id === clash.segmentId) ?? null;
  const departmentName = (id: string): string =>
    departments.find((d) => d.id === id)?.name ?? "Unknown department";

  const lines = useMemo(() => {
    const pair = [earlier, later].filter((p): p is Project => p !== null);
    if (pair.length === 0) return [];
    return buildProjectLines(pair, projects, segments, departments);
  }, [earlier, later, projects, segments, departments]);

  const anchor = clashAnchorId(clash.id);
  const headingId = `${anchor}-heading`;

  return (
    <article
      id={anchor}
      aria-labelledby={headingId}
      className={`scroll-mt-24 rounded-lg border bg-white p-4 dark:bg-neutral-900 ${SEVERITY_CARD_RING[clash.severity]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={clash.severity} />
        <ClashTypeBadge type={clash.type} />
        {clash.clusterSize !== undefined && clash.clusterSize >= 3 ? (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700">
            {clash.clusterSize}-way conflict on this road
          </span>
        ) : null}
      </div>

      <h3 id={headingId} className="mt-3 text-base font-semibold leading-snug">
        <Link
          href={`/projects/${clash.projectA.id}`}
          className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:decoration-neutral-100"
        >
          {earlierName}
        </Link>
        <span className="px-1 text-neutral-500">vs</span>
        <Link
          href={`/projects/${clash.projectB.id}`}
          className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:decoration-neutral-100"
        >
          {laterName}
        </Link>
      </h3>

      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        {segment ? `${segment.name}${segment.ward ? ` · ${segment.ward}` : ""} · ` : ""}
        {departmentName(clash.projectA.department_id)} +{" "}
        {departmentName(clash.projectB.department_id)}
      </p>

      <p className="mt-3 text-sm">
        <span className="font-semibold">Why flagged: </span>
        {clash.explanation}
      </p>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {clash.overlapDays !== undefined ? (
          <Fact
            label="Same time"
            value={`${clash.overlapDays} day${clash.overlapDays === 1 ? "" : "s"} of overlap`}
          />
        ) : null}
        {clash.gapDays !== undefined ? (
          <Fact
            label="Gap since restoration"
            value={`${clash.gapDays} day${clash.gapDays === 1 ? "" : "s"}`}
          />
        ) : null}
        {clash.proposedStart && clash.proposedEnd ? (
          <Fact
            label="Proposed window"
            value={`${formatDate(clash.proposedStart)} – ${formatDate(clash.proposedEnd)}`}
          />
        ) : null}
        {clash.estimatedWasteInr !== undefined ? (
          <Fact
            label="Money at risk (simulated)"
            value={formatINR(clash.estimatedWasteInr)}
          />
        ) : null}
      </dl>

      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
          Proposed coordination
        </p>
        <p className="mt-1 text-sm text-blue-950 dark:text-blue-100">
          {clash.suggestion}
        </p>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300">
          Show this road on a map
        </summary>
        <div className="mt-2">
          {lines.length > 0 ? (
            <ClashMap
              lines={lines}
              label={`${clashPairLabel(clash)}${segment ? ` on ${segment.name}` : ""}.`}
            />
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No map geometry is stored for this road in the simulated registry.
            </p>
          )}
        </div>
      </details>

      <p className="mt-3 text-xs text-neutral-500">
        Both works and the cost estimate are simulated demo data.
      </p>
    </article>
  );
}

export default ClashCard;
