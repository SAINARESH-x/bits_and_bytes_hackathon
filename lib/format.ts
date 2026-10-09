import type {
  DelayReason,
  ProjectStatus,
  ProjectType,
  ReportType,
} from "@/lib/types";

/** Human labels for the enum values stored in the DB. */
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  road: "Road",
  drain: "Drain",
  water_pipeline: "Water pipeline",
  power_cable: "Power cable",
  fibre: "Fibre",
  other: "Other",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  stalled: "Stalled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  contractor_delay: "Contractor delay",
  monsoon: "Monsoon",
  permit_pending: "Permit pending",
  material_shortage: "Material shortage",
  utility_conflict: "Utility conflict",
  redesign: "Redesign",
  budget_held: "Budget held",
  unforeseen_ground_condition: "Unforeseen ground condition",
  other: "Other",
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  pothole: "Pothole",
  open_trench: "Open trench",
  damaged_structure: "Damaged structure",
  blocked_drain: "Blocked drain",
  waterlogging: "Waterlogging",
  debris_obstruction: "Debris obstruction",
  unsafe_opening: "Unsafe opening",
  unlisted_digging: "Unlisted digging",
  other: "Other",
};

/**
 * Tailwind classes per status. Kept as a map rather than a function so the
 * class strings stay statically analysable (a conditional chain of template
 * literals would be dropped by the Tailwind scanner).
 */
export const STATUS_STYLES: Record<ProjectStatus, string> = {
  planned: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  stalled: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

/** "2026-10-10" -> "10 Oct 2026". Accepts null and renders a dash. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from today. Negative = in the past. */
export function daysFromToday(value: string): number {
  const target = new Date(`${value}T00:00:00Z`).getTime();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

/** "in 21 days" / "12 days ago" / "today". */
export function relativeDays(value: string | null | undefined): string {
  if (!value) return "";
  const n = daysFromToday(value);
  if (n === 0) return "today";
  if (n > 0) return `in ${n} day${n === 1 ? "" : "s"}`;
  return `${Math.abs(n)} day${n === -1 ? "" : "s"} ago`;
}

/** INR with lakh/crore grouping, e.g. ₹42,00,000. */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * How late a project is against its own plan, in days.
 * 0 means on time or no baseline to compare against.
 */
export function overrunDays(project: {
  planned_end: string | null;
  actual_end: string | null;
  status: ProjectStatus;
}): number {
  if (!project.planned_end) return 0;
  // Still open: compare the plan against today.
  const end = project.actual_end ?? new Date().toISOString().slice(0, 10);
  if (project.status === "cancelled") return 0;
  const diff = Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() -
      new Date(`${project.planned_end}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return diff > 0 ? diff : 0;
}
