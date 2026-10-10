import Link from "next/link";
import { ClashCountBadge } from "@/components/clash-badge";
import {
  PROJECT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDate,
  formatINR,
  relativeDays,
  todayUTCISO,
} from "@/lib/format";
import { isPastPlannedEnd } from "@/lib/schemas";
import type { Department, Project, RoadSegment } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  department: Department | null;
  segment: RoadSegment | null;
  /** Clashes this project is part of. 0 when the caller has no board. */
  clashCount?: number;
}

/**
 * One project row in the registry list. Deliberately dense: a resident should
 * answer "what, who, where, when" without opening the detail page.
 */
export function ProjectCard({
  project,
  department,
  segment,
  clashCount = 0,
}: ProjectCardProps) {
  // Same UTC string comparison the console's "past its planned end" rule uses,
  // so the card, the form and the server can never disagree about "late".
  const late =
    project.status !== "cancelled" &&
    !project.actual_end &&
    isPastPlannedEnd(project.planned_end, todayUTCISO());

  return (
    <li>
      <Link
        href={`/projects/${project.id}`}
        className="block rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words font-semibold">{project.title}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status]}`}
          >
            {STATUS_LABELS[project.status]}
          </span>
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
            {PROJECT_TYPE_LABELS[project.project_type]}
          </span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            simulated
          </span>
          <ClashCountBadge count={clashCount} />
        </div>

        <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
          {project.purpose}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Department</dt>
            <dd className="font-medium">{department?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Road</dt>
            <dd className="font-medium">{segment?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Planned</dt>
            <dd className="font-medium">
              {formatDate(project.planned_start)} – {formatDate(project.planned_end)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Budget</dt>
            <dd className="font-medium">{formatINR(project.budget_inr)}</dd>
          </div>
        </dl>

        {late ? (
          <p className="mt-2 text-xs font-medium text-orange-700 dark:text-orange-400">
            Overdue — planned to finish {relativeDays(project.planned_end)}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
