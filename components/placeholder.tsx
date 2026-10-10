interface PlaceholderProps {
  title: string;
  body: string;
  milestone: string;
}

/**
 * Honest stand-in for a screen that is not built yet. Every nav link resolves
 * to a real page rather than a 404, so the deployed app is always clickable.
 */
export function Placeholder({ title, body, milestone }: PlaceholderProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="rounded-lg border border-dashed border-neutral-300 p-8 dark:border-neutral-700">
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          Coming in {milestone}
        </span>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {body}
        </p>
      </div>
    </div>
  );
}

/**
 * Section-sized version of the above, for a panel that sits inside a working
 * page rather than replacing it. Deliberately dashed-border and badge-first:
 * an un-built feature should look un-built instead of looking broken.
 *
 * `children` lets a panel show the data it already has alongside the promise
 * of the interaction that is still coming.
 */
export function ComingSoonSection({
  title,
  body,
  milestone,
  children,
  headingId,
}: PlaceholderProps & { children?: React.ReactNode; headingId?: string }) {
  const heading = (
    <h2
      id={headingId}
      className="text-lg font-semibold"
    >
      {title}
    </h2>
  );
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          Coming in {milestone}
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {body}
      </p>
      {children}
    </section>
  );
}
