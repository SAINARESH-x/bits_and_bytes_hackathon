import Link from "next/link";
import {
  ClashCountBadge,
  ClashTypeBadge,
  SEVERITY_CARD_RING,
  SeverityBadge,
} from "@/components/clash-badge";
import type { Clash } from "@/lib/clash/types";
import { clashAnchorId, counterpartOf } from "@/lib/clash-view";
import { formatDate, formatINR } from "@/lib/format";
import type { Department } from "@/lib/types";

interface ClashAlertsSectionProps {
  /** The project this page is about — used to name "the other work". */
  projectId: string;
  clashes: readonly Clash[];
  departments: readonly Department[];
}

/**
 * "Clash alerts" on a project page: what this work collides with, why, and
 * what the engine proposes instead.
 *
 * Server-rendered on purpose — the engine has already run, so this section is
 * in the first HTML response and needs no client JavaScript. Its job is to
 * answer one question for a citizen who landed here from the registry list:
 * *is this job about to be dug up again?*
 */
export function ClashAlertsSection({
  projectId,
  clashes,
  departments,
}: ClashAlertsSectionProps) {
  const departmentName = (id: string): string =>
    departments.find((d) => d.id === id)?.name ?? "Unknown department";

  return (
    <section aria-labelledby="clash-heading">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="clash-heading" className="text-lg font-semibold">
          Clash alerts
        </h2>
        <ClashCountBadge count={clashes.length} />
      </div>

      {clashes.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The clash engine found no conflicts involving this work right now:
          nothing else is scheduled on this road at the same time, and no other
          department is about to re-open it.{" "}
          <Link
            href="/clashes"
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            See the full clash board →
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {clashes.map((clash) => {
            const other = counterpartOf(clash, projectId);
            const otherTitle = other.title?.trim() || other.id;

            return (
              <li
                key={clash.id}
                className={`rounded-lg border bg-white p-4 dark:bg-neutral-900 ${SEVERITY_CARD_RING[clash.severity]}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={clash.severity} />
                  <ClashTypeBadge type={clash.type} />
                  {clash.clusterSize !== undefined && clash.clusterSize >= 3 ? (
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700">
                      {clash.clusterSize}-way conflict on this road
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm">
                  <span className="font-semibold">Other work: </span>
                  <Link
                    href={`/projects/${other.id}`}
                    className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    {otherTitle}
                  </Link>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {" "}
                    · {departmentName(other.department_id)}
                  </span>
                </p>

                <p className="mt-2 text-sm">
                  <span className="font-semibold">Why flagged: </span>
                  {clash.explanation}
                </p>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {clash.overlapDays !== undefined ? (
                    <div>
                      <dt className="text-neutral-500">Same time</dt>
                      <dd className="font-medium">
                        {clash.overlapDays} day
                        {clash.overlapDays === 1 ? "" : "s"} of overlap
                      </dd>
                    </div>
                  ) : null}
                  {clash.gapDays !== undefined ? (
                    <div>
                      <dt className="text-neutral-500">Gap since restoration</dt>
                      <dd className="font-medium">
                        {clash.gapDays} day{clash.gapDays === 1 ? "" : "s"}
                      </dd>
                    </div>
                  ) : null}
                  {clash.proposedStart && clash.proposedEnd ? (
                    <div>
                      <dt className="text-neutral-500">Proposed window</dt>
                      <dd className="font-medium">
                        {formatDate(clash.proposedStart)} –{" "}
                        {formatDate(clash.proposedEnd)}
                      </dd>
                    </div>
                  ) : null}
                  {clash.estimatedWasteInr !== undefined ? (
                    <div>
                      <dt className="text-neutral-500">
                        Money at risk (simulated)
                      </dt>
                      <dd className="font-medium">
                        {formatINR(clash.estimatedWasteInr)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
                    Proposed coordination
                  </p>
                  <p className="mt-1 text-sm text-blue-950 dark:text-blue-100">
                    {clash.suggestion}
                  </p>
                </div>

                <Link
                  href={`/clashes#${clashAnchorId(clash.id)}`}
                  className="mt-3 inline-block text-sm font-medium text-blue-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300"
                >
                  Open on the clash board →
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-500">
        Detection uses the planned or actual dates stored in the simulated
        registry; cost figures are simulated estimates, not real money.
      </p>
    </section>
  );
}
