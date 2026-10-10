import type { Metadata } from "next";
import { AddUpdateForm } from "@/components/console/add-update-form";
import { LoginForm } from "@/components/console/login-form";
import { LogoutButton } from "@/components/console/logout-button";
import { NewProjectForm } from "@/components/console/new-project-form";
import { consoleConfigured, isConsoleAuthed } from "@/lib/console-auth";
import { loadRegistry } from "@/lib/data";

export const metadata: Metadata = { title: "Console — DigSync" };

// Reads cookies + env per request — never statically cached.
export const dynamic = "force-dynamic";

/**
 * /console — the department-side flow behind DEMO_PASSCODE.
 *
 * Not authed -> the login form. Authed -> two forms: New Project (with a live
 * clash preview) and Add Update (delay reason required on late projects).
 * The gate is a server-side check of an httpOnly cookie; see
 * lib/console-auth.ts for the (deliberately demo-grade) security model.
 */
export default async function ConsolePage() {
  const enabled = consoleConfigured();
  const authed = enabled && (await isConsoleAuthed());

  if (!enabled) {
    return (
      <section
        aria-labelledby="console-disabled-heading"
        className="mx-auto max-w-lg rounded-lg border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 id="console-disabled-heading" className="text-xl font-bold">
          Console disabled
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          The department console is switched off because{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
            DEMO_PASSCODE
          </code>{" "}
          is not set. Set it in the server environment to enable the console.
        </p>
      </section>
    );
  }

  if (!authed) {
    return <LoginForm />;
  }

  const { projects, segments, departments } = await loadRegistry();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Department console</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Create works and log status updates. Writes go to the same
            (simulated) registry that backs the public site, so a project
            created here appears on the map, in the list and on the clash
            board immediately.
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <NewProjectForm
          projects={projects}
          segments={segments}
          departments={departments}
        />
        <AddUpdateForm projects={projects} />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Access is gated by the shared{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
          DEMO_PASSCODE
        </code>{" "}
        (an httpOnly session cookie). A production build would replace this
        with real authentication — Supabase Auth with role-based access and
        RLS-backed writes — instead of a shared passcode.
      </p>
    </div>
  );
}