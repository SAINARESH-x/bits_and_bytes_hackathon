"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { ProjectLine } from "@/lib/map-lines";
import { FitBounds } from "./project-map-leaflet";
import { fixLeafletDefaultIcons } from "./map/leaflet-icons";

/**
 * The single-clash map: one road, two (or a few) lines, zoomed to fit.
 *
 * Reuses `FitBounds` from the main map so "fit the drawn lines" behaves
 * identically here and on /map. Reached only through `ssr: false`, because
 * `leaflet` touches the DOM at import time.
 */

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function LeafletClashMap({
  lines,
  label,
}: {
  lines: readonly ProjectLine[];
  label: string;
}) {
  useEffect(() => {
    fixLeafletDefaultIcons();
  }, []);

  const ariaLabel = useMemo(
    () =>
      `Map of the road this clash is on. Line colours follow project status. ${label}`,
    [label],
  );

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
    >
      <MapContainer
        center={[13.0674, 80.2376]}
        zoom={15}
        scrollWheelZoom={false}
        className="h-48 w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds lines={lines} />
        {lines.map((line) => (
          <Polyline
            key={`${line.project.id}-${line.positions.length}`}
            positions={line.positions as LatLngExpression[]}
            color={line.style.color}
            dashArray={line.style.dashArray ?? undefined}
            weight={line.style.weight}
            opacity={line.style.opacity}
          />
        ))}
      </MapContainer>
    </div>
  );
}

export default LeafletClashMap;
