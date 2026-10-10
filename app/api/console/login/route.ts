import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CONSOLE_COOKIE,
  CONSOLE_SESSION_MAX_AGE_SECONDS,
  consoleConfigured,
  sessionTokenFor,
  verifyPasscode,
} from "@/lib/console-auth";
import {
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/console-rate-limit";

/**
 * POST /api/console/login — exchange the shared passcode for an httpOnly
 * session cookie.
 *
 * Security posture (demo-appropriate, not production):
 * - The passcode is compared with a constant-time digest comparison.
 * - The session cookie is httpOnly + sameSite=lax (+ secure in production),
 *   so page JS cannot read or forge it.
 * - Failed attempts are rate-limited per client IP (in-memory sliding window,
 *   see lib/console-rate-limit.ts).
 * - With DEMO_PASSCODE unset the console is disabled outright (503) — there
 *   is no "open by default" fallback.
 */

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  passcode: z.string().trim().min(1, "Enter the passcode").max(256),
});

export async function POST(request: Request) {
  if (!consoleConfigured()) {
    return NextResponse.json(
      {
        error: "console_disabled",
        message:
          "The console is disabled. Set DEMO_PASSCODE in the server environment to enable it.",
      },
      { status: 503 },
    );
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many failed attempts. Try again in 15 minutes.",
      },
      { status: 429, headers: { "retry-after": String(15 * 60) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordFailedAttempt(ip);
    return NextResponse.json(
      { error: "passcode_required", message: "Enter the passcode." },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    recordFailedAttempt(ip);
    return NextResponse.json(
      { error: "passcode_required", message: "Enter the passcode." },
      { status: 400 },
    );
  }

  if (!verifyPasscode(parsed.data.passcode)) {
    recordFailedAttempt(ip);
    return NextResponse.json(
      { error: "invalid_passcode", message: "Wrong passcode — please try again." },
      { status: 401 },
    );
  }

  clearAttempts(ip);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    CONSOLE_COOKIE,
    // `consoleConfigured()` above guarantees the env var is present.
    sessionTokenFor(process.env.DEMO_PASSCODE!),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CONSOLE_SESSION_MAX_AGE_SECONDS,
    },
  );
  return response;
}