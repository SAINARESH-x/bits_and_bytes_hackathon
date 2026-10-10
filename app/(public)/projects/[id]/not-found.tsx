import Link from "next/link";

/**
 * Handles `notFound()` thrown by this segment's page — reached when the id in
 * the address bar is malformed, or well-formed but not in the registry (which
 * includes ids of records that only exist in someone else's database).
 *
 * Both cases are worth explaining rather than shrugging at: a broken shared
 * link is the most likely way a citizen arrives here.
 */
export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Error 404
      </p>
      <h1 className="text-2xl font-bold tracking-tight">
        No such project in this registry
      </h1>
      <p className="max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
        That project id does not match anything in DigSync. The link may be
        broken, the id may have been mistyped, or the record may not have been
        published to this instance.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/projects"
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Browse all projects
        </Link>
        <Link
          href="/map"
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Open the map
        </Link>
      </div>
    </div>
  );
}
