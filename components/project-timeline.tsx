import {
  STATUS_LABELS,
  formatDate,
  overrunDays,
  relativeDays,
  todayISO,
} from "@/lib/format";
import type { Project } from "@/lib/types";

const DAY = 86_400_000;

/** Orange hatch over the stretch that ran past the planned end. */
const DELAY_HATCH =
  "repeating-linear-gradient(45deg, rgba(234,88,12,0) 0 4px, rgba(234,88,12,0.5) 4px 8px)";

function toTime(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function toISO(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * PLANNED vs ACTUAL drawn on one shared time axis.
 *
 * Two columns of dates make a reader do the arithmetic themselves; putting
 * both bars on the same axis shows the answer instead — you can see an actual
 * bar running past the end of the planned one, and the hatched band says
 * exactly how much time that cost.
 *
 * The bars are `aria-hidden`: every value they encode is repeated verbatim in
 * the text summary underneath, so a screen reader gets the facts once, in a
 * form it can actually use, rather than a second vague announcement.
 */
export function ProjectTimeline({ project }: { project: Project }) {
  const plannedStart = toTime(project.planned_start);
  const plannedEnd = toTime(project.planned_end);
  const actualStart = toTime(project.actual_start);
  const actualEnd = toTime(project.actual_end);
  const today = toTime(todayISO()) ?? Date.now();

  const known = [plannedStart, plannedEnd, actualStart, actualEnd].filter(
    (t): t is number => t !== null,
  );

  const delayDays = overrunDays(project);
  const cancelled = project.status === "cancelled";
  // Still digging: draw the actual bar up to today, not to a fictional end.
  const openWork =
    project.status === "in_progress" || project.status === "stalled";

  const summary = (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
      <div>
        <dt className="text-xs text-neutral-500 dark:text-neutral-500">Planned</dt>
        <dd className="mt-0.5 text-sm font-medium">
          {formatDate(project.planned_start)} – {formatDate(project.planned_end)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-neutral-500 dark:text-neutral-500">Actual</dt>
        <dd className="mt-0.5 text-sm font-medium">
          {project.actual_start || project.actual_end
            ? `${formatDate(project.actual_start)} – ${
                project.actual_end
                  ? formatDate(project.actual_end)
                  : openWork
                    ? "in progress"
                    : formatDate(null)
              }`
            : "Not started"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-neutral-500 dark:text-neutral-500">Delay</dt>
        <dd className="mt-0.5 text-sm font-medium">
          {cancelled ? (
            "—"
          ) : delayDays > 0 ? (
            <span className="text-orange-700 dark:text-orange-400">
              {delayDays} day{delayDays === 1 ? "" : "s"} past planned end
            </span>
          ) : project.status === "completed" ? (
            "Completed on plan"
          ) : (
            "On plan"
          )}
        </dd>
      </div>
    </dl>
  );

  if (known.length === 0) {
    return (
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">
          Planned vs actual
        </h2>
        <div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          No dates have been recorded for this project yet, so there is nothing
          to compare.
        </div>
      </section>
    );
  }

  let rangeStart = Math.min(...known);
  let rangeEnd = Math.max(...known);
  if (openWork) {
    rangeStart = Math.min(rangeStart, today);
    rangeEnd = Math.max(rangeEnd, today);
  }
  // A same-day project would divide by zero; give it a day of runway.
  if (rangeEnd - rangeStart < DAY) rangeEnd = rangeStart + DAY;
  const span = rangeEnd - rangeStart;

  const pct = (t: number) => ((t - rangeStart) / span) * 100;

  /** Bar geometry, clamped so a bad row can never paint outside the track. */
  function bar(from: number, to: number) {
    const left = Math.min(100, Math.max(0, pct(from)));
    const right = Math.min(100, Math.max(0, pct(to)));
    return { left, width: Math.max(1.2, right - left) };
  }

  const plannedBar =
    plannedStart === null ? null : bar(plannedStart, plannedEnd ?? plannedStart + DAY);
  const actualBar =
    actualStart === null
      ? null
      : bar(
          actualStart,
          actualEnd ?? (openWork ? today : actualStart + DAY),
        );
  const delayBand =
    delayDays > 0 && plannedEnd !== null && !cancelled
      ? bar(plannedEnd, Math.max(actualEnd ?? today, plannedEnd))
      : null;
  const showToday = today >= rangeStart && today <= rangeEnd && !cancelled;

  const todayMarker = showToday ? (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 border-l-2 border-dashed border-neutral-500 dark:border-neutral-400"
      style={{ left: `${pct(today)}%` }}
    />
  ) : null;

  return (
    <section aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">
        Planned vs actual
      </h2>

      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div aria-hidden="true" className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Planned
            </span>
            <div className="relative h-7 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
              {delayBand ? (
                <span
                  className="absolute inset-y-0"
                  style={{ left: `${delayBand.left}%`, width: `${delayBand.width}%`, background: DELAY_HATCH }}
                />
              ) : null}
              {plannedBar ? (
                <span
                  className="absolute inset-y-1 rounded border-2 border-sky-600 bg-sky-100 dark:bg-sky-950"
                  style={{ left: `${plannedBar.left}%`, width: `${plannedBar.width}%` }}
                />
              ) : null}
              {todayMarker}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Actual
            </span>
            <div className="relative h-7 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
              {delayBand ? (
                <span
                  className="absolute inset-y-0"
                  style={{ left: `${delayBand.left}%`, width: `${delayBand.width}%`, background: DELAY_HATCH }}
                />
              ) : null}
              {actualBar ? (
                <span
                  className="absolute inset-y-1 rounded bg-blue-600"
                  style={{ left: `${actualBar.left}%`, width: `${actualBar.width}%` }}
                />
              ) : null}
              {todayMarker}
            </div>
          </div>

          {/* Axis: the two ends of the window the bars are drawn inside. */}
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0" />
            <div className="flex flex-1 justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <time dateTime={toISO(rangeStart)}>{formatDate(toISO(rangeStart))}</time>
              <time dateTime={toISO(rangeEnd)}>{formatDate(toISO(rangeEnd))}</time>
            </div>
          </div>
        </div>

        {/* Non-visual key for the same information the bars encode. */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-6 rounded border-2 border-sky-600" />
            Planned window
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-6 rounded bg-blue-600" />
            Actual window
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-6 rounded"
              style={{ background: DELAY_HATCH }}
            />
            Past planned end
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 border-l-2 border-dashed border-neutral-500 dark:border-neutral-400"
            />
            Today
          </li>
        </ul>

        {summary}

        {delayDays > 0 && !cancelled ? (
          <p className="mt-3 rounded-lg bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            Running {delayDays} day{delayDays === 1 ? "" : "s"} past the planned
            end
            {project.planned_end ? ` (${relativeDays(project.planned_end)})` : ""}.
          </p>
        ) : null}
      </div>

      <p className="sr-only">
        Current status: {STATUS_LABELS[project.status]}.
      </p>
    </section>
  );
}
