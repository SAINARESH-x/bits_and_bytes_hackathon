import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { RateLimitResult } from "@/lib/rate-limit";

/**
 * Shared JSON response shapes for the app's route handlers.
 *
 * One error contract for every mutating endpoint: `{ error, message, issues? }`
 * where `issues` is a list of `{ path, message }` pairs the forms map straight
 * onto fields. Zod already produces that shape on the server, so a form can
 * never show a message that differs from what the server rejected.
 */

export function apiError(
  status: number,
  error: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

/** 400 for a request body that is not JSON at all. */
export function invalidJson(): NextResponse {
  return apiError(400, "invalid_json", "Expected a JSON body.");
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

/** 422 for a rule that needs server context (e.g. "not near any project"). */
export function fieldError(path: string, message: string): NextResponse {
  return NextResponse.json(
    { error: "validation_failed", message, issues: [{ path, message }] },
    { status: 422 },
  );
}

/**
 * 429 for a rate-limited write. The `retry-after` header is in seconds and the
 * message tells the user how long to wait, so the client can be honest instead
 * of showing a generic failure.
 */
export function rateLimited(result: RateLimitResult): NextResponse {
  const seconds = result.retryAfterSeconds;
  return NextResponse.json(
    {
      error: "rate_limited",
      message: `Too many submissions from this connection. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    },
    { status: 429, headers: { "retry-after": String(seconds) } },
  );
}

/**
 * Silent rejection for a tripped honeypot.
 *
 * The response is a plain 400 with no hint that a hidden field was the cause —
 * a bot learns nothing it can tune around, while a real user never sees it
 * because the field is off-screen and unfocusable.
 */
export function honeypotRejected(): NextResponse {
  return apiError(
    400,
    "rejected",
    "This submission could not be accepted. If you are a person, please reload the page and try again.",
  );
}
