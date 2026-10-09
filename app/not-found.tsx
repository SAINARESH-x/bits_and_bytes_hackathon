import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
        That page does not exist. Try the map or the project list instead.
      </p>
      <Link
        href="/"
        className="mt-2 rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Back to home
      </Link>
    </div>
  );
}
