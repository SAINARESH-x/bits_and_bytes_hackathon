"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DepartmentDelaySlice,
  MonthlySlice,
  StatusSlice,
} from "@/lib/dashboard-metrics";
import type { ProjectStatus } from "@/lib/types";

/**
 * The three Recharts panels on /dashboard (PLAN.md M7 item 3).
 *
 * Reached ONLY through `next/dynamic({ ssr: false })` (see dashboard-charts.tsx)
 * so `window` never exists when this module is evaluated — same rule as the
 * Leaflet maps. Each chart is a `<figure>` with a caption; the page renders a
 * plain data table next to each one, which is the text alternative for anyone
 * not running JavaScript or not using a charting screen reader.
 */

export interface DashboardChartsProps {
  departmentDelays: DepartmentDelaySlice[];
  statuses: StatusSlice[];
  monthlyNewWorks: MonthlySlice[];
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planned: "#7c3aed",
  in_progress: "#2563eb",
  stalled: "#ea580c",
  completed: "#047857",
  cancelled: "#64748b",
};

const AXIS_TICK = { fontSize: 11, fill: "#737373" } as const;

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <figcaption className="flex flex-col gap-1">
        <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </span>
      </figcaption>
      {children}
    </figure>
  );
}

export function DashboardCharts({
  departmentDelays,
  statuses,
  monthlyNewWorks,
}: DashboardChartsProps) {
  const delayData = departmentDelays.map((d) => ({
    name: d.departmentName,
    days: d.totalDelayDays,
  }));
  const statusData = statuses.map((s) => ({
    name: s.label,
    value: s.count,
    color: STATUS_COLORS[s.status],
  }));
  const monthData = monthlyNewWorks.map((m) => ({
    name: m.label,
    count: m.count,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Delays by department"
        description="Total delay days across delayed projects, per department."
      >
        <div className="h-72 w-full" role="img" aria-label="Bar chart of total delay days by department">
          {delayData.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No delayed projects to chart.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={delayData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={AXIS_TICK}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  formatter={(value: number | string) => [
                    `${value} day${Number(value) === 1 ? "" : "s"}`,
                    "Total delay",
                  ]}
                />
                <Bar dataKey="days" fill="#ea580c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <ChartCard
        title="Projects by status"
        description="How the registry's works are split across statuses."
      >
        <div className="h-72 w-full" role="img" aria-label="Pie chart of projects by status">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                strokeWidth={1}
              >
                {statusData.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number | string) => [value, "Projects"]} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="New works per month"
        description="Works that began in each month, by actual start (planned start once begun)."
      >
        <div className="h-64 w-full" role="img" aria-label="Bar chart of new works per month">
          {monthData.length === 0 ? (
            <p className="py-14 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No works have started yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthData}
                margin={{ top: 4, right: 16, bottom: 4, left: -14 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} />
                <YAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  formatter={(value: number | string) => [value, "New works"]}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>
    </div>
  );
}