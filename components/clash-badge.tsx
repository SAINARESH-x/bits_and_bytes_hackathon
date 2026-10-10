import type { ClashType, Severity } from "@/lib/clash/types";
import { CLASH_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/clash/types";

/**
 * Badges for the clash engine's two enums, in one place so the /clashes page,
 * the project detail page and the map cannot drift apart.
 *
 * Every badge pairs colour with a symbol and a word — colour alone fails on a
 * projector, in greyscale and for colour-vision-deficient viewers, and the
 * clash badge is the one thing on a crowded map that must not be missable.
 *
 * No hooks and no engine imports, so this module is usable from both server
 * and client components (and stays tiny in the client bundle).
 */

const CHIP =
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export const SEVERITY_STYLES: Record<Severity, string> = {
  high: "bg-red-100 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
  medium:
    "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  low: "bg-neutral-100 text-neutral-700 ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700",
};

/** Ring colour for a whole card, matching the badge for that severity. */
export const SEVERITY_CARD_RING: Record<Severity, string> = {
  high: "border-red-300 dark:border-red-900",
  medium: "border-amber-300 dark:border-amber-900",
  low: "border-neutral-200 dark:border-neutral-800",
};

export const SEVERITY_SYMBOLS: Record<Severity, string> = {
  high: "▲",
  medium: "◆",
  low: "●",
};

const TYPE_STYLES: Record<ClashType, string> = {
  CONCURRENT_OVERLAP:
    "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  REPEAT_DIG:
    "bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
};

const TYPE_SYMBOLS: Record<ClashType, string> = {
  CONCURRENT_OVERLAP: "⇄",
  REPEAT_DIG: "↻",
};

export function SeverityBadge({
  severity,
  className = "",
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span className={`${CHIP} ${SEVERITY_STYLES[severity]} ${className}`}>
      <span aria-hidden="true">{SEVERITY_SYMBOLS[severity]}</span>
      {SEVERITY_LABELS[severity]} severity
    </span>
  );
}

export function ClashTypeBadge({ type }: { type: ClashType }) {
  return (
    <span className={`${CHIP} ${TYPE_STYLES[type]}`}>
      <span aria-hidden="true">{TYPE_SYMBOLS[type]}</span>
      {CLASH_TYPE_LABELS[type]}
    </span>
  );
}

/** "⚠ 3 clashes" — used on lists and on the project detail page. */
export function ClashCountBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`${CHIP} bg-red-100 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800 ${className}`}
    >
      <span aria-hidden="true">⚠</span>
      {count} clash{count === 1 ? "" : "es"}
    </span>
  );
}

/** Severity of the worst clash in a group — drives a section heading's tone. */
export function worstSeverity(severities: readonly Severity[]): Severity {
  if (severities.includes("high")) return "high";
  if (severities.includes("medium")) return "medium";
  return "low";
}

/**
 * Markup for the Leaflet `divIcon` drawn at the midpoint of a flagged line.
 *
 * Hand-written HTML rather than JSX because Leaflet builds markers outside
 * React; the matching `.clash-marker` rules live in `app/globals.css`.
 */
export function clashMarkerHtml(count: number): string {
  const label = `${count} clash alert${count === 1 ? "" : "s"}`;
  return `<span class="clash-marker" role="img" aria-label="${label}">⚠ ${count}</span>`;
}
