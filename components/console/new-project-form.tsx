"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClashPreview,
  CONSOLE_DRAFT_ID,
} from "@/components/console/clash-preview";
import type { Project as EngineProject } from "@/lib/clash/types";
import { PROJECT_TYPE_LABELS, STATUS_LABELS } from "@/lib/format";
import { projectInputSchema } from "@/lib/schemas";
import type {
  Department,
  Project as RegistryProject,
  ProjectStatus,
  ProjectType,
  RoadSegment,
} from "@/lib/types";

const CONTROL =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

const LABEL =
  "mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300";

const PROJECT_TYPES: ProjectType[] = [
  "road",
  "drain",
  "water_pipeline",
  "power_cable",
  "fibre",
  "other",
];

const STATUSES: ProjectStatus[] = [
  "planned",
  "in_progress",
  "stalled",
  "completed",
  "cancelled",
];

interface ServerIssues {
  issues?: { path: string; message: string }[];
  message?: string;
}

interface NewProjectFormProps {
  projects: readonly RegistryProject[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
}

/**
 * New Project form with the LIVE CLASH PREVIEW (PLAN.md M5).
 *
 * Every change to a planning-sensitive field (road, department, dates,
 * budget, status) re-runs the pure clash engine over the draft + registry in
 * the preview panel below, so an overlap or a repeat-dig warning (with the
 * engine's coordination suggestion) appears BEFORE the project is saved.
 *
 * Validation runs through the same Zod schema the server re-checks — the
 * form can never accept something the API would reject. The submit button is
 * disabled while a request is in flight so a double click cannot create the
 * project twice.
 */
export function NewProjectForm({
  projects,
  segments,
  departments,
}: NewProjectFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("road");
  const [departmentId, setDepartmentId] = useState("");
  const [contractor, setContractor] = useState("");
  const [roadSegmentId, setRoadSegmentId] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [budget, setBudget] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegistryProject | null>(null);
  const [pending, setPending] = useState(false);

  const draft: EngineProject = useMemo(
    () => ({
      id: CONSOLE_DRAFT_ID,
      title: title.trim() || "(new project)",
      project_type: projectType,
      department_id: departmentId,
      road_segment_id: roadSegmentId,
      status,
      planned_start: plannedStart === "" ? null : plannedStart,
      planned_end: plannedEnd === "" ? null : plannedEnd,
      actual_start: null,
      actual_end: null,
      budget_inr: budget === "" ? null : Number(budget),
    }),
    [
      title,
      projectType,
      departmentId,
      roadSegmentId,
      status,
      plannedStart,
      plannedEnd,
      budget,
    ],
  );

  function applyIssues(issues: { path: string; message: string }[]) {
    const errors: Record<string, string> = {};
    for (const issue of issues) {
      if (!errors[issue.path]) errors[issue.path] = issue.message;
    }
    setFieldErrors(errors);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFieldErrors({});
    setSubmitError(null);
    setSuccess(null);

    // Client-side validation with the SHARED schema — the server runs the
    // same check again, so a mismatch between them is impossible by design.
    const parsed = projectInputSchema.safeParse({
      title,
      purpose,
      project_type: projectType,
      department_id: departmentId,
      contractor_name: contractor,
      road_segment_id: roadSegmentId,
      planned_start: plannedStart === "" ? null : plannedStart,
      planned_end: plannedEnd === "" ? null : plannedEnd,
      actual_start: null,
      actual_end: null,
      status,
      budget_inr: budget === "" ? null : Number(budget),
    });

    if (!parsed.success) {
      applyIssues(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/console/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ServerIssues & { project?: RegistryProject })
        | null;

      if (!response.ok) {
        if (response.status === 401) {
          setSubmitError("Your console session has expired. Sign in again.");
        } else if (payload?.issues?.length) {
          applyIssues(payload.issues);
        } else {
          setSubmitError(payload?.message ?? "Could not save the project.");
        }
        return;
      }

      if (!payload?.project) {
        setSubmitError("The project was saved but the response was empty.");
        return;
      }

      setSuccess(payload.project);
      // Fresh-start the form, keep the form mounted so the preview and the
      // other console form see the new registry row via router.refresh().
      setTitle("");
      setPurpose("");
      setContractor("");
      setPlannedStart("");
      setPlannedEnd("");
      setBudget("");
      setStatus("planned");
      router.refresh();
    } catch {
      setSubmitError("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="New project"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-lg font-semibold">New project</h2>

      <div>
        <label className={LABEL} htmlFor="np-title">
          Title
        </label>
        <input
          id="np-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Storm-water drain renewal, Kaveri Cross Road"
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "np-title-error" : undefined}
          className={CONTROL}
        />
        {fieldErrors.title ? (
          <p id="np-title-error" className="mt-1 text-xs text-red-600">
            {fieldErrors.title}
          </p>
        ) : null}
      </div>

      <div>
        <label className={LABEL} htmlFor="np-purpose">
          Purpose
        </label>
        <textarea
          id="np-purpose"
          rows={2}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="What is this work for?"
          aria-invalid={Boolean(fieldErrors.purpose)}
          aria-describedby={fieldErrors.purpose ? "np-purpose-error" : undefined}
          className={CONTROL}
        />
        {fieldErrors.purpose ? (
          <p id="np-purpose-error" className="mt-1 text-xs text-red-600">
            {fieldErrors.purpose}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="np-type">
            Project type
          </label>
          <select
            id="np-type"
            value={projectType}
            onChange={(event) => setProjectType(event.target.value as ProjectType)}
            className={CONTROL}
          >
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROJECT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="np-status">
            Status
          </label>
          <select
            id="np-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            className={CONTROL}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {status === "cancelled" ? (
            <p className="mt-1 text-xs text-neutral-500">
              Cancelled works are excluded from clash detection.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="np-segment">
            Road segment
          </label>
          <select
            id="np-segment"
            value={roadSegmentId}
            onChange={(event) => setRoadSegmentId(event.target.value)}
            aria-invalid={Boolean(fieldErrors.road_segment_id)}
            aria-describedby={
              fieldErrors.road_segment_id ? "np-segment-error" : undefined
            }
            className={CONTROL}
          >
            <option value="">Select a road…</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
                {segment.ward ? ` · ${segment.ward}` : ""}
              </option>
            ))}
          </select>
          {fieldErrors.road_segment_id ? (
            <p id="np-segment-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.road_segment_id}
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor="np-department">
            Department
          </label>
          <select
            id="np-department"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            aria-invalid={Boolean(fieldErrors.department_id)}
            aria-describedby={
              fieldErrors.department_id ? "np-department-error" : undefined
            }
            className={CONTROL}
          >
            <option value="">Select a department…</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          {fieldErrors.department_id ? (
            <p id="np-department-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.department_id}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="np-contractor">
          Contractor
          <span className="ml-1 font-normal text-neutral-500">(optional)</span>
        </label>
        <input
          id="np-contractor"
          value={contractor}
          onChange={(event) => setContractor(event.target.value)}
          placeholder="Contractor name"
          className={CONTROL}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="np-start">
            Planned start
          </label>
          <input
            id="np-start"
            type="date"
            value={plannedStart}
            max={plannedEnd || undefined}
            onChange={(event) => setPlannedStart(event.target.value)}
            aria-invalid={Boolean(fieldErrors.planned_start)}
            aria-describedby={
              fieldErrors.planned_start ? "np-start-error" : undefined
            }
            className={CONTROL}
          />
          {fieldErrors.planned_start ? (
            <p id="np-start-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.planned_start}
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor="np-end">
            Planned end
          </label>
          <input
            id="np-end"
            type="date"
            value={plannedEnd}
            min={plannedStart || undefined}
            onChange={(event) => setPlannedEnd(event.target.value)}
            aria-invalid={Boolean(fieldErrors.planned_end)}
            aria-describedby={fieldErrors.planned_end ? "np-end-error" : undefined}
            className={CONTROL}
          />
          {fieldErrors.planned_end ? (
            <p id="np-end-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.planned_end}
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor="np-budget">
            Budget (INR, simulated)
          </label>
          <input
            id="np-budget"
            type="number"
            min={0}
            step={10000}
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder="0"
            aria-invalid={Boolean(fieldErrors.budget_inr)}
            aria-describedby={
              fieldErrors.budget_inr ? "np-budget-error" : undefined
            }
            className={CONTROL}
          />
          {fieldErrors.budget_inr ? (
            <p id="np-budget-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.budget_inr}
            </p>
          ) : null}
        </div>
      </div>

      <ClashPreview
        draft={draft}
        projects={projects}
        segments={segments}
        departments={departments}
      />

      {submitError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      ) : null}

      {success ? (
        <div
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          <span className="font-semibold">Project created.</span> It now appears
          on the map, in the project list and on the clash board.{" "}
          <Link
            href={`/projects/${success.id}`}
            className="underline underline-offset-2 hover:text-emerald-700"
          >
            Open {success.title} →
          </Link>
          <span className="mt-1 block text-xs text-emerald-800 dark:text-emerald-300">
            Demo writes live in memory for the server&apos;s lifetime and reset
            when it restarts — they are never presented as real.
          </span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-white"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}