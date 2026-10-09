import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet's default marker points at URLs that don't exist under Next's asset
 * pipeline, so markers render as broken grey boxes. We copy the three PNGs
 * into public/images/ and point the default icon at them explicitly.
 */
export function fixLeafletDefaultIcons() {
  L.Icon.Default.mergeOptions({
    iconUrl: "/images/marker-icon.png",
    iconRetinaUrl: "/images/marker-icon-2x.png",
    shadowUrl: "/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}
