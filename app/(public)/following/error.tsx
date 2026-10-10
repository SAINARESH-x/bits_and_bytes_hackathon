"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the followed-projects feed. Renders inside the
 * site layout, so navigation stays available if the data layer fails.
 */
export default function FollowingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">My followed projects</h1>
      <ErrorState
        title="Your followed projects could not be loaded"
        body="The project data did not come back. Nothing is broken on your side — try again in a moment."
        onRetry={reset}
      />
      {process.env.NODE_ENV !== "production" && error?.message ? (
        <p className="font-mono text-xs text-neutral-500" role="status">
          {error.message}
          {error.digest ? ` (${error.digest})` : ""}
        </p>
      ) : null}
    </div>
  );
}
