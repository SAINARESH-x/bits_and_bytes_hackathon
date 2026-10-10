import Link from "next/link";
import { notFound } from "next/navigation";
import { ClashAlertsSection } from "@/components/clash-alerts";
import { ProjectTimeline } from "@/components/project-timeline";
import { ComingSoonSection } from "@/components/placeholder";
import { detectClashes } from "@/lib/clash";
import { clashesForProject } from "@/lib/clash-view";
import { getDataStore } from "@/lib/data";
import {
  DELAY_REASON_LABELS,
  PROJECT_TYPE_LABELS,
  REPORT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDate,
  formatINR,
} from "@/lib/format";

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Anything that cannot be an id is rejected before the data layer is touched.
 *
 * This matters for the HTTP status, not just the UI: `notFound()` called
 * before the first awaited store call still gets a real 404 out of Next's
 * streaming renderer, while one thrown after it lands in the response body
 * with the status already committed. So the cheap, certain check goes first.
 * Ids that are well-formed but absent fall through to the lookup below.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();

  const store = await getDataStore();

  const [project, updates, verifications, segments, departments, reports, projects] =
    await Promise.all([
      store.getProject(id),
      store.listUpdates(id),
      store.listVerifications(id),
      store.listSegments(),
      store.listDepartments(),
      store.listReports(),
      store.listProjects(),
    ]);

  if (!project) notFound();

  const segment = segments.find((s) => s.id === project.road_segment_id) ?? null;
  const department = departments.find((d) => d.id === project.department_id) ?? null;
  const projectReports = reports.filter((r) => r.project_id === project.id);

  // Run the engine over the whole registry, then keep only the clashes that
  // name this project: a clash is a property of a pair, so it cannot be
  // decided from one row.
  const { clashes } = detectClashes(projects, segments);
  const projectClashes = clashesForProject(clashes, project.id);

  const confirm = verifications.filter((v) => v.vote === "confirm").length;
  const dispute = verifications.filter((v) => v.vote === "dispute").length;

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

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Department</dt>
          <dd className="mt-0.5 font-medium">{department?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Contractor</dt>
          <dd className="mt-0.5 font-medium">{project.contractor_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Type</dt>
          <dd className="mt-0.5 font-medium">
            {PROJECT_TYPE_LABELS[project.project_type]}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Ward</dt>
          <dd className="mt-0.5 font-medium">{segment?.ward ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">Road</dt>
          <dd className="mt-0.5 font-medium">{segment?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500 dark:text-neutral-500">
            Budget
            <span className="ml-1 font-normal text-amber-700 dark:text-amber-400">
              (simulated)
            </span>
          </dt>
          <dd className="mt-0.5 font-medium">
            {formatINR(project.budget_inr)}
            <span className="sr-only"> — simulated figure</span>
          </dd>
        </div>
      </dl>

      <ProjectTimeline project={project} />

      <section aria-labelledby="updates-heading">
        <h2 id="updates-heading" className="mb-3 text-lg font-semibold">
          Status history
        </h2>
        {updates.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No updates have been logged for this project.
          </p>
        ) : (
          <ol className="flex flex-col gap-3 border-l border-neutral-200 pl-4 dark:border-neutral-800">
            {updates.map((u) => (
              <li key={u.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neutral-400"
                />
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
        )}
      </section>

      <ClashAlertsSection
        projectId={project.id}
        clashes={projectClashes}
        departments={departments}
      />

      <ComingSoonSection
        headingId="verification-heading"
        title="Citizen verification"
        milestone="M6"
        body="Residents will be able to confirm or dispute that a completed job is really done, one vote per device. Until voting ships, the current simulated tally is shown so the data behind the feature is visible now."
      >
        <div className="mt-4 flex gap-6">
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
      </ComingSoonSection>

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
