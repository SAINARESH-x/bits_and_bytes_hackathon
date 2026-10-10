import { NextResponse } from "next/server";
import { CONSOLE_COOKIE } from "@/lib/console-auth";

/**
 * POST /api/console/logout — drop the session cookie.
 *
 * Deliberately does not require an active session: clearing a cookie that is
 * not there is safe and idempotent, so the button always works.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CONSOLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}