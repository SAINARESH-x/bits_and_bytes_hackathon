"use client";

import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  AttributionControl,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { fixLeafletDefaultIcons } from "./leaflet-icons";
import type { Corridor } from "@/lib/types";

const CHENNAI_CENTER: LatLngExpression = [13.0827, 80.2707];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface MapViewProps {
  corridors: Corridor[];
  className?: string;
}

/**
 * The actual Leaflet tree. NEVER imported directly from a server component —
 * it touches `window` at import time. Always go through map-shell.tsx.
 */
export function MapView({ corridors, className }: MapViewProps) {
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

        {corridors.map((c) => (
          <Marker key={c.id} position={[c.lat, c.lng]}>
            {/* Popup content comes in M2; the marker itself is enough for M1. */}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
