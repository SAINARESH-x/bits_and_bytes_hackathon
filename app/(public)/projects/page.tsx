import { Suspense } from "react";
import { ProjectsView } from "@/components/projects-view";
import { ListSkeleton } from "@/components/states";
import { detectClashes } from "@/lib/clash";
import { loadRegistry } from "@/lib/data";

export const metadata = { title: "Projects — DigSync" };

export const dynamic = "force-dynamic";

/**
 * Server shell for the registry list. Fetches everything once and hands
 * plain arrays to the client; from there the filter bar, sort headers and
 * Map/List toggle all operate on in-memory data driven by the URL.
 *
 * The clash board is computed from the same rows so a project tangled with
 * another department's work is marked wherever it appears.
 */
export default async function ProjectsPage() {
  const { projects, segments, departments } = await loadRegistry();
  const { clashes } = detectClashes(projects, segments);

  return (
    <Suspense fallback={<ListSkeleton />}>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The full simulated registry of public works, filterable and
            sortable. Every view you build here has its own shareable address.
          </p>
        </div>

        <ProjectsView
          projects={projects}
          segments={segments}
          departments={departments}
          clashes={clashes}
        />
      </div>
    </Suspense>
  );
}
