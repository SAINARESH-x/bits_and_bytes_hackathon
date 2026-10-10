import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

/**
 * Console-specific JSON error helpers.
 *
 * The generic shapes (apiError / validationError / fieldError) now live in
 * lib/api-response.ts because the public citizen write routes use them too;
 * they are re-exported here so the console routes and their tests keep their
 * existing import path.
 */

export { apiError, fieldError, validationError } from "@/lib/api-response";

export function unauthorized(): NextResponse {
  return apiError(
    401,
    "unauthorized",
    "Your console session has expired. Sign in again.",
  );
}
