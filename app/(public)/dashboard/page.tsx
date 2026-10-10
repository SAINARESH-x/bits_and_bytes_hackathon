import Link from "next/link";
import { ContestedBadge } from "@/components/contested-badge";
import { Placeholder } from "@/components/placeholder";
import { isContested, tally } from "@/lib/contested";
import { getDataStore } from "@/lib/data";
import { STATUS_LABELS, formatDate } from "@/lib/format";
import type { Project } from "@/lib/types";

export const metadata = { title: "Dashboard — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Dashboard (PLAN.md M6 item 5, minimal slice).
 *
 * The full M7 dashboard — delays, repeat digs and a per-department scorecard —
 * is out of scope here. The one thing M6 must surface is CONTESTED COMPLETIONS:
 * a project marked `completed` that enough residents dispute, so "done" is no
 * longer taken at face value. The rule comes from lib/contested.ts, the same
 * one the project page and the verdict API use.
 */
export default async function DashboardPage() {
  const store = await getDataStore();
  const [projects, departments, verifications] = await Promise.all([
    store.listProjects(),
    store.listDepartments(),
    store.listAllVerifications(),
  ]);

  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const votesByProject = new Map<string, typeof verifications>();
  for (const vote of verifications) {
    const list = votesByProject.get(vote.project_id);
    if (list) list.push(vote);
    else votesByProject.set(vote.project_id, [vote]);
  }

  const completed = projects.filter((p) => p.status === "completed");
  const contested: { project: Project; confirm: number; dispute: number }[] = [];
  for (const project of completed) {
    const tallyForProject = tally(votesByProject.get(project.id) ?? []);
    if (isContested(tallyForProject)) {
      contested.push({
        project,
        confirm: tallyForProject.confirm,
        dispute: tallyForProject.dispute,
      });
    }
  }
  contested.sort((a, b) => b.dispute - a.dispute);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Transparency signals for the registry. The full performance dashboard
          (delays, repeated digs and a per-department scorecard) arrives in a
          later milestone; the contested-completions view ships with the citizen
          verification feature.
        </p>
      </header>

      <section aria-labelledby="contested-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="contested-heading" className="text-lg font-semibold">
            Contested completions
          </h2>
          <ContestedBadge />
        </div>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Projects marked <span className="font-medium">completed</span> that at
          least 3 residents dispute, or that at least 40% of voters dispute.
          These completions should not be taken at face value.
        </p>

        {contested.length === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
          >
            No completion is currently contested. Simulations with enough
            disputes will appear here automatically.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {contested.map(({ project, confirm, dispute }) => (
              <li
                key={project.id}
                className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        {project.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {departmentById.get(project.department_id)?.name ??
                        "Unknown department"}{" "}
                      · marked completed{" "}
                      {formatDate(project.actual_end ?? project.planned_end)}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      project.status === "completed"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : ""
                    }`}
                  >
                    {STATUS_LABELS[project.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    {dispute}
                  </span>{" "}
                  disputes vs{" "}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {confirm}
                  </span>{" "}
                  confirmations.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Placeholder
        title="Full dashboard"
        milestone="M7"
        body="Delays, repeat digs, average overrun and a per-department scorecard. This is where a resident will see whether a department habitually overruns its plans and budget."
      />
    </div>
  );
}
