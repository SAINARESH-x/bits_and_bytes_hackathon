import { listProjects } from "@/lib/data";

export const metadata = { title: "Projects — DigSync" };

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Projects</h1>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
          <p className="font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            The simulated registry is empty in this build. Full project detail
            arrives in the next milestone.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                  {p.status.replace("_", " ")}
                </span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                  {p.utility_type}
                </span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  simulated
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {p.purpose}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
