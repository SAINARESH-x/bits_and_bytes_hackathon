"use client";

import { useMemo } from "react";
import { ClashTypeBadge, SeverityBadge } from "@/components/clash-badge";
import { detectClashes } from "@/lib/clash";
import { CLASH_TYPE_HINTS, type Project as EngineProject } from "@/lib/clash/types";
import { formatDate, formatINR } from "@/lib/format";
import type { Department, RoadSegment } from "@/lib/types";

/**
 * The id the draft (a not-yet-saved project) carries while it is being
 * checked against the registry. It can never collide with a stored row:
 * store ids come from the seed or the DB.
 */
export const CONSOLE_DRAFT_ID = "console-draft-project";

const SKIPPED_HINTS: Record<string, string> = {
  MISSING_DATES:
    "Fill in planned start and end dates — the engine needs a complete window to compare.",
  INVALID_DATES:
    "One of the dates is not a real calendar day (for example 2026-02-30).",
  INVERTED_DATES:
    "The planned end is before the planned start — reverse the window.",
};

export interface ClashPreviewProps {
  /** The work being drafted, with a stable id (CONSOLE_DRAFT_ID). */
  draft: EngineProject;
  /** The registry the draft is checked against (existing works). */
  projects: readonly EngineProject[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
}

/**
 * LIVE CLASH PREVIEW — the milestone feature.
 *
 * Every keystroke/change in the New Project form re-runs the pure clash
 * engine from lib/clash over (registry + draft) and keeps only the clashes
 * that name the draft. The panel therefore shows, in real time, whether the
 * road being planned overlaps another department's work or re-opens a
 * recently restored road — plus the engine's coordination suggestion — before
 * the project is ever saved.
 *
 * The engine is deliberately client-importable (lib/clash has no UI or DB
 * imports), so the preview is instant and needs no network round-trip.
 */
export function ClashPreview({
  draft,
  projects,
  segments,
  departments,
}: ClashPreviewProps) {
  const preview = useMemo(() => {
    if (draft.status === "cancelled") {
      return { kind: "cancelled" } as const;
    }

    // The engine skips cancelled rows but not the draft (its status is not
    // "cancelled" here), so the registry copy is safe to reuse as-is.
    const result = detectClashes([...projects, draft], segments);
    const clashes = result.clashes.filter(
      (c) => c.projectA.id === draft.id || c.projectB.id === draft.id,
    );
    const skipped = result.skipped.find((s) => s.projectId === draft.id);
    if (skipped) {
      return { kind: "skipped", reason: skipped.reason } as const;
    }
    return { kind: "ok", clashes } as const;
  }, [projects, segments, draft]);

  const departmentName = (id: string): string =>
    departments.find((d) => d.id === id)?.name ?? "Unknown department";
  const roadName =
    segments.find((s) => s.id === draft.road_segment_id)?.name ?? null;

  return (
    <section
      aria-labelledby="clash-preview-heading"
      className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="clash-preview-heading" className="text-sm font-semibold">
          Live clash preview
        </h2>
        <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          checks as you type
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
        Against the current registry{roadName ? ` on ${roadName}` : ""} — and
        any adjoining road within 50 m.
      </p>

      {preview.kind === "cancelled" ? (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Cancelled projects are excluded from clash detection, so nothing is
          checked for this draft.
        </p>
      ) : null}

      {preview.kind === "skipped" ? (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span className="font-semibold">Preview paused — </span>
          {SKIPPED_HINTS[preview.reason] ?? "This draft could not be evaluated."}
        </p>
      ) : null}

      {preview.kind === "ok" && preview.clashes.length === 0 ? (
        <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          No clashes with the current registry on this road. The proposed
          schedule would not overlap another work or re-open a recently
          restored stretch.
        </p>
      ) : null}

      {preview.kind === "ok" && preview.clashes.length > 0 ? (
        <>
          <p className="sr-only" aria-live="polite">
            {preview.clashes.length} clash
            {preview.clashes.length === 1 ? "" : "es"} with the current registry
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {preview.clashes.map((clash) => {
              const other =
                clash.projectA.id === draft.id ? clash.projectB : clash.projectA;
              const otherName = other.title?.trim() || other.id;
              return (
                <li
                  key={clash.id}
                  className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={clash.severity} />
                    <ClashTypeBadge type={clash.type} />
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">{otherName}</span>
                    <span className="text-neutral-500">
                      {" "}
                      · {departmentName(other.department_id)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {CLASH_TYPE_HINTS[clash.type]} {clash.explanation}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
                    {clash.overlapDays !== undefined
                      ? `${clash.overlapDays} day${clash.overlapDays === 1 ? "" : "s"} of overlap · `
                      : ""}
                    {clash.gapDays !== undefined
                      ? `${clash.gapDays} day${clash.gapDays === 1 ? "" : "s"} after restoration · `
                      : ""}
                    {clash.estimatedWasteInr !== undefined
                      ? `${formatINR(clash.estimatedWasteInr)} at risk (simulated)`
                      : ""}
                  </p>
                  <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-900 dark:bg-blue-950">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
                      Coordination suggestion
                    </p>
                    <p className="mt-0.5 text-sm text-blue-950 dark:text-blue-100">
                      {clash.suggestion}
                      {clash.proposedStart && clash.proposedEnd
                        ? ` Propose ${formatDate(clash.proposedStart)} – ${formatDate(clash.proposedEnd)}.`
                        : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            All registry data and savings figures are simulated.
          </p>
        </>
      ) : null}
    </section>
  );
}