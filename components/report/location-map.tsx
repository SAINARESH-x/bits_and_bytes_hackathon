"use client";

import dynamic from "next/dynamic";
import type { LatLngValue } from "./location-map-leaflet";

/**
 * Public wrapper around the Leaflet location picker.
 *
 * `ssr: false` is what keeps `window` off the server: `leaflet` touches the DOM
 * at import time, and a client component is still *executed* during SSR unless
 * its import is deferred. See components/project-map.tsx for the same pattern.
 *
 * The dynamic import means the picker's props must be declared here rather than
 * inferred — Leaflet only ever runs in the browser.
 */
const LeafletLocationMap = dynamic(
  () => import("./location-map-leaflet").then((mod) => mod.LocationMapLeaflet),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex h-[300px] w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
      >
        <span className="sr-only">Loading location picker…</span>
        <span aria-hidden="true">Loading location picker…</span>
      </div>
    ),
  },
);

export interface LocationMapProps {
  value: LatLngValue | null;
  onChange: (value: LatLngValue) => void;
}

export function LocationMap(props: LocationMapProps) {
  return <LeafletLocationMap {...props} />;
}
