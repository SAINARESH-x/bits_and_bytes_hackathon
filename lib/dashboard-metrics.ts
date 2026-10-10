/**
 * PURE transparency-dashboard arithmetic (PLAN.md M7).
 *
 * Everything the /dashboard page shows is computed here, off plain arrays, so
 * the rules are unit-testable without a browser, a database or a clock. The
 * server-side loader (`lib/dashboard.ts`) is the only place that reaches the
 * data layer; this module does not know Supabase or `data/seed.json` exist.
 *
 * Definitions (documented once, used everywhere):
 *  - "active"            = `in_progress` or `stalled` — work open on the ground.
 *  - "evaluable"         = not cancelled and has a planned end date.
 *  - "delayed"           = evaluable and finished (or still open) after its
 *                          planned end. The day count is `overrunDays` from
 *                          lib/format.ts, the same rule the console's "delay
 *                          reason required" check uses.
 *  - "on time"           = evaluable and not delayed.
 *  - "contested"         = a `completed` project whose votes meet the rule in
 *                          lib/contested.ts (>= 3 disputes or >= 40%).
 *  - "unlisted report"   = a citizen report flagged `is_unlisted_work`.
 *  - "new work" (month)  = bucketed by when the work began: its actual start,
 *                          or its planned start once the work has actually
 *                          started (a `planned` row that has not begun is not
 *                          a new work yet; cancelled rows are never new works).
 *
 * Every rupee figure is a SIMULATED estimate — the waste number travels with
 * that label and the formula is shown next to it in the UI (AGENTS.md "Data
 * honesty").
 */

import type { Clash } from "@/lib/clash/types";
import { isContested, tally } from "@/lib/contested";
import { overrunDays, STATUS_LABELS } from "@/lib/format";
import type {
  CitizenReport,
  Department,
  Project,
  ProjectStatus,
  Verification,
} from "@/lib/types";

/** Statuses that count as work currently open on the ground. */
export const ACTIVE_STATUSES: readonly ProjectStatus[] = [
  "in_progress",
  "stalled",
];

/** The order status slices always render in, so charts never jump around. */
export const STATUS_ORDER: readonly ProjectStatus[] = [
  "planned",
  "in_progress",
  "stalled",
  "completed",
  "cancelled",
];

export interface DashboardKpis {
  /** Works open on the ground right now (in progress + stalled). */
  activeProjects: number;
  /** All registry rows, including cancelled — the denominator of the registry. */
  totalProjects: number;
  /** Rows with a planned end date and not cancelled — what can be late. */
  delayedBase: number;
  delayedCount: number;
  /** 0–100, one decimal, over `delayedBase`. 0 when nothing is evaluable. */
  delayedPercent: number;
  /** Mean overrun in days across delayed projects, one decimal. 0 when none. */
  averageDelayDays: number;
  openClashes: number;
  repeatDigCount: number;
  contestedCompletions: number;
  unlistedReports: number;
}

export interface DepartmentScoreRow {
  departmentId: string;
  departmentName: string;
  code: string;
  /** Non-cancelled projects, so the scorecard matches the delay rules. */
  projects: number;
  /** 0–100, one decimal. null when the department has nothing evaluable. */
  onTimePercent: number | null;
  /** Mean overrun in days across delayed projects. null when none delayed. */
  averageDelayDays: number | null;
  delayedCount: number;
  /** Clashes this department is a party to (counted once per clash per side). */
  clashCount: number;
  /** Completed projects of this department that are contested. */
  contestedCount: number;
}

export interface StatusSlice {
  status: ProjectStatus;
  label: string;
  count: number;
}

export interface MonthlySlice {
  /** "YYYY-MM" — the sort key. */
  month: string;
  /** "Jan 26" — the axis label. */
  label: string;
  count: number;
}

export interface DepartmentDelaySlice {
  departmentId: string;
  departmentName: string;
  /** Sum of overrun days across the department's delayed projects. */
  totalDelayDays: number;
  delayedCount: number;
}

export interface ContestedCompletion {
  project: Project;
  confirm: number;
  dispute: number;
}

export interface DashboardMetrics {
  kpis: DashboardKpis;
  /** Every department, one row — departments with no projects render zeros. */
  scorecard: DepartmentScoreRow[];
  statuses: StatusSlice[];
  monthlyNewWorks: MonthlySlice[];
  /** Delayed projects only; sorted by total delay days, worst first. */
  departmentDelays: DepartmentDelaySlice[];
  /**
   * Σ min(budget A, budget B) × REPEAT_DIG_WASTE_RATIO over every repeat-dig
   * clash the engine flagged. A SIMULATED estimate — never a real figure.
   */
  repeatDigWasteInr: number;
  repeatDigClashCount: number;
  contested: ContestedCompletion[];
  generatedAt: string;
}

