"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the registry list and the project detail
 * page (error boundaries wrap child segments). Renders inside the site
 * layout, so navigation stays available if the data layer fails.
 *
 * `reset()` re-runs the failed render without a full reload, preserving the
 * filter query string the viewer had built up.
 */
export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
      <ErrorState
        title="The registry could not be loaded"
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
