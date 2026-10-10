"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ProjectLine } from "@/lib/map-lines";

/**
 * Lazy boundary in front of the Leaflet clash map.
 *
 * Two jobs: `ssr: false` keeps `leaflet` off the server (see project-map.tsx),
 * and the map only mounts once its card is near the viewport. The clash board
 * has ~40 cards; mounting 40 tile-loading maps up front would hammer the
 * OpenStreetMap tile servers for content nobody has scrolled to yet. A card's
 * map is rendered inside `<details>`, so it does not mount until the reader
 * opens it and it scrolls into view.
 */

const LeafletClashMap = dynamic(
  () => import("./clash-map-leaflet").then((mod) => mod.LeafletClashMap),
  {
    ssr: false,
    loading: () => <Placeholder label="Loading map…" />,
  },
);

function Placeholder({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex h-48 w-full items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
    >
      {label}
    </div>
  );
}

export function ClashMap({
  lines,
  label,
}: {
  lines: readonly ProjectLine[];
  label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (old browser, jsdom) is not a reason to lose the
    // map — mount it immediately instead.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  // The placeholder matches the map's height so nothing shifts when it lands.
  return (
    <div ref={ref}>
      {visible ? (
        <LeafletClashMap lines={lines} label={label} />
      ) : (
        <Placeholder label="Map loads as you scroll" />
      )}
    </div>
  );
}
