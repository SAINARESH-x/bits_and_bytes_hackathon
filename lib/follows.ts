/**
 * Followed projects, stored on the device (PLAN.md M6 item 4).
 *
 * There is no account, so "following" is a list of project ids in
 * `localStorage` plus the timestamp the device last acknowledged changes. Every
 * access is wrapped in try/catch and degrades to an empty state — private
 * browsing modes, disabled storage and SSR must never throw.
 *
 * Reads are best-effort and unvalidated on purpose: local storage is the
 * user's own device and the worst case is a dropped id, not a security issue.
 */

const FOLLOWS_KEY = "digsync:follows:v1";
const CHANGE_EVENT = "digsync:follows-changed";

export interface FollowState {
  ids: string[];
  /** ISO timestamp of the last time the user saw the followed-project feed. */
  lastSeenAt: string | null;
}

const EMPTY: FollowState = { ids: [], lastSeenAt: null };

function readStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitise(value: unknown): FollowState {
  if (!value || typeof value !== "object") return EMPTY;
  const record = value as { ids?: unknown; lastSeenAt?: unknown };
  const ids = Array.isArray(record.ids)
    ? record.ids.filter((id): id is string => typeof id === "string")
    : [];
  const lastSeenAt = typeof record.lastSeenAt === "string" ? record.lastSeenAt : null;
  return { ids: [...new Set(ids)], lastSeenAt };
}

export function readFollows(): FollowState {
  const storage = readStorage();
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(FOLLOWS_KEY);
    if (!raw) return EMPTY;
    return sanitise(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

function writeFollows(state: FollowState): void {
  const storage = readStorage();
  if (storage) {
    try {
      storage.setItem(FOLLOWS_KEY, JSON.stringify(state));
    } catch {
      // Full or blocked storage — following simply does not persist.
    }
  }
  // Let other components on the page react without a shared store.
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }
  } catch {
    // CustomEvent unavailable (very old browser / test env) — non-fatal.
  }
}

/** Subscribe to follow changes made anywhere in the page. Returns an unsubscribe. */
export function subscribeFollows(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  // `storage` fires only for OTHER tabs, but it keeps multiple tabs in step.
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function getFollowedIds(): string[] {
  return readFollows().ids;
}

export function isFollowed(projectId: string): boolean {
  return readFollows().ids.includes(projectId);
}

/** Follow if not followed, unfollow if followed. Returns the new followed state. */
export function toggleFollow(projectId: string): boolean {
  const state = readFollows();
  const followed = state.ids.includes(projectId);
  const ids = followed
    ? state.ids.filter((id) => id !== projectId)
    : [...state.ids, projectId];

  // The first thing a device follows starts the clock: without a baseline the
  // "what changed" feed would otherwise replay the entire history.
  const lastSeenAt = state.lastSeenAt ?? new Date().toISOString();
  writeFollows({ ids, lastSeenAt });
  return !followed;
}

/** Drop a project from the followed list. */
export function unfollow(projectId: string): void {
  const state = readFollows();
  writeFollows({ ...state, ids: state.ids.filter((id) => id !== projectId) });
}

export function getLastSeenAt(): string | null {
  return readFollows().lastSeenAt;
}

/** Acknowledge everything currently shown as "changed". */
export function markFollowsSeen(now: string = new Date().toISOString()): void {
  const state = readFollows();
  writeFollows({ ...state, lastSeenAt: now });
}
