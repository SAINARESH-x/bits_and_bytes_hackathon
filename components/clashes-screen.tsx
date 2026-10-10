"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClashCard } from "@/components/clash-card";
import { SeverityBadge } from "@/components/clash-badge";
import { EmptyState } from "@/components/states";
import type { Severity } from "@/lib/clash/types";
import {
  CLASH_TYPE_HINTS,
  DEFAULT_ADJACENCY_METERS,
  DEFAULT_REPEAT_DIG_WINDOW_DAYS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from "@/lib/clash/types";
import { groupClashesBySeverity, type ClashResponse } from "@/lib/clash-view";

/** Severities, most urgent first, from the one ordering the engine defines. */
const SEVERITIES = (Object.keys(SEVERITY_ORDER) as Severity[]).sort(
  (a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b],
);

const SKIP_REASONS: Record<string, string> = {
  MISSING_DATES: "no start or end date",
  INVALID_DATES: "a date that is not a real calendar day",
  INVERTED_DATES: "an end date before its start date",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export interface ClashesScreenProps {
  initial: ClashResponse;
}

/**
 * The /clashes body.
 *
 * The server has already run the engine, so the first paint is complete — no
 * spinner, no waterfall. The client half exists for two things a static page
 * cannot do: filter the board by severity without a round trip, and re-read
 * `GET /api/clashes` on demand to prove the API and the page agree.
 */
export function ClashesScreen({ initial }: ClashesScreenProps) {
  const [data, setData] = useState<ClashResponse>(initial);
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight refresh if the reader navigates away mid-request.
  useEffect(() => () => abortRef.current?.abort(), []);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // The route is cached for a minute, so a hung request is the only real
    // failure mode; 8 s is generous for a same-origin GET.
    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)])
        : controller.signal;

    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/clashes", { cache: "no-store", signal });
      if (!response.ok) {
        throw new Error(`The clash API answered ${response.status}.`);
      }
      const next = (await response.json()) as ClashResponse;
      if (!Array.isArray(next.clashes)) {
        throw new Error("The clash API returned an unexpected shape.");
      }
      setData(next);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? `Could not refresh: ${caught.message}`
          : "Could not refresh the clash board.",
      );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(
    () =>
      severity === "all"
        ? data.clashes
        : data.clashes.filter((clash) => clash.severity === severity),
    [data.clashes, severity],
  );

  const groups = useMemo(() => groupClashesBySeverity(filtered), [filtered]);
  const generated = new Date(data.generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? "an unknown time"
    : generated.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Clash board</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              Works by different departments on the same or adjacent road, found
              by comparing start and end dates. Two rules run over the registry:{" "}
              <strong className="font-medium">concurrent overlap</strong> (same
              road, at the same time) and{" "}
              <strong className="font-medium">repeat dig</strong> (a road opened
              again within {DEFAULT_REPEAT_DIG_WINDOW_DAYS} days of being
              restored). Road segments up to {DEFAULT_ADJACENCY_METERS} m apart
              are treated as one street.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-busy={refreshing}
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {refreshing ? "Recomputing…" : "Refresh from the API"}
          </button>
        </div>

        <p className="text-xs text-neutral-500" role="status">
          Computed {generatedLabel} from{" "}
          {data.mode === "demo"
            ? "the simulated registry in data/seed.json (demo mode)"
            : "the project registry"}
          . Every record is simulated, and the figures below are simulated
          estimates — not real money.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error} The board below is the last result that loaded successfully.
          </p>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Clashes" value={String(data.counts.total)} />
        <Stat label="High" value={String(data.counts.high)} />
        <Stat label="Medium" value={String(data.counts.medium)} />
        <Stat label="Low" value={String(data.counts.low)} />
        <Stat label="3+ way clusters" value={String(data.counts.clusters)} />
        <Stat label="Not checked" value={String(data.counts.skipped)} />
      </dl>

      <div>
        <div
          role="group"
          aria-label="Filter by severity"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            aria-pressed={severity === "all"}
            onClick={() => setSeverity("all")}
            className={`rounded border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              severity === "all"
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            All ({data.counts.total})
          </button>
          {SEVERITIES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={severity === value}
              onClick={() => setSeverity(value)}
              className={`rounded border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                severity === value
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              }`}
            >
              {SEVERITY_LABELS[value]} ({data.counts[value]})
            </button>
          ))}
        </div>

        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          <span>
            <span aria-hidden="true">⇄ </span>
            {CLASH_TYPE_HINTS.CONCURRENT_OVERLAP}
          </span>
          <span>
            <span aria-hidden="true">↻ </span>
            {CLASH_TYPE_HINTS.REPEAT_DIG}
          </span>
        </p>
      </div>

      {data.counts.total === 0 ? (
        <EmptyState
          title="No clashes in the registry"
          body="Every pair of works on the same road either belongs to the same department or is far enough apart in time. That is the goal state — the engine found nothing worth coordinating."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title={`No ${severity} clashes`}
          body="Nothing in this severity band right now. Switch the filter to see the rest of the board."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section
              key={group.severity}
              aria-labelledby={`severity-${group.severity}`}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <h2
                  id={`severity-${group.severity}`}
                  className="text-lg font-semibold"
                >
                  {SEVERITY_LABELS[group.severity]} severity
                </h2>
                <SeverityBadge severity={group.severity} />
                <span className="text-sm text-neutral-500">
                  {group.clashes.length} clash
                  {group.clashes.length === 1 ? "" : "es"}
                </span>
              </div>
              {group.clashes.map((clash) => (
                <ClashCard
                  key={clash.id}
                  clash={clash}
                  projects={data.projects}
                  segments={data.segments}
                  departments={data.departments}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {data.skipped.length > 0 ? (
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <summary className="cursor-pointer text-sm font-medium text-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:text-amber-100">
            {data.skipped.length} project
            {data.skipped.length === 1 ? " was" : "s were"} not checked
          </summary>
          <p className="mt-2 text-xs text-amber-900 dark:text-amber-100">
            The engine needs a start and an end date to compare two works. These
            rows have none, so they are reported instead of being silently
            dropped or allowed to break the run.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-950 dark:text-amber-50">
            {data.skipped.map((row) => (
              <li key={row.projectId}>
                <a
                  href={`/projects/${row.projectId}`}
                  className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                >
                  {row.title || row.projectId}
                </a>{" "}
                — {SKIP_REASONS[row.reason] ?? row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
