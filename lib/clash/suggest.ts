import type { Clash, Project } from "./types";
import {
  formatDayLabel,
  resolveWorkWindow,
  toISODay,
  type WorkWindow,
} from "./window";

/**
 * Coordination proposals.
 *
 * Pure and total: given a clash it returns text and a window, and it never
 * mutates the clash or the projects inside it. If the underlying dates cannot
 * be resolved the proposal degrades to advice without numbers rather than
 * throwing — a suggestion is a bonus, it must never be the reason a clash
 * board fails to render.
 *
 * Every rupee figure here is an ESTIMATE of simulated budgets, and the label
 * "(simulated estimate)" travels with the text so no caller can show the
 * number without the caveat.
 */

/** Share of the smaller budget thrown away when a restored road is re-opened. */
export const REPEAT_DIG_WASTE_RATIO = 0.6;

/** Share saved by one shared trench plus one traffic-management setup. */
export const SHARED_TRENCH_SAVING_RATIO = 0.35;

/**
 * Used when neither work records a budget, so a suggestion is never "save
 * ₹0". Roughly the cost of resurfacing ~60 m of city carriageway.
 */
export const FALLBACK_BUDGET_INR = 1_500_000;

export const SIMULATED_LABEL = "(simulated estimate)";

export interface ProposedWindow {
  start: string;
  end: string;
}

export interface CoordinationProposal {
  /** One or two plain sentences a coordinator can act on. */
  suggestion: string;
  /** The single window the two works should share, when there is one. */
  proposedWindow: ProposedWindow | null;
  /** True when acting on this removes one excavation. */
  savesDig: boolean;
  /** Money at stake, in rupees. Always a simulated estimate. */
  estimatedWasteInr: number | null;
  /** Machine-readable action, for anyone who wants to filter on it. */
  action: "merge" | "batch" | "coordinate";
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Same reasoning as `formatDayLabel`: the same handful of amounts is rendered
// once per clash, and `Intl` is the expensive part. Bounded to stay leak-free.
const INR_CACHE = new Map<number, string>();
const INR_CACHE_LIMIT = 4096;

export function formatInrSimulated(value: number): string {
  const rounded = Math.round(value);
  const cached = INR_CACHE.get(rounded);
  if (cached !== undefined) return cached;
  const formatted = INR.format(rounded);
  if (INR_CACHE.size >= INR_CACHE_LIMIT) INR_CACHE.clear();
  INR_CACHE.set(rounded, formatted);
  return formatted;
}

function formatDay(ms: number): string {
  return formatDayLabel(ms);
}

function label(project: Project): string {
  return project.title?.trim() ? project.title : `project ${project.id}`;
}

function budgetOf(project: Project): number | null {
  const value = project.budget_inr;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function smallerBudget(a: Project, b: Project): number {
  const budgetA = budgetOf(a);
  const budgetB = budgetOf(b);
  if (budgetA === null && budgetB === null) return FALLBACK_BUDGET_INR;
  if (budgetA === null) return budgetB as number;
  if (budgetB === null) return budgetA;
  return Math.min(budgetA, budgetB);
}

function windowOf(project: Project): WorkWindow | null {
  const resolution = resolveWorkWindow(project);
  return resolution.ok ? resolution.window : null;
}

export function proposeCoordination(clash: Clash): CoordinationProposal {
  const first = clash.projectA;
  const second = clash.projectB;

  const windowA = windowOf(first);
  const windowB = windowOf(second);

  if (!windowA || !windowB) {
    return {
      suggestion: `Dates for one of these works could not be read, so no coordinated window can be proposed yet. ${first.title ?? ""} ${second.title ?? ""}`.trim(),
      proposedWindow: null,
      savesDig: false,
      estimatedWasteInr: null,
      action: "coordinate",
    };
  }

  const money = Math.round(
    smallerBudget(first, second) *
      (clash.type === "REPEAT_DIG" ? REPEAT_DIG_WASTE_RATIO : SHARED_TRENCH_SAVING_RATIO),
  );

  if (clash.type === "CONCURRENT_OVERLAP") {
    // One window that contains both: the road is opened once, two crews work
    // inside it, and it is restored once.
    const start = Math.min(windowA.start, windowB.start);
    const end = Math.max(windowA.end, windowB.end);
    return {
      suggestion:
        `Run ${label(second)} together with ${label(first)} in a single window, ` +
        `${formatDay(start)} – ${formatDay(end)}. One shared trench and one set of ` +
        `barricades replace two, saving about ${formatInrSimulated(money)} ${SIMULATED_LABEL}.`,
      proposedWindow: { start: toISODay(start), end: toISODay(end) },
      savesDig: true,
      estimatedWasteInr: money,
      action: "merge",
    };
  }

  // REPEAT_DIG. The second work re-opens a road the first one restored.
  const sharedStart = Math.min(windowA.start, windowB.start);
  const sharedEnd = Math.max(windowA.end, windowB.end);
  const gap = clash.gapDays ?? 0;

  if (first.status === "completed" || first.status === "cancelled") {
    // The first work is already finished, so there is nothing left to merge
    // with. The useful advice is to stop the second dig from standing alone.
    return {
      suggestion:
        `${label(second)} re-opens a road that ${label(first)} restored ${gap} day` +
        `${gap === 1 ? "" : "s"} earlier. Batch it with the next planned work on this ` +
        `road, or move both into one window next time — otherwise about ` +
        `${formatInrSimulated(money)} spent restoring this stretch is dug up again ` +
        `${SIMULATED_LABEL}.`,
      proposedWindow: { start: toISODay(sharedStart), end: toISODay(sharedEnd) },
      savesDig: true,
      estimatedWasteInr: money,
      action: "batch",
    };
  }

  return {
    suggestion:
      `Bring ${label(second)} forward to start with ${label(first)}, in one window ` +
      `of ${formatDay(sharedStart)} – ${formatDay(sharedEnd)}, so the road is dug and ` +
      `restored once. Waiting ${gap} day${gap === 1 ? "" : "s"} costs about ` +
      `${formatInrSimulated(money)} ${SIMULATED_LABEL}.`,
    proposedWindow: { start: toISODay(sharedStart), end: toISODay(sharedEnd) },
    savesDig: true,
    estimatedWasteInr: money,
    action: "merge",
  };
}
