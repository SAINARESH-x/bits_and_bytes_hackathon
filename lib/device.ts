import type { VerificationVote } from "@/lib/types";

/**
 * Device identity for anonymous votes (PLAN.md M6 item 5).
 *
 * There is no account: a random UUID minted once and kept in `localStorage`
 * stands in for "this device". The DB enforces at most one vote per
 * (project_id, device_id), so the same device cannot vote twice even though it
 * can clear the client store — the server is the source of truth.
 *
 * Every localStorage access is wrapped in try/catch and falls back to an
 * in-memory value: private modes, disabled storage and SSR must not throw.
 */

const DEVICE_KEY = "digsync:device_id:v1";
const VOTES_KEY = "digsync:votes:v1";

/** A process-lifetime fallback when localStorage is unavailable. */
let memoryDeviceId: string | null = null;

function readStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** RFC 4122 v4 UUID, with a fallback for browsers without crypto.randomUUID. */
function randomUuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual generator
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This device's stable UUID; created and persisted on first use. */
export function getDeviceId(): string {
  const storage = readStorage();
  if (storage) {
    try {
      const existing = storage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const created = randomUuid();
      storage.setItem(DEVICE_KEY, created);
      return created;
    } catch {
      // fall through to memory
    }
  }
  memoryDeviceId ??= randomUuid();
  return memoryDeviceId;
}

type VoteMap = Record<string, VerificationVote>;

function readVotes(): VoteMap {
  const storage = readStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(VOTES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as VoteMap) : {};
  } catch {
    return {};
  }
}

function writeVotes(votes: VoteMap): void {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(VOTES_KEY, JSON.stringify(votes));
  } catch {
    // Storage full or blocked — the server still holds the real vote.
  }
}

/** What this device last voted on a project (a UI hint, not the source of truth). */
export function getStoredVote(projectId: string): VerificationVote | null {
  return readVotes()[projectId] ?? null;
}

export function setStoredVote(projectId: string, vote: VerificationVote): void {
  const votes = readVotes();
  votes[projectId] = vote;
  writeVotes(votes);
}
