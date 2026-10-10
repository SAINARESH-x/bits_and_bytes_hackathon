"use client";

import { useMemo, useState } from "react";
import type { DepartmentScoreRow } from "@/lib/dashboard-metrics";

/**
 * Sortable per-department scorecard (PLAN.md M7 item 2).
 *
 * The rows arrive pre-computed from the server (lib/dashboard.ts); all this
 * component does is re-order them in memory. Column headers are real buttons
 * with `aria-sort`, so the sort controls work for keyboard users and the
 * table itself is a plain `<table>` for everyone else.
 */

type SortKey =
  | "departmentName"
  | "projects"
  | "onTimePercent"
  | "averageDelayDays"
  | "clashCount"
  | "contestedCount";

interface Column {
  key: SortKey;
  label: string;
  /** Numeric columns sort leading with the highest value. */
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: "departmentName", label: "Department" },
  { key: "projects", label: "Projects", numeric: true },
  { key: "onTimePercent", label: "On-time %", numeric: true },
  { key: "averageDelayDays", label: "Avg delay (days)", numeric: true },
  { key: "clashCount", label: "Clashes", numeric: true },
  { key: "contestedCount", label: "Contested", numeric: true },
];

function cellValue(row: DepartmentScoreRow, key: SortKey): number | string | null {
  switch (key) {
    case "departmentName":
      return row.departmentName;
    case "projects":
      return row.projects;
    case "onTimePercent":
      return row.onTimePercent;
    case "averageDelayDays":
      return row.averageDelayDays;
    case "clashCount":
      return row.clashCount;
    case "contestedCount":
      return row.contestedCount;
  }
}

function formatCell(value: number | string | null, key: SortKey): string {
  if (value === null) return "—";
  if (key === "onTimePercent") return `${value}%`;
  if (key === "averageDelayDays") return `${value}`;
  return String(value);
}

export function DepartmentScorecard({
  rows,
}: {
  rows: DepartmentScoreRow[];
}) {
  // Default: department name, A–Z. Clicking a numeric column starts descending
  // (the worst performers at the top is the view that matters here); clicking
  // the same column again flips direction.
  const [sortKey, setSortKey] = useState<SortKey>("departmentName");
  const [direction, setDirection] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = cellValue(a, sortKey);
      const bv = cellValue(b, sortKey);
      // Nulls always go last, whichever direction is active.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return a.departmentName.localeCompare(b.departmentName);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return cmp * direction;
    });
    return copy;
  }, [rows, sortKey, direction]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === 1 ? -1 : 1) as 1 | -1);
      return;
    }
    setSortKey(key);
    setDirection((COLUMNS.find((c) => c.key === key)?.numeric ? -1 : 1) as 1 | -1);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">
          Per-department performance scorecard: projects, on-time percentage,
          average delay in days, clash count and contested completions. Use the
          column headers to sort.
        </caption>
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {COLUMNS.map((column) => {
              const active = sortKey === column.key;
              const ariaSort = active
                ? direction === 1
                  ? "ascending"
                  : "descending"
                : "none";
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className="border-b border-neutral-200 p-3 text-left dark:border-neutral-800"
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={`inline-flex items-center gap-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      active
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
                    }`}
                  >
                    {column.label}
                    <span aria-hidden="true" className="text-xs">
                      {active ? (direction === 1 ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.departmentId}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
            >
              <th
                scope="row"
                className="p-3 text-left font-medium text-neutral-900 dark:text-neutral-50"
              >
                {row.departmentName}
                <span className="block text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {row.code}
                </span>
              </th>
              {(
                [
                  "projects",
                  "onTimePercent",
                  "averageDelayDays",
                  "clashCount",
                  "contestedCount",
                ] as const
              ).map((key) => (
                <td
                  key={key}
                  className="p-3 tabular-nums text-neutral-700 dark:text-neutral-300"
                >
                  {formatCell(cellValue(row, key), key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}