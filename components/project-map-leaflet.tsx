"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { PROJECT_TYPE_LABELS, STATUS_LABELS, formatDate } from "@/lib/format";
import { lineMidPosition, type ProjectLine } from "@/lib/map-lines";
import { clashMarkerHtml } from "./clash-badge";
import { fixLeafletDefaultIcons } from "./map/leaflet-icons";

const CHENNAI_CENTER: LatLngExpression = [13.0674, 80.2376];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Zoom the viewport to whatever is currently drawn. Re-runs when the filter
 * changes so "ward 3" actually goes to ward 3 instead of leaving the viewer
 * staring at the city-wide view with one line off-screen.
 *
 * Exported so the single-clash map on /clashes frames a clash the same way the
 * big map frames a filter.
 */
export function FitBounds({ lines }: { lines: readonly ProjectLine[] }) {
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

  const flagged = useMemo(
    () => lines.filter((line) => line.clashCount > 0),
    [lines],
  );

  /**
   * Leaflet builds markers outside React, so the badge is raw HTML. Cached per
   * count because the same number of clashes repeats across many lines.
   */
  const badgeIcons = useMemo(() => {
    const cache = new Map<number, L.DivIcon>();
    return (count: number): L.DivIcon => {
      const cached = cache.get(count);
      if (cached) return cached;
      const icon = L.divIcon({
        className: "clash-marker-wrap",
        html: clashMarkerHtml(count),
        iconSize: [64, 20],
        iconAnchor: [32, 10],
      });
      cache.set(count, icon);
      return icon;
    };
  }, []);

  return (
    <div
      role="region"
      aria-label={`Project map. ${totalCount} project${totalCount === 1 ? "" : "s"} drawn, of which ${flagged.length} ha${flagged.length === 1 ? "s" : "ve"} at least one clash alert. A keyboard-accessible list of everything shown is below the map.`}
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
                {line.clashCount > 0 ? (
                  <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-800">
                    <span aria-hidden="true">⚠ </span>
                    {line.clashCount} clash alert{line.clashCount === 1 ? "" : "s"} ·{" "}
                    <Link
                      href="/clashes"
                      className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                    >
                      review
                    </Link>
                  </p>
                ) : null}
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

        {/*
          The badge is a separate, non-interactive marker pinned to the middle
          of the line: clicks fall through to the polyline popup, and the
          keyboard path is the text list below the map.
        */}
        {flagged.map((line) => (
          <Marker
            key={`clash-${line.project.id}`}
            position={lineMidPosition(line.positions)}
            icon={badgeIcons(line.clashCount)}
            interactive={false}
            keyboard={false}
          >
            <Tooltip direction="top">
              {line.clashCount} clash alert{line.clashCount === 1 ? "" : "s"} on{" "}
              {line.segment.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default LeafletProjectMap;
