/**
 * Skeleton for /console: the auth check and the registry load both hit the
 * data layer, so a full-height placeholder avoids a jarring flash.
 */
export default function ConsoleLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading console">
      <div className="h-16 w-full max-w-md animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[28rem] animate-pulse rounded-lg border border-neutral-200 dark:border-neutral-800" />
        <div className="h-[28rem] animate-pulse rounded-lg border border-neutral-200 dark:border-neutral-800" />
      </div>
    </div>
  );
}