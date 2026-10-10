"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the dashboard. Renders inside the site layout,
 * so navigation stays available if the data layer fails.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <ErrorState
        title="The dashboard could not be loaded"
        body="The verification data did not come back. Nothing is broken on your side — try again in a moment."
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
