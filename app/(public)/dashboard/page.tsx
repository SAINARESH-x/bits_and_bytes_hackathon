import Link from "next/link";
import { ContestedBadge } from "@/components/contested-badge";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DepartmentScorecard } from "@/components/dashboard/department-scorecard";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { WasteFigure } from "@/components/dashboard/waste-figure";
import { EmptyState } from "@/components/states";
import { DEFAULT_REPEAT_DIG_WINDOW_DAYS } from "@/lib/clash";
import { loadDashboardData } from "@/lib/dashboard";
import { STATUS_LABELS, formatDate } from "@/lib/format";

export const metadata = { title: "Dashboard — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Transparency dashboard (PLAN.md M7).
 *
 * Everything is computed server-side over `lib/data.ts` (demo mode falls back
 * to data/seed.json, so the page needs no database or API key), then handed to
 * small presentational components. The only client code is the sortable
 * scorecard table and the Recharts panels (loaded `ssr:false`); each chart has
 * a plain data table beside it as a text alternative.
 */
export default async function DashboardPage() {
  const dashboard = await loadDashboardData();
  const {
    kpis,
    scorecard,
    statuses,
    monthlyNewWorks,
    departmentDelays,
    repeatDigWasteInr,
    repeatDigClashCount,
    contested,
    mode,
    generatedAt,
  } = dashboard;

  if (kpis.totalProjects === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Transparency signals for the registry.
          </p>
        </div>
        <EmptyState
          title="Nothing to measure yet"
          body="The registry is empty, so there are no projects, delays or clashes to report on. Once works are registered, this page fills itself in."
          action={
            <Link
              href="/console"
              className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Add a project
            </Link>
          }
        />
      </div>
    );
  }

  const generatedLabel = new Date(generatedAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Delays, repeated digs, contested completions and a per-department
          scorecard — the resident-facing view of how public works are going.
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Computed from the{" "}
          {mode === "demo"
            ? "simulated registry (data/seed.json)"
            : "registry database"}{" "}
          at {generatedLabel} UTC.
        </p>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI cards                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="kpis-heading" className="flex flex-col gap-3">
        <h2 id="kpis-heading" className="sr-only">
          Key indicators
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            label="Active projects"
            value={String(kpis.activeProjects)}
            detail="in progress + stalled"
          />
          <KpiCard
            label="% delayed"
            value={`${kpis.delayedPercent.toFixed(1)}%`}
            detail={
              kpis.delayedBase === 0
                ? "no project has a planned end date"
                : `${kpis.delayedCount} of ${kpis.delayedBase} past their planned end`
            }
            tone={kpis.delayedPercent > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Average delay"
            value={`${kpis.averageDelayDays.toFixed(1)} days`}
            detail={`mean over ${kpis.delayedCount} delayed project${
              kpis.delayedCount === 1 ? "" : "s"
            }`}
            tone={kpis.averageDelayDays > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Open clashes"
            value={String(kpis.openClashes)}
            detail="flagged by the clash engine"
            tone={kpis.openClashes > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Repeat digs"
            value={String(kpis.repeatDigCount)}
            detail={`within ${DEFAULT_REPEAT_DIG_WINDOW_DAYS}-day window`}
            tone={kpis.repeatDigCount > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Contested completions"
            value={String(kpis.contestedCompletions)}
            detail="≥ 3 disputes or ≥ 40% of votes"
            tone={kpis.contestedCompletions > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Unlisted-work reports"
            value={String(kpis.unlistedReports)}
            detail="digging with no registry entry"
            tone={kpis.unlistedReports > 0 ? "warn" : "default"}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Waste from repeat digs                                             */}
      {/* ------------------------------------------------------------------ */}
      <WasteFigure
        wasteInr={repeatDigWasteInr}
        clashCount={repeatDigClashCount}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Charts + their data tables (text alternatives)                    */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="charts-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="charts-heading" className="text-lg font-semibold">
            Trends
          </h2>
          <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            How delays, statuses and the pace of new works are moving. Each
            chart has a data table below it that says the same thing without
            graphics.
          </p>
        </div>

        <DashboardCharts
          departmentDelays={departmentDelays}
          statuses={statuses}
          monthlyNewWorks={monthlyNewWorks}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ChartTable
            caption="Total delay days by department"
            headers={["Department", "Total delay (days)", "Delayed works"]}
            rows={departmentDelays.map((d) => [
              d.departmentName,
              String(d.totalDelayDays),
              String(d.delayedCount),
            ])}
            empty="No delayed projects to list."
          />
          <ChartTable
            caption="Projects by status"
            headers={["Status", "Projects"]}
            rows={statuses.map((s) => [s.label, String(s.count)])}
            empty="No projects to list."
          />
          <ChartTable
            caption="New works per month"
            headers={["Month", "New works"]}
            rows={monthlyNewWorks.map((m) => [m.label, String(m.count)])}
            empty="No works have started yet."
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Per-department scorecard                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="scorecard-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="scorecard-heading" className="text-lg font-semibold">
            Department scorecard
          </h2>
          <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            On-time rate, average delay, clashes and contested completions per
            department. Click a column header to sort — the most interesting
            view is usually clashes or average delay, highest first.
          </p>
        </div>

        {scorecard.length === 0 ? (
          <EmptyState
            title="No departments yet"
            body="Departments appear here as soon as the registry has them."
          />
        ) : (
          <DepartmentScorecard rows={scorecard} />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Contested completions (M6 slice, kept)                             */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="contested-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="contested-heading" className="text-lg font-semibold">
            Contested completions
          </h2>
          <ContestedBadge />
        </div>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Projects marked <span className="font-medium">completed</span> that at
          least 3 residents dispute, or that at least 40% of voters dispute.
          These completions should not be taken at face value.
        </p>

        {contested.length === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
          >
            No completion is currently contested. Simulations with enough
            disputes will appear here automatically.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {contested.map(({ project, confirm, dispute }) => (
              <li
                key={project.id}
                className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        {project.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {scorecard.find(
                        (row) => row.departmentId === project.department_id,
                      )?.departmentName ?? "Unknown department"}{" "}
                      · marked completed{" "}
                      {formatDate(project.actual_end ?? project.planned_end)}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      project.status === "completed"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : ""
                    }`}
                  >
                    {STATUS_LABELS[project.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {dispute}
                  </span>{" "}
                  disputes vs{" "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {confirm}
                  </span>{" "}
                  confirmations.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Small plain data table — the text alternative to a chart (AGENTS.md: charts
 * must not be the only way to read a number; also serves no-JS viewers).
 */
function ChartTable({
  caption,
  headers,
  rows,
  empty,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white text-sm dark:border-neutral-800 dark:bg-neutral-900">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
          {empty}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <caption className="border-b border-neutral-200 p-2 text-left text-xs font-semibold text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
            {caption}
          </caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="p-2 text-left font-medium text-neutral-600 dark:text-neutral-400"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr
                key={cells[0]}
                className={
                  i % 2 === 0
                    ? "bg-neutral-50 dark:bg-neutral-900"
                    : "bg-white dark:bg-neutral-950"
                }
              >
                {cells.map((cell, j) => (
                  <td
                    key={j}
                    className={`p-2 ${
                      j === 0
                        ? "font-medium text-neutral-900 dark:text-neutral-50"
                        : "tabular-nums text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}