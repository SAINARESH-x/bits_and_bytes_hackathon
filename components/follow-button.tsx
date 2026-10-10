"use client";

import { useEffect, useState } from "react";
import { isFollowed, subscribeFollows, toggleFollow } from "@/lib/follows";

/**
 * Follow / unfollow a project, stored on this device (PLAN.md M6 item 4).
 *
 * Rendering is deliberately two-phase: the server (and the first client render)
 * always shows "Follow", then an effect reads localStorage and corrects it. That
 * keeps the server HTML and the hydrated markup identical — reading storage
 * during render would be a hydration mismatch — while still reflecting the
 * real state a moment later.
 */
export function FollowButton({ projectId }: { projectId: string }) {
  const [followed, setFollowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setFollowed(isFollowed(projectId));
    sync();
    setReady(true);
    return subscribeFollows(sync);
  }, [projectId]);

  return (
    <button
      type="button"
      onClick={() => setFollowed(toggleFollow(projectId))}
      aria-pressed={followed}
      className={`rounded border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        followed
          ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }`}
    >
      <span aria-hidden="true">{followed ? "★" : "☆"}</span>{" "}
      {ready && followed ? "Following" : "Follow"}
      <span className="sr-only">
        {followed
          ? " — you follow this project on this device"
          : " this project (saved on this device only)"}
      </span>
    </button>
  );
}
