import { FollowingView } from "@/components/following-view";
import { getDataStore } from "@/lib/data";

export const metadata = { title: "My followed projects — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Server shell for the followed-projects feed (PLAN.md M6 item 4).
 *
 * Follows are per-device and live in localStorage, so all the server can do is
 * hand down the full registry and update log; the client view intersects them
 * with what the device actually follows. The whole update log is small (a demo
 * registry), so one round trip beats a per-follow lookup.
 */
export default async function FollowingPage() {
  const store = await getDataStore();
  const [projects, segments, departments, updates] = await Promise.all([
    store.listProjects(),
    store.listSegments(),
    store.listDepartments(),
    store.listAllUpdates(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">My followed projects</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Projects you follow on this device, with anything that changed since
          you last opened this page. No account is needed — the list is stored in
          this browser only.
        </p>
      </header>

      <FollowingView
        projects={projects}
        segments={segments}
        departments={departments}
        updates={updates}
      />
    </div>
  );
}
