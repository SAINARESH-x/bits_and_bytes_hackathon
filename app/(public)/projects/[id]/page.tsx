import Link from "next/link";
import { notFound } from "next/navigation";
import { getDataStore } from "@/lib/data";
import {
  DELAY_REASON_LABELS,
  PROJECT_TYPE_LABELS,
  REPORT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDate,
  formatINR,
  overrunDays,
  relativeDays,
} from "@/lib/format";

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Planned vs actual, side by side. The whole point of the registry. */
function Timeline({
  label,
  planned,
  actual,
}: {
  label: string;
  planned: { start?: string | null; end?: string | null };
  actual: { start?: string | null; end?: string | null };
}) {
  const isActual = label === "Actual";
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">{label}</h3>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-500">Start</dt>
          <dd className="font-medium">{formatDate(planned.start)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-500">End</dt>
          <dd className="font-medium">{formatDate(planned.end)}</dd>
        </div>
        {isActual && !actual.start && !actual.end ? (
          <p className="pt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Work has not started.
          </p>
        ) : null}
      </dl>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const store = await getDataStore();

  const [project, updates, verifications, segments, departments, reports] =
    await Promise.all([
      store.getProject(id),
      store.listUpdates(id),
      store.listVerifications(id),
      store.listSegments(),
      store.listDepartments(),
      store.listReports(),
    ]);

  if (!project) notFound();

  const segment = segments.find((s) => s.id === project.road_segment_id) ?? null;
  const department = departments.find((d) => d.id === project.department_id) ?? null;
  const projectReports = reports.filter((r) => r.project_id === project.id);

  const confirm = verifications.filter((v) => v.vote === "confirm").length;
  const dispute = verifications.filter((v) => v.vote === "dispute").length;
  const overdue = overrunDays(project);

  return (
    <article className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/projects"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← All projects
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status]}`}
          >
            {STATUS_LABELS[project.status]}
          </span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            simulated
          </span>
        </div>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          {project.purpose}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Department</dt>
          <dd className="mt-0.5 font-medium">{department?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Road</dt>
          <dd className="mt-0.5 font-medium">{segment?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Ward</dt>
          <dd className="mt-0.5 font-medium">{segment?.ward ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Type</dt>
          <dd className="mt-0.5 font-medium">
            {PROJECT_TYPE_LABELS[project.project_type]}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Contractor</dt>
          <dd className="mt-0.5 font-medium">{project.contractor_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Budget</dt>
          <dd className="mt-0.5 font-medium">{formatINR(project.budget_inr)}</dd>
        </div>
      </dl>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">
          Planned vs actual
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Timeline
            label="Planned"
            planned={{ start: project.planned_start, end: project.planned_end }}
            actual={{}}
          />
          <Timeline
            label="Actual"
            planned={{}}
            actual={{ start: project.actual_start, end: project.actual_end }}
          />
        </div>
        {overdue > 0 ? (
          <p className="mt-3 rounded-lg bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">
            Running {overdue} day{overdue === 1 ? "" : "s"} past the planned end
            {project.planned_end ? ` (${relativeDays(project.planned_end)})` : ""}.
          </p>
        ) : null}
      </section>

      {updates.length > 0 ? (
        <section aria-labelledby="updates-heading">
          <h2 id="updates-heading" className="mb-3 text-lg font-semibold">
            Status history
          </h2>
          <ol className="flex flex-col gap-3 border-l border-neutral-200 pl-4 dark:border-neutral-800">
            {updates.map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neutral-400" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status]}`}
                  >
                    {STATUS_LABELS[u.status]}
                  </span>
                  <time className="text-xs text-neutral-500 dark:text-neutral-500">
                    {formatDate(u.created_at.slice(0, 10))}
                  </time>
                  {u.delay_reason ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
                      {DELAY_REASON_LABELS[u.delay_reason]}
                    </span>
                  ) : null}
                  {u.new_planned_end ? (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      revised end {formatDate(u.new_planned_end)}
                    </span>
                  ) : null}
                </div>
                {u.note ? (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {u.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section aria-labelledby="updates-heading">
          <h2 id="updates-heading" className="mb-3 text-lg font-semibold">
            Status history
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No updates have been logged for this project.
          </p>
        </section>
      )}

      <section aria-labelledby="verification-heading">
        <h2 id="verification-heading" className="mb-3 text-lg font-semibold">
          Is it really done?
        </h2>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {confirm}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">confirmed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {dispute}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">disputed</p>
          </div>
        </div>
        {dispute > confirm && dispute > 0 ? (
          <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
            More residents dispute this completion than confirm it.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Voting arrives in a later milestone. These are simulated tallies.
        </p>
      </section>

      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="mb-3 text-lg font-semibold">
          Citizen reports ({projectReports.length})
        </h2>
        {projectReports.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No one has reported an issue here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projectReports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {REPORT_TYPE_LABELS[r.report_type]}
                  </span>
                  <time className="text-xs text-neutral-500 dark:text-neutral-500">
                    {formatDate(r.created_at.slice(0, 10))}
                  </time>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {r.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
