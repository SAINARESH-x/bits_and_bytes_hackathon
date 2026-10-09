export default function Loading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center py-20 text-sm text-neutral-500 dark:text-neutral-400"
    >
      <span className="sr-only">Loading</span>
      <span aria-hidden="true">Loading…</span>
    </div>
  );
}
