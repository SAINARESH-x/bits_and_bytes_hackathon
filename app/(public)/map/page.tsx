import { Suspense } from "react";
import { MapScreen } from "@/components/map-screen";
import { MapSkeleton } from "@/components/states";
import { loadRegistry } from "@/lib/data";

export const metadata = { title: "Map — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Server shell: fetch once, hand plain serialisable arrays to the client.
 * Filtering happens client-side from the query string — see map-screen.tsx.
 *
 * Suspense is also what keeps `useSearchParams` legal here; without it Next
 * asks for a boundary at build time.
 */
export default async function MapPage() {
  const { projects, segments, departments } = await loadRegistry();

  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapScreen projects={projects} segments={segments} departments={departments} />
    </Suspense>
  );
}
