/**
 * Persistent data-honesty notice. Rendered by the root layout on every page
 * so simulated records are never mistaken for real municipal data.
 */
export function SimulatedBanner() {
  return (
    <div
      role="status"
      className="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      Simulated demo data — not real projects
    </div>
  );
}
