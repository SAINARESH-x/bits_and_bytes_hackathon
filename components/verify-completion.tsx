"use client";

import { useEffect, useState } from "react";
import { ContestedBadge } from "@/components/contested-badge";
import { friendlyError, postJson } from "@/lib/api-client";
import { isContested, type VoteTally } from "@/lib/contested";
import { getDeviceId, getStoredVote, setStoredVote } from "@/lib/device";
import type { VerificationVote } from "@/lib/types";

/**
 * "Is this really finished?" — confirm/dispute a completed project's status
 * (PLAN.md M6 item 5).
 *
 * One vote per device: the device id comes from localStorage, and the server's
 * unique (project_id, device_id) constraint is the real guard. Voting again
 * replaces your previous vote, so a changed mind is allowed and the tally never
 * double-counts. The honeypot field is unfocusable and off-screen; only a bot
 * fills it.
 */

interface VerifyCompletionProps {
  projectId: string;
  initialTally: VoteTally;
}

interface VerdictResponse {
  tally: VoteTally;
  contested: boolean;
}

export function VerifyCompletion({ projectId, initialTally }: VerifyCompletionProps) {
  const [votes, setVotes] = useState<VoteTally>(initialTally);
  const [mine, setMine] = useState<VerificationVote | null>(null);
  const [pending, setPending] = useState<VerificationVote | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    setMine(getStoredVote(projectId));
  }, [projectId]);

  const contested = isContested(votes);

  async function vote(vote: VerificationVote) {
    if (pending) return;
    setPending(vote);
    setError(null);
    setNotice(null);

    const result = await postJson<VerdictResponse>(
      `/api/projects/${projectId}/verdicts`,
      { vote, device_id: getDeviceId(), hp: honeypot },
    );

    setPending(null);

    if (!result.ok || !result.data) {
      setError(friendlyError(result));
      return;
    }

    setVotes(result.data.tally);
    setMine(vote);
    setStoredVote(projectId, vote);
    setNotice(
      vote === "confirm"
        ? "Thanks — you confirmed this job looks finished."
        : "Thanks — your dispute was recorded.",
    );
  }

  return (
    <section
      aria-labelledby="verification-heading"
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="verification-heading" className="text-lg font-semibold">
          Is this really finished?
        </h2>
        {contested ? <ContestedBadge /> : null}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        This project is marked completed. If you live or work nearby, tell us
        whether the road/work actually looks finished. One vote per device — you
        can change it any time.
      </p>

      <div className="mt-4 flex flex-wrap gap-6">
        <div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {votes.confirm}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">confirmed</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {votes.dispute}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">disputed</p>
        </div>
      </div>

      {contested ? (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
          Residents dispute this completion. It is surfaced on the dashboard as
          contested.
        </p>
      ) : null}

      {/* Honeypot: hidden from users and assistive tech, irresistible to bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor={`hp-verdict-${projectId}`}>Leave this field empty</label>
        <input
          id={`hp-verdict-${projectId}`}
          name="hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => vote("confirm")}
          disabled={pending !== null}
          className={`rounded border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${
            mine === "confirm"
              ? "border-emerald-700 bg-emerald-600 text-white"
              : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          }`}
        >
          {pending === "confirm" ? "Saving…" : "✓ Confirm finished"}
        </button>
        <button
          type="button"
          onClick={() => vote("dispute")}
          disabled={pending !== null}
          className={`rounded border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 ${
            mine === "dispute"
              ? "border-red-700 bg-red-600 text-white"
              : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          }`}
        >
          {pending === "dispute" ? "Saving…" : "✕ Dispute — not finished"}
        </button>
      </div>

      {mine ? (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          You voted <span className="font-medium">{mine}</span> on this device.
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
