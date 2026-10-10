import { detectClashes } from "@/lib/clash";
import { computeDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics";
import { getDataStore, type DataMode } from "@/lib/data";

/**
 * Server-side entry point for /dashboard (PLAN.md M7).
 *
 * Like `lib/clashes.ts` for the clash board, this file reaches the data layer
 * (and therefore Supabase) through `lib/data.ts`, so it must never end up in a
 * client bundle. The arithmetic itself lives in the pure
 * `lib/dashboard-metrics.ts`; loading everything, running the clash engine over
 * the registry and stamping the answer with the source that actually answered
 * is all that happens here.
 */

export interface DashboardData extends DashboardMetrics {
  /** "demo" = the simulated registry in data/seed.json, not a live database. */
  mode: DataMode;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const store = await getDataStore();
  const now = new Date();

  const [projects, departments, verifications, reports, segments] =
    await Promise.all([
      store.listProjects(),
      store.listDepartments(),
      store.listAllVerifications(),
      store.listReports(),
      store.listSegments(),
    ]);

  const { clashes } = detectClashes(projects, segments, { now });
  const metrics = computeDashboardMetrics(
    { projects, departments, verifications, reports, clashes },
    { now },
  );

  return { ...metrics, mode: store.mode };
}