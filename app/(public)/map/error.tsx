"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the map. Rendered inside the site layout, so
 * the header and nav stay usable — a viewer who hits a failure can still
 * navigate away instead of being dumped on a bare page.
 *
 * `reset()` re-runs the failed render without a full reload, which matters
 * because a reload would drop the query string and with it the filters the
 * viewer had built up.
 */
export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Map</h1>
      <ErrorState
        title="The map could not be loaded"
        body="The registry did not respond. Nothing is broken on your side — try again in a moment."
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
