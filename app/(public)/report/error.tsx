"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the report screen. Renders inside the site
 * layout, so navigation stays available if the registry fails to load.
 */
export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Report an issue</h1>
      <ErrorState
        title="The report form could not be loaded"
        body="We could not load the registry used to suggest a nearby project. Try again in a moment."
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
