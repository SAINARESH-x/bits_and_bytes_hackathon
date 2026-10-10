"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api-client";

/** POST /api/console/logout, then re-render the server component (login form). */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    try {
      // postJson with retries:0 — logout is idempotent but a retry is never
      // needed: the cookie is cleared on the FIRST attempt even if the
      // response is lost; router.refresh() below lands on the login screen
      // either way. The timeout just guarantees a wedged request cannot leave
      // the button stuck on "Signing out…".
      await postJson("/api/console/logout", {}, { retries: 0 });
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