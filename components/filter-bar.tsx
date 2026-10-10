"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PROJECT_TYPES,
  SORT_KEYS,
  STATUSES,
  hasActiveFilters,
  mergeFilterParams,
  parseFilters,
  type FilterState,
} from "@/lib/filters";
import { PROJECT_TYPE_LABELS, STATUS_LABELS } from "@/lib/format";
import type { Department } from "@/lib/types";

/**
 * Filter state lives in the URL, not in React state — that is what makes a
 * filtered view shareable and what keeps /map and /projects in agreement.
 * Every control here is a thin writer into the query string; nothing is
 * authoritative except the URL itself.
 *
 * `router.replace` (not push) so a typo in the search box does not fill the
 * back stack, and `scroll: false` so changing a dropdown does not yank the
 * map out from under the cursor.
 */
export function useFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const queryString = searchParams.toString();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(queryString)),
    [queryString],
  );

  const navigate = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setFilters = useCallback(
    (patch: Partial<FilterState>) => {
      const current = new URLSearchParams(queryString);
      navigate(mergeFilterParams(current, { ...parseFilters(current), ...patch }));
    },
    [navigate, queryString],
  );

  /** For params this module does not own, e.g. the disruptions ward. */
  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(queryString);
      if (value) next.set(key, value);
      else next.delete(key);
      navigate(next);
    },
    [navigate, queryString],
  );

  /** Reset the narrowing but keep the viewer's sort preference. */
  const clearFilters = useCallback(() => {
    setFilters({
      department: "all",
      status: "all",
      type: "all",
      ward: "all",
      from: "",
      to: "",
      q: "",
    });
  }, [setFilters]);

  return { filters, setFilters, setParam, clearFilters, isPending, queryString };
}

const CONTROL =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

const LABEL =
  "mb-1 block whitespace-nowrap text-xs font-medium text-neutral-700 dark:text-neutral-300";

interface FilterBarProps {
  departments: readonly Department[];
  /** Ward names derived from road segments, already unique and sorted. */
  wards: readonly string[];
}

/**
 * The one filter form, rendered by both /map and /projects so the two views
 * cannot drift apart. Every field is a labelled native control — keyboard
 * reachable, screen-reader announced, and it still works when JS is slow.
 */
export function FilterBar({ departments, wards }: FilterBarProps) {
  const { filters, setFilters, clearFilters, isPending } = useFilters();
  const [draft, setDraft] = useState(filters.q);

  // External changes to the URL (Clear, back button, a shared link) win over
  // whatever is still sitting in the text box.
  useEffect(() => {
    setDraft(filters.q);
  }, [filters.q]);

  // Debounced commit: one history entry per phrase rather than per keystroke.
  useEffect(() => {
    if (draft === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, filters.q, setFilters]);

  const active = hasActiveFilters(filters);
  const anyPending = isPending;

  return (
    <form
      aria-label="Filter projects"
      onSubmit={(event) => event.preventDefault()}
      className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Filters</h2>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!active}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium enabled:hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:border-neutral-700 dark:enabled:hover:bg-neutral-800"
        >
          Clear all
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={LABEL} htmlFor="filter-q">
            Search
          </label>
          <input
            id="filter-q"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search title, purpose, road, ward, contractor…"
            autoComplete="off"
            className={CONTROL}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-dept">
            Department
          </label>
          <select
            id="filter-dept"
            value={filters.department}
            onChange={(event) => setFilters({ department: event.target.value })}
            className={CONTROL}
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-status">
            Status
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(event) =>
              setFilters({ status: event.target.value as FilterState["status"] })
            }
            className={CONTROL}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-type">
            Project type
          </label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(event) =>
              setFilters({ type: event.target.value as FilterState["type"] })
            }
            className={CONTROL}
          >
            <option value="all">All types</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-ward">
            Ward
          </label>
          <select
            id="filter-ward"
            value={filters.ward}
            onChange={(event) => setFilters({ ward: event.target.value })}
            className={CONTROL}
          >
            <option value="all">All wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-from">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => setFilters({ from: event.target.value })}
            className={CONTROL}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="filter-to">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilters({ to: event.target.value })}
            className={CONTROL}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {anyPending ? "Updating results…" : ""}
      </p>
    </form>
  );
}

/** Sort dropdown for the non-table (mobile/card) rendering of the list. */
export function SortSelect() {
  const { filters, setFilters } = useFilters();
  const label: Record<string, string> = {
    title: "Title",
    status: "Status",
    planned_start: "Planned start",
    planned_end: "Planned end",
    department: "Department",
    ward: "Ward",
    budget: "Budget",
  };
  return (
    <div className="flex items-center gap-2">
      <label className={LABEL} htmlFor="sort-key">
        Sort by
      </label>
      <select
        id="sort-key"
        value={filters.sort}
        onChange={(event) =>
          setFilters({ sort: event.target.value as FilterState["sort"] })
        }
        className={`${CONTROL} w-auto`}
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {label[key]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setFilters({ dir: filters.dir === "asc" ? "desc" : "asc" })}
        aria-label={
          filters.dir === "asc" ? "Sort ascending. Switch to descending" : "Sort descending. Switch to ascending"
        }
        className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{filters.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </div>
  );
}
