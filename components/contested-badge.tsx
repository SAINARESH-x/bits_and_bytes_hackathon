/**
 * "Contested" marker for a completion residents dispute (PLAN.md M6 item 5).
 *
 * Presentational only — the rule itself lives in lib/contested.ts so the badge,
 * the dashboard and the API cannot disagree. Colour is paired with a glyph and
 * a word, per the app's accessibility convention.
 */
export function ContestedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-red-100 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800 ${className}`}
    >
      <span aria-hidden="true">⚑</span>
      Contested
    </span>
  );
}
