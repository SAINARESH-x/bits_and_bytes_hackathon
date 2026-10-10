import Link from "next/link";
import { ReportForm } from "@/components/report/report-form";
import { loadRegistry } from "@/lib/data";

export const metadata = { title: "Report an issue — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ project?: string }>;
}

/**
 * The citizen report screen (PLAN.md M6 items 1–3).
 *
 * The registry is loaded once here and handed to the client form, which uses
 * the same pure proximity logic the server runs so the suggested project and
 * the eventual link agree. `?project=<id>` (from a project page's "Report an
 * issue" button) is passed through as a hint only.
 */
export default async function ReportPage({ searchParams }: PageProps) {
  const { project: projectParam } = await searchParams;
  const { projects, segments } = await loadRegistry();

  const initialProjectId =
    projectParam && projects.some((p) => p.id === projectParam)
      ? projectParam
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Report an issue</h1>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Spotted an unsafe barricade, a stalled site, a bad road restoration,
          dust and debris, or digging that is not in the registry at all? File a
          report with a photo and a location. Reports within 100 m of a
          registered work are linked to it automatically; everything else is
          flagged as unlisted work.
        </p>
        <p className="text-sm">
          <Link
            href="/following"
            className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            My followed projects →
          </Link>
        </p>
      </header>

      <ReportForm
        projects={projects}
        segments={segments}
        initialProjectId={initialProjectId}
      />
    </div>
  );
}
