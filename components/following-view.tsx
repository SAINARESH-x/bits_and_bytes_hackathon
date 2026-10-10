"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, STATUS_LABELS, STATUS_STYLES } from "@/lib/format";
import { changeCountByProject, updatesSince } from "@/lib/follow-activity";
import { readFollows, subscribeFollows, unfollow, markFollowsSeen } from "@/lib/follows";
import { formatRelativeUpdate } from "@/lib/follow-display";
import type { Department, Project, ProjectUpdate, RoadSegment } from "@/lib/types";

interface FollowingViewProps {
  projects: readonly Project[];
  segments: readonly RoadSegment[];
  departments: readonly Department[];
  /** Every update in the registry, so "what changed" needs no round trip. */
  updates: readonly ProjectUpdate[];
}

/**
 * "My followed projects" (PLAN.md M6 item 4).
 *
 * Follows live in this device's localStorage, so the server cannot know them —
 * this view reads them after hydration and subscribes to changes so unfollow
 * buttons update immediately. "What changed since your last visit" compares the
 * registry's update log against the timestamp the device last acknowledged
 * (see lib/follow-activity.ts); a first-time visitor has no baseline, so nothing
 * is flagged until they have seen the feed once.
 */
export function FollowingView({
  projects,
  segments,
  departments,
  updates,
}: FollowingViewProps) {
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const state = readFollows();
      setFollowedIds(state.ids);
      setLastSeenAt(state.lastSeenAt);
    };
    sync();
    setReady(true);
    return subscribeFollows(sync);
  }, []);

  const segmentById = useMemo(
    () => new Map(segments.map((s) => [s.id, s])),
    [segments],
  );
  const departmentById = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments],
  );

  const followed = useMemo(
    () =>
      followedIds
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => Boolean(p)),
    [followedIds, projects],
  );

  const changeCounts = useMemo(
    () => changeCountByProject(updates, lastSeenAt),
    [updates, lastSeenAt],
  );

  // The single most recent change, for the "since your last visit" header line.
  const recent = useMemo(
    () => updatesSince(updates, lastSeenAt),
    [updates, lastSeenAt],
  );
  const changedCount = followed.filter((p) => changeCounts.has(p.id)).length;

  function handleMarkSeen() {
    markFollowsSeen();
    setLastSeenAt(new Date().toISOString());
  }

  if (!ready) {
    return (
      <p role="status" className="text-sm text-neutral-500 dark:text-neutral-400">
        Loading your followed projects…
      </p>
    );
  }

  if (followed.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700"
      >
        <p className="text-base font-semibold">You are not following anything yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
          Open any project and press <span className="font-medium">Follow</span>{" "}
          to keep an eye on it. Follows are saved on this device only — no
          account needed.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-block rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Browse projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-neutral-600 dark:text-neutral-400">
          {changedCount > 0 ? (
            <>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {changedCount}
              </span>{" "}
              of your followed projects changed since your last visit
              {recent.length > 0
                ? ` (latest ${formatDate(recent[recent.length - 1].created_at.slice(0, 10))})`
                : ""}
              .
            </>
          ) : lastSeenAt ? (
            "Nothing has changed since your last visit."
          ) : (
            "This is your first visit to this feed — changes will be highlighted from now on."
          )}
        </p>
        {changedCount > 0 ? (
          <button
            type="button"
            onClick={handleMarkSeen}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Mark all as seen
          </button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {followed.map((project) => {
          const changes = changeCounts.get(project.id) ?? 0;
          const segment = segmentById.get(project.road_segment_id);
          const department = departmentById.get(project.department_id);
          const projectUpdates = updates.filter((u) => u.project_id === project.id);
          const latest = projectUpdates[projectUpdates.length - 1] ?? null;

          return (
            <li
              key={project.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {changes > 0 ? (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                        {changes} new update{changes === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[project.status]}`}
                    >
                      {STATUS_LABELS[project.status]}
                    </span>
                  </div>
                  <h3 className="mt-1 break-words text-base font-semibold">
                    <Link
                      href={`/projects/${project.id}`}
                      className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {project.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {segment?.name ?? "Unknown road"} ·{" "}
                    {department?.name ?? "Unknown department"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => unfollow(project.id)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Unfollow
                </button>
              </div>

              {latest ? (
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <span className="text-xs text-neutral-500 dark:text-neutral-500">
                    {formatRelativeUpdate(latest.created_at)} ·{" "}
                  </span>
                  {latest.note ??
                    `Status set to ${STATUS_LABELS[latest.status]}.`}
                </p>
              ) : (
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-500">
                  No updates logged yet.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
