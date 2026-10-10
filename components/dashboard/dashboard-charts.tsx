"use client";

import dynamic from "next/dynamic";
import type { DashboardChartsProps } from "./charts-recharts";

/**
 * Charts are only safe in the browser — Recharts touches `window` when it
 * sizes itself — so the panels load through `next/dynamic({ ssr: false })`,
 * the same trick as the Leaflet maps. While the chunk loads (or if scripts are
 * disabled) the page still shows the data tables that sit next to each chart,
 * so nothing is lost without JavaScript.
 */

const ChartsRecharts = dynamic(
  () => import("./charts-recharts").then((m) => m.DashboardCharts),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-live="polite"
      >
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span className="sr-only">Loading charts…</span>
          </div>
        ))}
      </div>
    ),
  },
);

export function DashboardCharts(props: DashboardChartsProps) {
  return <ChartsRecharts {...props} />;
}