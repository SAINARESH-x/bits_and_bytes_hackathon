"use client";

import { ErrorState } from "@/components/states";

/**
 * Route-level error boundary for the clash board. Rendered inside the site
 * layout, so navigation stays usable and the reader can go back to the
 * registry instead of being dumped on a bare page.
 */
export default function ClashesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Clash board</h1>
      <ErrorState
        title="The clash board could not be computed"
        body="The registry did not respond, so there was nothing to compare. Nothing is broken on your side — try again in a moment."
        onRetry={reset}
      />
      {process.env.NODE_ENV !== "production" && error?.message ? (
        <p className="font-mono text-xs text-neutral-500" role="status">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
