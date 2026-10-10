import { NextResponse } from "next/server";
import {
  apiError,
  fieldError,
  honeypotRejected,
  invalidJson,
  rateLimited,
  validationError,
} from "@/lib/api-response";
import { getClientIp } from "@/lib/client-ip";
import { isContested, tally } from "@/lib/contested";
import { getDataStore } from "@/lib/data";
import { VERDICT_RATE_LIMIT, checkRateLimit } from "@/lib/rate-limit";
import { verdictInputSchema } from "@/lib/schemas";

/**
 * POST /api/projects/[id]/verdicts — confirm or dispute a completed project.
 *
 * One vote per DEVICE per project, not per account: the id comes from
 * localStorage and the DB's `unique (project_id, device_id)` constraint backs
 * it up. A second vote from the same device REPLACES the first (the store
 * upserts), so a changed mind is allowed and no double-count is possible.
 *
 * Only completed projects can be voted on — "is this really finished?" is
 * meaningless for work that has not claimed to be finished.
 */

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Anything that cannot be an id is rejected before the data layer is touched,
 * mirroring the project detail page. Demo ids are `proj-…` slug-style strings
 * (not UUIDs), so this is a permissive shape check, not `.uuid()`.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function honeypotTripped(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>).hp;
  return typeof value === "string" && value.trim() !== "";
}

export async function POST(request: Request, context: RouteContext) {
  const limit = checkRateLimit(
    `verdicts:${getClientIp(request)}`,
    VERDICT_RATE_LIMIT.limit,
    VERDICT_RATE_LIMIT.windowMs,
  );
  if (!limit.allowed) return rateLimited(limit);

  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return apiError(404, "project_not_found", "No project has that id.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  if (honeypotTripped(body)) return honeypotRejected();

  const parsed = verdictInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const store = await getDataStore();
  const project = await store.getProject(id);
  if (!project) {
    return apiError(404, "project_not_found", "No project has that id.");
  }

  if (project.status !== "completed") {
    return fieldError(
      "vote",
      "Residents can only verify a project once it is marked completed.",
    );
  }

  try {
    const verification = await store.addVerification({
      project_id: id,
      vote: parsed.data.vote,
      device_id: parsed.data.device_id,
    });

    const updatedTally = tally(await store.listVerifications(id));
    return NextResponse.json({
      verification,
      tally: updatedTally,
      contested: isContested(updatedTally),
    });
  } catch (error) {
    return apiError(
      500,
      "verdict_failed",
      error instanceof Error ? error.message : "Could not save your vote.",
    );
  }
}
