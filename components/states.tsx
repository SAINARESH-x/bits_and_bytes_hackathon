import Link from "next/link";

/**
 * The three states every screen in this app owes the user, in one place so
 * they cannot drift apart. Each route wires them up itself: `loading.tsx`
 * renders a skeleton while the server component resolves, `error.tsx` renders
 * `ErrorState` (whose Retry button calls Next's `reset()` to re-run the
 * render), and empty result sets render `EmptyState`.
 */

const CARD =
  "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";

/** A single grey block that pulses while data loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 ${className}`}
    />
  );
}

/**
 * Loading skeleton for a list screen. Sized to match the real layout so the
 * page does not jump when the data lands.
 */
export function ListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading projects…</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={CARD}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading projects…</span>
    </div>
  );
}

/** Loading skeleton for the map screen: filter bar plus map placeholder. */
export function MapSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading map…</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[420px] w-full" />
      <span className="sr-only">Loading map…</span>
    </div>
  );
}

/** Loading skeleton for a single project's detail page. */
export function DetailSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading project…</span>
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <span className="sr-only">Loading project…</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`${CARD} flex flex-col items-center gap-2 py-10 text-center`}
      role="status"
    >
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Error state with a retry that actually re-runs the failed render rather
 * than doing a full browser reload (which would lose the query string and
 * therefore the viewer's filters).
 */
export function ErrorState({
  title = "Something went wrong",
  body = "The registry could not be loaded. This is usually transient — try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`${CARD} flex flex-col items-center gap-3 border-red-300 py-10 text-center dark:border-red-900`}
      role="alert"
    >
      <p className="text-base font-semibold text-red-700 dark:text-red-300">{title}</p>
      <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Try again
          </button>
        ) : null}
        <Link
          href="/"
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

/** Loading skeleton for the clash board: header, stat strip, then cards. */
export function ClashBoardSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Running the clash engine…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={CARD}>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="mt-3 h-5 w-2/3" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Running the clash engine…</span>
    </div>
  );
}
