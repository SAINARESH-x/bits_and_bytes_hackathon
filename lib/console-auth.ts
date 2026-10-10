/**
 * Server-only console authentication.
 *
 * The "console" (/console + its API routes) is the demo stand-in for the
 * department/official flow: creating projects and logging status updates. It
 * is gated by a SINGLE shared passcode read from the DEMO_PASSCODE env var —
 * deliberately NOT real authentication. If this ships past the hackathon,
 * replace this module with real auth (Supabase Auth + roles, RLS), not a
 * shared secret. See AGENTS.md / PLAN.md — real auth is on the cut list.
 *
 * Session model: after a successful login the server sets an httpOnly cookie
 * whose value is an HMAC-SHA256 of the passcode. The browser never sees the
 * passcode or the cookie value (httpOnly), and verification is a
 * constant-time comparison of two digests, so a timing side-channel cannot
 * leak the token.
 *
 * This module reads env at call time (never at import time) so tests can
 * toggle DEMO_PASSCODE, and so a stale build cannot capture a secret.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const CONSOLE_COOKIE = "digsync_console";
export const CONSOLE_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SESSION_SALT = "digsync-console-session-v1";

/** The console exists only when a passcode is configured. */
export function consoleConfigured(): boolean {
  const passcode = process.env.DEMO_PASSCODE;
  return typeof passcode === "string" && passcode.length > 0;
}

function digestHex(value: string): string {
  return createHmac("sha256", value).update(SESSION_SALT).digest("hex");
}

/** The cookie value a fresh login receives for `passcode`. */
export function sessionTokenFor(passcode: string): string {
  return digestHex(passcode);
}

/** Constant-time equality for two hex digests. Safe for untrusted input. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Is `token` a valid session cookie for the given passcode? */
export function verifyConsoleSession(
  token: string | null | undefined,
  passcode: string | undefined,
): boolean {
  if (!token || !passcode) return false;
  return safeEqualHex(token, sessionTokenFor(passcode));
}

/** Does `input` match the configured DEMO_PASSCODE? (constant-time compare.) */
export function verifyPasscode(input: string): boolean {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return false;
  return safeEqualHex(digestHex(input), digestHex(expected));
}

/**
 * True when the current request carries a valid console session.
 *
 * `cookies()` throws outside a request scope (it needs the Next request
 * context); that is treated as "not authed" so the guard can never be
 * satisfied by accident.
 */
export async function isConsoleAuthed(): Promise<boolean> {
  if (!consoleConfigured()) return false;
  try {
    const store = await cookies();
    return verifyConsoleSession(
      store.get(CONSOLE_COOKIE)?.value,
      process.env.DEMO_PASSCODE,
    );
  } catch {
    return false;
  }
}