import { DashboardSkeleton } from "@/components/states";

/** Shown while the dashboard loads the registry and computes its metrics. */
export default function Loading() {
  return <DashboardSkeleton />;
}