/**
 * Shared JSON error helpers for the /api/console routes.
 *
 * The console client and the route handlers agree on one response shape:
 * `{ error, message, issues? }` where `issues` is a list of
 * `{ path, message }` pairs the forms map straight onto fields (Zod already
 * produces exactly that shape on the server, so a form can never show a
 * message that differs from what the server rejected).
 */

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function apiError(
  status: number,
  error: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

export function unauthorized(): NextResponse {
  return apiError(
    401,
    "unauthorized",
    "Your console session has expired. Sign in again.",
  );
}

/** 422 with the parsed Zod issues, mapped onto form fields. */
export function validationError(error: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "validation_failed",
      message: "The submitted data is invalid.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 422 },
  );
}

/** 422 for a rule that needs server context (e.g. "past planned end"). */
export function fieldError(path: string, message: string): NextResponse {
  return NextResponse.json(
    { error: "validation_failed", message, issues: [{ path, message }] },
    { status: 422 },
  );
}