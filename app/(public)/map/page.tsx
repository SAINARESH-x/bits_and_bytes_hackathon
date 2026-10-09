import { MapShell } from "@/components/map/map-shell";
import { listSegments } from "@/lib/data";

export const metadata = { title: "Map — DigSync" };
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const segments = await listSegments();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Map</h1>

      <MapShell segments={segments} />

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Showing {segments.length} simulated road segment
        {segments.length === 1 ? "" : "s"} around central Chennai. Map data ©
        OpenStreetMap contributors.
      </p>
    </div>
  );
}
