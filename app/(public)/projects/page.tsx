import { ProjectCard } from "@/components/project-card";
import { getDataStore, type DataStore } from "@/lib/data";
import type { CitizenReport } from "@/lib/types";

export const metadata = { title: "Projects — DigSync" };
export const dynamic = "force-dynamic";

/**
 * Loads everything the list needs in ONE round-trip. Detail-style pages that
 * fetch per-row turn into N+1 queries the moment real data lands, so the
 * lookups are inverted here: fetch all segments/departments once, index by id.
 */
async function loadList(store: DataStore) {
  const [projects, segments, departments, allReports] = await Promise.all([
    store.listProjects(),
    store.listSegments(),
    store.listDepartments(),
    store.listReports(),
  ]);

  const segmentById = new Map(segments.map((s) => [s.id, s]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  const reportsByProject = new Map<string, CitizenReport[]>();
  for (const r of allReports) {
    if (!r.project_id) continue;
    const list = reportsByProject.get(r.project_id) ?? [];
    list.push(r);
    reportsByProject.set(r.project_id, list);
  }

  return { projects, segmentById, departmentById, reportsByProject };
}

export default async function ProjectsPage() {
  const store = await getDataStore();
  const { projects, segmentById, departmentById } = await loadList(store);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {projects.length} simulated project{projects.length === 1 ? "" : "s"} across
          {" "}{segmentById.size} road segments.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
          <p className="font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Nothing is in the registry. If you expected data, run{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
              npm run seed
            </code>
            .
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              department={departmentById.get(p.department_id) ?? null}
              segment={segmentById.get(p.road_segment_id) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
