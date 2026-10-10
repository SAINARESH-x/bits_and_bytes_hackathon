import { Suspense } from "react";
import { MapScreen } from "@/components/map-screen";
import { MapSkeleton } from "@/components/states";
import { detectClashes } from "@/lib/clash";
import { getDataStore, loadRegistry } from "@/lib/data";

export const metadata = { title: "Map — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Server shell: fetch once, hand plain serialisable arrays to the client.
 * Filtering happens client-side from the query string — see map-screen.tsx.
 *
 * The clash board is computed here too, from the same rows, so the badges on
 * the lines stay put while the viewer filters (the filter must not change
 * whether a road is flagged as clashing).
 *
 * Unlisted-work reports are loaded here and pinned to the map: they are the one
 * signal with no registry line to sit on, so they are drawn as their own
 * markers (PLAN.md M6 item 3).
 *
 * Suspense is also what keeps `useSearchParams` legal here; without it Next
 * asks for a boundary at build time.
 */
export default async function MapPage() {
  const [{ projects, segments, departments }, store] = await Promise.all([
    loadRegistry(),
    getDataStore(),
  ]);
  const reports = await store.listReports();
  const unlistedReports = reports.filter((r) => r.is_unlisted_work);
  const { clashes } = detectClashes(projects, segments);

  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapScreen
        projects={projects}
        segments={segments}
        departments={departments}
        clashes={clashes}
        unlistedReports={unlistedReports}
      />
    </Suspense>
  );
}
