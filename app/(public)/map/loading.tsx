import { MapSkeleton } from "@/components/states";

/** Shown while the server component resolves data for this route. */
export default function Loading() {
  return <MapSkeleton />;
}