export interface DashboardInput {
  projects: readonly Project[];
  departments: readonly Department[];
  verifications: readonly Verification[];
  reports: readonly CitizenReport[];
  clashes: readonly Clash[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function isEvaluable(project: Project): boolean {
  return project.status !== "cancelled" && project.planned_end != null;
}

/** When the work "began", for the monthly-new-works series. See module docs. */
function startDateOf(project: Project): string | null {
  // A cancelled row is never a "new work", even if it began before cancellation.
  if (project.status === "cancelled") return null;
  if (project.actual_start) return project.actual_start;
  if (
    project.status === "in_progress" ||
    project.status === "stalled" ||
    project.status === "completed"
  ) {
    return project.planned_start;
  }
  return null;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return MONTH_LABEL.format(d);
}

export function computeDashboardMetrics(
  input: DashboardInput,
  options: { now?: Date } = {},
): DashboardMetrics {
  const now = options.now ?? new Date();
  const { projects, departments, verifications, reports, clashes } = input;

  const votesByProject = new Map<string, readonly Verification[]>();
  for (const vote of verifications) {
    const list = votesByProject.get(vote.project_id);
    if (list) votesByProject.set(vote.project_id, [...list, vote]);
    else votesByProject.set(vote.project_id, [vote]);
  }

  // ---- per-project numbers that several KPIs share -------------------------
  const delayByProject = new Map<string, number>();
  for (const project of projects) {
    if (isEvaluable(project)) delayByProject.set(project.id, overrunDays(project, now));
  }

  let activeProjects = 0;
  let delayedCount = 0;
  let delayedBase = 0;
  let delaySum = 0;

  const contested: ContestedCompletion[] = [];
  for (const project of projects) {
    if (ACTIVE_STATUSES.includes(project.status)) activeProjects += 1;

    if (isEvaluable(project)) {
      delayedBase += 1;
      const delay = delayByProject.get(project.id) ?? 0;
      if (delay > 0) {
        delayedCount += 1;
        delaySum += delay;
      }
    }

    if (project.status === "completed") {
      const tallyForProject = tally(votesByProject.get(project.id) ?? []);
      if (isContested(tallyForProject)) {
        contested.push({
          project,
          confirm: tallyForProject.confirm,
          dispute: tallyForProject.dispute,
        });
      }
    }
  }
  contested.sort((a, b) => b.dispute - a.dispute || a.project.id.localeCompare(b.project.id));

  const repeatDigClashes = clashes.filter((clash) => clash.type === "REPEAT_DIG");
  const repeatDigWasteInr = repeatDigClashes.reduce(
    (sum, clash) => sum + (clash.estimatedWasteInr ?? 0),
    0,
  );

  const departmentById = new Map(departments.map((d) => [d.id, d]));

  // ---- per-department scorecard -------------------------------------------
  const scorecard: DepartmentScoreRow[] = departments.map((department) => {
    const own = projects.filter(
      (p) =>
        p.department_id === department.id &&
        p.status !== "cancelled",
    );
    const evaluable = own.filter((p) => isEvaluable(p));
    const delayed = evaluable.filter((p) => (delayByProject.get(p.id) ?? 0) > 0);
    const onTimePercent =
      evaluable.length === 0
        ? null
        : round1(((evaluable.length - delayed.length) / evaluable.length) * 100);
    const averageDelayDays =
      delayed.length === 0
        ? null
        : round1(
            delayed.reduce((sum, p) => sum + (delayByProject.get(p.id) ?? 0), 0) /
              delayed.length,
          );
    const clashCount = clashes.filter(
      (clash) =>
        clash.projectA.department_id === department.id ||
        clash.projectB.department_id === department.id,
    ).length;
    const contestedCount = contested.filter(
      (c) => c.project.department_id === department.id,
    ).length;

    return {
      departmentId: department.id,
      departmentName: department.name,
      code: department.code,
      projects: own.length,
      onTimePercent,
      averageDelayDays,
      delayedCount: delayed.length,
      clashCount,
      contestedCount,
    };
  });
  scorecard.sort((a, b) => a.departmentName.localeCompare(b.departmentName));

  // ---- chart series --------------------------------------------------------
  const statuses: StatusSlice[] = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: projects.filter((p) => p.status === status).length,
  }));

  const byMonth = new Map<string, number>();
  for (const project of projects) {
    const start = startDateOf(project);
    if (!start) continue;
    const month = start.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const monthlyNewWorks: MonthlySlice[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, label: monthLabel(month), count }));

  const delayByDepartment = new Map<string, DepartmentDelaySlice>();
  for (const project of projects) {
    const delay = delayByProject.get(project.id) ?? 0;
    if (delay <= 0) continue;
    const department = departmentById.get(project.department_id);
    if (!department) continue;
    const slice = delayByDepartment.get(department.id) ?? {
      departmentId: department.id,
      departmentName: department.name,
      totalDelayDays: 0,
      delayedCount: 0,
    };
    slice.totalDelayDays += delay;
    slice.delayedCount += 1;
    delayByDepartment.set(department.id, slice);
  }
  const departmentDelays: DepartmentDelaySlice[] = [...delayByDepartment.values()].sort(
    (a, b) => b.totalDelayDays - a.totalDelayDays || a.departmentName.localeCompare(b.departmentName),
  );

  return {
    kpis: {
      activeProjects,
      totalProjects: projects.length,
      delayedBase,
      delayedCount,
      delayedPercent: delayedBase === 0 ? 0 : round1((delayedCount / delayedBase) * 100),
      averageDelayDays: delayedCount === 0 ? 0 : round1(delaySum / delayedCount),
      openClashes: clashes.length,
      repeatDigCount: repeatDigClashes.length,
      contestedCompletions: contested.length,
      unlistedReports: reports.filter((r) => r.is_unlisted_work).length,
    },
    scorecard,
    statuses,
    monthlyNewWorks,
    departmentDelays,
    repeatDigWasteInr,
    repeatDigClashCount: repeatDigClashes.length,
    contested,
    generatedAt: now.toISOString(),
  };
}