/**
 * Constants shared by the report-photo flow.
 *
 * Kept out of the route file because Next validates route-handler exports —
 * only handlers and segment config may be exported from `route.ts`.
 */

/**
 * Committed placeholder used in demo mode (and whenever Storage is not
 * configured). It is deliberately a generic image, never the user's photo.
 */
export const PLACEHOLDER_PHOTO_URL = "/report-placeholder.svg";
