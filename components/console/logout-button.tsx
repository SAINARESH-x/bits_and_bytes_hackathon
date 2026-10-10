"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** POST /api/console/logout, then re-render the server component (login form). */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/console/logout", { method: "POST" });
    } catch {
      // The cookie may still be dropped next refresh; either way we end up
      // back at the login screen, so there is nothing actionable to show.
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium enabled:hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-neutral-700 dark:enabled:hover:bg-neutral-800"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}