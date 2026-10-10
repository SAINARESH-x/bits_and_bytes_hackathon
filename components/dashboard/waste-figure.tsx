import {
  DEFAULT_REPEAT_DIG_WINDOW_DAYS,
  FALLBACK_BUDGET_INR,
  formatInrSimulated,
  REPEAT_DIG_WASTE_RATIO,
} from "@/lib/clash";

/**
 * "Estimated waste from avoidable repeat digs" (PLAN.md M7 item 4).
 *
 * The figure is the sum of the engine's per-clash estimates. It is a
 * SIMULATED estimate, and the label must never travel without that caveat —
 * hence the explicit "estimate based on simulated data" line (AGENTS.md "Data
 * honesty"). The formula lives in a real `<details>` disclosure, not a
 * hover-only tooltip: keyboard and screen-reader users can reach it too.
 */

export function WasteFigure({
  wasteInr,
  clashCount,
}: {
  wasteInr: number;
  clashCount: number;
}) {
  return (
    <section
      aria-labelledby="waste-heading"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="waste-heading"
            className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200"
          >
            Estimated waste from avoidable repeat digs
          </h2>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {formatInrSimulated(wasteInr)}
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Across {clashCount} repeat-dig clash
            {clashCount === 1 ? "" : "es"} flagged by the clash engine.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 self-start rounded bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/70 dark:text-amber-100">
          <span aria-hidden="true">≈</span> estimate based on simulated data
        </span>
      </div>

      <details className="mt-3 rounded border border-amber-300/70 bg-white/60 p-3 dark:border-amber-700 dark:bg-neutral-950/40">
        <summary className="cursor-pointer text-sm font-medium text-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:text-amber-100">
          How is this estimated?
        </summary>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
          For each repeat-dig clash the engine finds, the later work re-opens a
          road the earlier work just restored, inside the{" "}
          {DEFAULT_REPEAT_DIG_WINDOW_DAYS}-day window. The waste estimate is:{" "}
          <strong>
            min(budget of earlier work, budget of later work) ×{" "}
            {Math.round(REPEAT_DIG_WASTE_RATIO * 100)}%
          </strong>
          — the share of the restoration spend that is destroyed by digging it
          up again. Summed across all {clashCount} repeat-dig clash
          {clashCount === 1 ? "" : "es"}. Works with no recorded budget are
          assumed at a typical resurfacing estimate of{" "}
          {formatInrSimulated(FALLBACK_BUDGET_INR)}. These are simulated budgets
          from the demo registry — not real expenditure.
        </p>
        <p
          aria-hidden="true"
          className="mt-2 font-mono text-xs text-amber-800/70 dark:text-amber-200/70"
        >
          waste = Σ clash∈repeat_digs min(budgetA, budgetB) ×{" "}
          {REPEAT_DIG_WASTE_RATIO}
        </p>
      </details>
    </section>
  );
}