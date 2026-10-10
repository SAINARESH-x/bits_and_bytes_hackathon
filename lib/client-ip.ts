/**
 * Best-effort client address for rate limiting.
 *
 * `x-forwarded-for` is set by the platform proxy (Vercel etc.); the first hop
 * is the originating client. A direct request with no proxy header falls back
 * to "unknown", which still rate-limits as a single shared bucket rather than
 * disabling the limiter.
 *
 * This is advisory only: a client can spoof the header when it is not behind a
 * trusted proxy. It is good enough to stop casual abuse of a demo write route,
 * not a security boundary.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return "unknown";
}
