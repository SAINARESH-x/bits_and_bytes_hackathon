"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyError, postJson } from "@/lib/api-client";
import { DELAY_REASON_LABELS, STATUS_LABELS, todayUTCISO } from "@/lib/format";
import {
  consoleProjectUpdateInputSchema,
  isPastPlannedEnd,
} from "@/lib/schemas";
import type { Project, ProjectStatus, ProjectUpdate } from "@/lib/types";

const CONTROL =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

const LABEL =
  "mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300";

const STATUSES: ProjectStatus[] = [
  "planned",
  "in_progress",
  "stalled",
  "completed",
  "cancelled",
];

const DELAY_REASONS = Object.keys(DELAY_REASON_LABELS) as (
  keyof typeof DELAY_REASON_LABELS
)[];

interface AddUpdateFormProps {
  projects: readonly Project[];
}

/**
 * Add Update form — the append-only status log.
 *
 * The console rule "a delay reason is REQUIRED once a project is past its
 * planned end" is enforced here on the client (the select becomes required
 * and the submit blocks with an inline error) AND on the server, where the
 * API re-checks the project's planned_end against its own UTC clock before
 * appending. Updates are append-only: nothing in this form edits or deletes
 * an existing row, and the API only ever inserts. The submit button is
 * disabled while a request is in flight (double submit).
 */
export function AddUpdateForm({ projects }: AddUpdateFormProps) {
  const router = useRouter();

  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [note, setNote] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [newPlannedEnd, setNewPlannedEnd] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ProjectUpdate | null>(null);
  const [pending, setPending] = useState(false);

  const selected = projects.find((p) => p.id === projectId) ?? null;
  const pastDue = isPastPlannedEnd(selected?.planned_end ?? null, todayUTCISO());

  function selectProject(id: string) {
    const next = projects.find((p) => p.id === id) ?? null;
    setProjectId(id);
    setStatus(next?.status ?? "planned");
    setNote("");
    setDelayReason("");
    setNewPlannedEnd("");
    setFieldErrors({});
    setSubmitError(null);
    setSuccess(null);
  }

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

    // Client mirror of the server's past-due rule (the server still re-checks).
    if (pastDue && !delayReason) {
      setFieldErrors({
        delay_reason:
          "This project is past its planned end — a delay reason is required.",
      });
      return;
    }

    const parsed = consoleProjectUpdateInputSchema.safeParse({
      project_id: projectId,
      status,
      note: note === "" ? null : note,
      delay_reason: delayReason === "" ? null : delayReason,
      new_planned_end: newPlannedEnd === "" ? null : newPlannedEnd,
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
      // Same postJson-without-retry contract as the New Project form: updates
      // are append-only, so a retry after a lost response could double-log.
      const result = await postJson<{ update?: ProjectUpdate }>(
        "/api/console/updates",
        parsed.data,
        { retries: 0 },
      );

      if (!result.ok) {
        if (result.status === 401) {
          setSubmitError("Your console session has expired. Sign in again.");
        } else if (result.issues?.length) {
          applyIssues(result.issues);
        } else {
          setSubmitError(friendlyError(result));
        }
        return;
      }

      setSuccess(result.data?.update ?? null);
      setNote("");
      setDelayReason("");
      setNewPlannedEnd("");
      // The store applies the new status to the project row, so refresh the
      // server components to show it (timeline, status select).
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const delayLabel = pastDue
    ? "Delay reason (required — project is past its planned end)"
    : "Delay reason";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Add a status update"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-lg font-semibold">Add update</h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Updates are append-only — every entry becomes a permanent row in the
        project&apos;s status history; nothing here edits an existing entry.
      </p>

      {projects.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No projects in the registry yet. Create one first.
        </p>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="au-project">
              Project
            </label>
            <select
              id="au-project"
              value={projectId}
              onChange={(event) => selectProject(event.target.value)}
              aria-invalid={Boolean(fieldErrors.project_id)}
              aria-describedby={
                fieldErrors.project_id ? "au-project-error" : undefined
              }
              className={CONTROL}
            >
              <option value="">Select a project…</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title} — {STATUS_LABELS[project.status]}
                  {project.planned_end ? ` (ends ${project.planned_end})` : ""}
                </option>
              ))}
            </select>
            {fieldErrors.project_id ? (
              <p id="au-project-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.project_id}
              </p>
            ) : null}
          </div>

          {selected && pastDue ? (
            <p
              role="status"
              className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              This project is past its planned end ({selected.planned_end}) — a
              delay reason is required on every update until it is settled.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="au-status">
                New status
              </label>
              <select
                id="au-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ProjectStatus)
                }
                className={CONTROL}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="au-reason">
                {delayLabel}
              </label>
              <select
                id="au-reason"
                value={delayReason}
                onChange={(event) => setDelayReason(event.target.value)}
                required={pastDue}
                aria-invalid={Boolean(fieldErrors.delay_reason)}
                aria-describedby={
                  fieldErrors.delay_reason ? "au-reason-error" : undefined
                }
                className={CONTROL}
              >
                <option value="">{pastDue ? "Select a reason…" : "None"}</option>
                {DELAY_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {DELAY_REASON_LABELS[reason]}
                  </option>
                ))}
              </select>
              {fieldErrors.delay_reason ? (
                <p id="au-reason-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.delay_reason}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="au-note">
              Note
              <span className="ml-1 font-normal text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="au-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What happened since the last update?"
              aria-invalid={Boolean(fieldErrors.note)}
              aria-describedby={fieldErrors.note ? "au-note-error" : undefined}
              className={CONTROL}
            />
            {fieldErrors.note ? (
              <p id="au-note-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.note}
              </p>
            ) : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="au-new-end">
              Revised planned end
              <span className="ml-1 font-normal text-neutral-500">(optional)</span>
            </label>
            <input
              id="au-new-end"
              type="date"
              value={newPlannedEnd}
              onChange={(event) => setNewPlannedEnd(event.target.value)}
              className={CONTROL}
            />
          </div>

          {submitError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {submitError}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            >
              Update logged as{" "}
              <span className="font-semibold">{STATUS_LABELS[success.status]}</span>{" "}
              on the project&apos;s status history.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || projectId === ""}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-white"
          >
            {pending ? "Logging…" : "Log update"}
          </button>
        </>
      )}
    </form>
  );
}