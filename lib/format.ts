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
  unsafe_barricade: "Unsafe barricade",
  work_stalled: "Work stalled",
  poor_road_restoration: "Poor road restoration",
  debris_dust_noise: "Debris / dust / noise",
  unlisted_work: "Unlisted work",
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
 * Today in the UTC calendar as YYYY-MM-DD.
 *
 * Deliberately UTC, not the server's local timezone: the clash engine
 * (lib/clash/window.ts), the seed resolver (lib/seed-dates.ts) and the
 * timestamps the store writes all use UTC midnights, so "today" must too or
 * the Upcoming panel and the console's "past its planned end" rule would
 * disagree with the engine about the same date near midnight (IST is UTC+5:30,
 * so a deployment at 23:00 local can be a different DT local and UTC day).
 * One anchor everywhere is the only way the two stay consistent.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today in UTC as YYYY-MM-DD — identical to `todayISO()` by design. The name
 * exists so callers that specifically mean "the instant the server uses for
 * date rules" can say so without implying a second clock.
 */
export function todayUTCISO(): string {
  return todayISO();
}

/** Today plus `days`, as YYYY-MM-DD, in the UTC calendar. */
export function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * How each status is drawn on the map.
 *
 * Every status gets THREE independent cues — a colour, a line pattern, and a
 * legend glyph — because colour alone fails for the ~8% of men with a colour
 * vision deficiency, in greyscale screenshots, and on a projector in a judging
 * room. The legend always shows the glyph and the pattern alongside the name.
 */
export interface MapLineStyle {
  color: string;
  /** Leaflet `dashArray`, or null for a solid line. */
  dashArray: string | null;
  weight: number;
  opacity: number;
  /** Legend glyph — the cue that survives greyscale. */
  symbol: string;
}

export const STATUS_MAP_STYLE: Record<ProjectStatus, MapLineStyle> = {
  planned: {
    color: "#7c3aed", // violet
    dashArray: "10 8",
    weight: 5,
    opacity: 0.9,
    symbol: "○",
  },
  in_progress: {
    color: "#2563eb", // blue — solid, because it is the live one
    dashArray: null,
    weight: 7,
    opacity: 1,
    symbol: "▶",
  },
  stalled: {
    color: "#ea580c", // orange
    dashArray: "2 7",
    weight: 6,
    opacity: 1,
    symbol: "⚠",
  },
  completed: {
    color: "#047857", // emerald
    dashArray: "14 5 2 5",
    weight: 5,
    opacity: 0.85,
    symbol: "✓",
  },
  cancelled: {
    color: "#64748b", // slate
    dashArray: "6 10",
    weight: 4,
    opacity: 0.7,
    symbol: "✕",
  },
};

/**
 * How late a project is against its own plan, in days.
 * 0 means on time or no baseline to compare against.
 */
export function overrunDays(
  project: {
    planned_end: string | null;
    actual_end: string | null;
    status: ProjectStatus;
  },
  /** The instant "today" is compared against. Inject for deterministic tests. */
  now: Date = new Date(),
): number {
  if (!project.planned_end) return 0;
  // Still open: compare the plan against `now` (today by default).
  const end = project.actual_end ?? now.toISOString().slice(0, 10);
  if (project.status === "cancelled") return 0;
  const diff = Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() -
      new Date(`${project.planned_end}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return diff > 0 ? diff : 0;
}
