import { MapShell } from "@/components/map/map-shell";
import { getSeed } from "@/lib/data";

export const metadata = { title: "Map — DigSync" };

export default function MapPage() {
  const { corridors } = getSeed();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Map</h1>

      <MapShell corridors={corridors} />

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Showing {corridors.length} simulated corridor
        {corridors.length === 1 ? "" : "s"} around central Chennai. Map data ©
        OpenStreetMap contributors.
      </p>
    </div>
  );
}
