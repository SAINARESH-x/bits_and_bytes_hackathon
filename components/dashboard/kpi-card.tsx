/**
 * One KPI card on the /dashboard grid.
 *
 * Presentational only — the numbers are computed server-side in
 * lib/dashboard-metrics.ts. `tone` picks an accent for numbers worth call-outs
 * (bad = red for delays/waste, good = emerald for healthy counts).
 */

export type KpiTone = "default" | "warn" | "good";

const TONE_TEXT: Record<KpiTone, string> = {
  default: "text-neutral-900 dark:text-neutral-50",
  warn: "text-red-700 dark:text-red-300",
  good: "text-emerald-700 dark:text-emerald-300",
};

export function KpiCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: KpiTone;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {detail}
        </p>
      ) : null}
    </div>
  );
}