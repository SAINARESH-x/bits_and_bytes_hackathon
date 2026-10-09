"use client";

import { useEffect } from "react";
import {
  MapContainer,
  Polyline,
  TileLayer,
  AttributionControl,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { fixLeafletDefaultIcons } from "./leaflet-icons";
import type { RoadSegment } from "@/lib/types";

const CHENNAI_CENTER: LatLngExpression = [13.0674, 80.2376];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface MapViewProps {
  segments: RoadSegment[];
  className?: string;
}

/**
 * The actual Leaflet tree. NEVER imported directly from a server component —
 * it touches `window` at import time. Always go through map-shell.tsx.
 *
 * Segments render as polylines from their GeoJSON LineString, so the shape on
 * the map is the shape in the data rather than a pin at its midpoint.
 */
export function MapView({ segments, className }: MapViewProps) {
  useEffect(() => {
    fixLeafletDefaultIcons();
  }, []);

  return (
    <div className={className} style={{ height: 420, width: "100%" }}>
      <MapContainer
        center={CHENNAI_CENTER}
        zoom={13}
        scrollWheelZoom={false}
        className="leaflet-container"
        attributionControl={true}
      >
        <AttributionControl position="bottomright" />
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

        {segments.map((s) => (
          <Polyline
            key={s.id}
            // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
            positions={s.geometry.coordinates.map(([lng, lat]) => [lat, lng]) as LatLngExpression[]}
          />
        ))}
      </MapContainer>
    </div>
  );
}
