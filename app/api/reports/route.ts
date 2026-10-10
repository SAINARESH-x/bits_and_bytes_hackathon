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
import { getDataStore } from "@/lib/data";
import {
  AUTO_LINK_RADIUS_M,
  EXPLICIT_LINK_TOLERANCE_M,
  findNearbyActiveProjects,
  nearestActiveProject,
} from "@/lib/geo-link";
import { REPORT_RATE_LIMIT, checkRateLimit } from "@/lib/rate-limit";
import { citizenReportInputSchema } from "@/lib/schemas";

/**
 * POST /api/reports — file a citizen report (PLAN.md M6 items 1 and 3).
 *
 * The browser suggests a project by proximity, but the SERVER decides: it
 * re-runs the pure link logic over the registry it actually holds. A report
 * within 100 m of an active project is linked to it; otherwise it is flagged
 * `is_unlisted_work` — which is exactly how digging nobody announced surfaces.
 *
 * A user override ("this is not the nearby project, it is an unlisted work",
 * or an explicit `unlisted_work` report type) always wins, and an explicit
 * project id is only accepted when that project is genuinely in range.
 */

export const dynamic = "force-dynamic";

/** Pull the honeypot field without assuming the body is a well-formed object. */
function honeypotTripped(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>).hp;
  return typeof value === "string" && value.trim() !== "";
}

export async function POST(request: Request) {
  const limit = checkRateLimit(
    `reports:${getClientIp(request)}`,
    REPORT_RATE_LIMIT.limit,
    REPORT_RATE_LIMIT.windowMs,
  );
  if (!limit.allowed) return rateLimited(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  if (honeypotTripped(body)) return honeypotRejected();

  const parsed = citizenReportInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  const store = await getDataStore();
  const [projects, segments] = await Promise.all([
    store.listProjects(),
    store.listSegments(),
  ]);
  const point: [number, number] = [input.lng, input.lat];

  // The report type itself can declare the work unlisted, and the form can set
  // the flag directly; either way it is taken at face value.
  const forcedUnlisted =
    input.is_unlisted_work || input.report_type === "unlisted_work";

  let projectId: string | null = null;
  let isUnlisted = false;
  let linkedDistance: number | null = null;

  if (forcedUnlisted) {
    isUnlisted = true;
  } else if (input.project_id) {
    const match = findNearbyActiveProjects(
      point,
      projects,
      segments,
      EXPLICIT_LINK_TOLERANCE_M,
    ).find((m) => m.project.id === input.project_id);

    if (!match) {
      return fieldError(
        "project_id",
        "The selected project is not near the reported location.",
      );
    }
    projectId = match.project.id;
    linkedDistance = match.distanceMeters;
  } else {
    const nearest = nearestActiveProject(
      point,
      projects,
      segments,
      AUTO_LINK_RADIUS_M,
    );
    if (nearest) {
      projectId = nearest.project.id;
      linkedDistance = nearest.distanceMeters;
    } else {
      isUnlisted = true;
    }
  }

  try {
    // Construct the row from validated fields only; never spread the raw body.
    const report = await store.createReport({
      ...input,
      project_id: projectId,
      is_unlisted_work: isUnlisted,
    });

    return NextResponse.json(
      {
        report,
        linked: projectId !== null,
        isUnlistedWork: isUnlisted,
        distanceMeters: linkedDistance,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(
      500,
      "report_failed",
      error instanceof Error ? error.message : "Could not save the report.",
    );
  }
}
