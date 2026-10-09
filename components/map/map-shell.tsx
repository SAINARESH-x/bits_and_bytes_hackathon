"use client";

import dynamic from "next/dynamic";
import type { RoadSegment } from "@/lib/types";

/**
 * `ssr: false` keeps Leaflet off the server, which is what prevents the
 * classic "window is not defined" crash during `next build`.
 */
const MapView = dynamic(
  () => import("./map-view").then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[420px] w-full items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
        role="status"
      >
        Loading map…
      </div>
    ),
  },
);

interface MapShellProps {
  segments: RoadSegment[];
  className?: string;
}

export function MapShell({ segments, className }: MapShellProps) {
  return <MapView segments={segments} className={className} />;
}
