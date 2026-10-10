"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONTROL =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

/**
 * The DEMO_PASSCODE prompt. Submits to POST /api/console/login; on success
 * the server sets an httpOnly cookie and `router.refresh()` re-renders the
 * server component, which now sees an authenticated session and swaps this
 * form for the workspace. Handles the wrong-passcode, rate-limited, disabled
 * and offline cases, and disables the button while a request is in flight
 * (double submit).
 */
export function LoginForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!passcode.trim()) {
      setError("Enter the passcode.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/console/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(payload?.message ?? "Could not sign in. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="console-login-heading"
      className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h1 id="console-login-heading" className="text-xl font-bold tracking-tight">
        Department console
      </h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        This console is protected by the shared demo passcode (
        <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
          DEMO_PASSCODE
        </code>
        ). Production would use real accounts — a shared passcode is the
        hackathon stand-in, and rate limiting keeps guessers out.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-4">
        <div>
          <label
            htmlFor="console-passcode"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Passcode
          </label>
          <input
            id="console-passcode"
            name="passcode"
            type="password"
            required
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => {
              setPasscode(event.target.value);
              if (error) setError(null);
            }}
            className={CONTROL}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-white"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
        <p className="sr-only" aria-live="polite">
          {pending ? "Checking passcode…" : ""}
        </p>
      </form>
    </section>
  );
}