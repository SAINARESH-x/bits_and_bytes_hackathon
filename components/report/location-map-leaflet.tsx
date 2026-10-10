"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { fixLeafletDefaultIcons } from "@/components/map/leaflet-icons";

/**
 * The browser-only half of the report location picker.
 *
 * Reached through `next/dynamic({ ssr: false })` (see location-map.tsx), so
 * `leaflet` — which touches `window` at import time — never runs on the server.
 *
 * A tap anywhere sets the marker. There is no geolocation call here: the
 * permission prompt and its error handling live in the form, so this component
 * works even when permission is denied or the API is unavailable.
 */

const CHENNAI_CENTER: LatLngExpression = [13.0674, 80.2376];

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface LatLngValue {
  lat: number;
  lng: number;
}

interface LocationMapProps {
  value: LatLngValue | null;
  onChange: (value: LatLngValue) => void;
}

function ClickCatcher({ onChange }: { onChange: (value: LatLngValue) => void }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export function LocationMapLeaflet({ value, onChange }: LocationMapProps) {
  useEffect(() => {
    fixLeafletDefaultIcons();
  }, []);

  return (
    <MapContainer
      center={value ? [value.lat, value.lng] : CHENNAI_CENTER}
      zoom={13}
      scrollWheelZoom
      className="h-[300px] w-full"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <ClickCatcher onChange={onChange} />
      {value ? <Marker position={[value.lat, value.lng]} /> : null}
    </MapContainer>
  );
}

export default LocationMapLeaflet;
