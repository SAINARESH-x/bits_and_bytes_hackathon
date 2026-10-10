"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { PROJECT_TYPE_LABELS, STATUS_LABELS, formatDate } from "@/lib/format";
import type { ProjectLine } from "@/lib/map-lines";
import { fixLeafletDefaultIcons } from "./map/leaflet-icons";

const CHENNAI_CENTER: LatLngExpression = [13.0674, 80.2376];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Zoom the viewport to whatever is currently drawn. Re-runs when the filter
 * changes so "ward 3" actually goes to ward 3 instead of leaving the viewer
 * staring at the city-wide view with one line off-screen.
 */
function FitBounds({ lines }: { lines: readonly ProjectLine[] }) {
  const map = useMap();
  const positions = useMemo(() => lines.flatMap((line) => line.positions), [lines]);

  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  }, [map, positions]);

  return null;
}

interface LeafletMapProps {
  lines: readonly ProjectLine[];
  /** Number of projects behind the drawn lines, for the aria description. */
  totalCount: number;
}

/**
 * The half of the map that genuinely needs a browser. Reached only through
 * `next/dynamic({ ssr: false })`, so nothing here ever executes on the
 * server — see project-map.tsx.
 */
export function LeafletProjectMap({ lines, totalCount }: LeafletMapProps) {
  useEffect(() => {
    fixLeafletDefaultIcons();
  }, []);

  return (
    <div
      role="region"
      aria-label={`Project map. ${totalCount} project${totalCount === 1 ? "" : "s"} drawn. A keyboard-accessible list of everything shown is below the map.`}
      className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
    >
      <MapContainer
        center={CHENNAI_CENTER}
        zoom={12}
        scrollWheelZoom
        className="h-[420px] w-full sm:h-[520px]"
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
          >
            <Popup>
              <div className="w-56 text-neutral-900">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {line.segment.ward} · {PROJECT_TYPE_LABELS[line.project.project_type]}
                </p>
                <h3 className="mt-0.5 text-sm font-semibold leading-snug">
                  {line.project.title}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {line.department?.name ?? "Unknown department"}
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-neutral-500">Planned</dt>
                    <dd>
                      {formatDate(line.project.planned_start)} –{" "}
                      {formatDate(line.project.planned_end)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-neutral-500">Actual</dt>
                    <dd>
                      {formatDate(line.project.actual_start)} –{" "}
                      {formatDate(line.project.actual_end)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 shrink-0 text-neutral-500">Status</dt>
                    <dd className="font-medium">
                      <span aria-hidden="true">{line.style.symbol}</span>{" "}
                      {STATUS_LABELS[line.project.status]}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/projects/${line.project.id}`}
                  className="mt-3 inline-block rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  View details →
                </Link>
              </div>
            </Popup>
          </Polyline>
        ))}
      </MapContainer>
    </div>
  );
}

export default LeafletProjectMap;
