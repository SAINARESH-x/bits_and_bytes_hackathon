import { NextResponse } from "next/server";
import { isConsoleAuthed } from "@/lib/console-auth";
import { apiError, fieldError, unauthorized, validationError } from "@/lib/console-api";
import { getDataStore } from "@/lib/data";
import { todayUTCISO } from "@/lib/format";
import {
  consoleProjectUpdateInputSchema,
  isPastPlannedEnd,
} from "@/lib/schemas";

/**
 * POST /api/console/updates — append one status update to a project.
 *
 * Append-only by contract: the store only ever inserts update rows and the
 * schema has no id, so a replay of the same payload creates a new row rather
 * than mutating history.
 *
 * The console-specific rule lives here because it needs the PROJECT row, not
 * just the payload: when a project is past its planned end, an update MUST
 * carry a delay reason. The browser mirrors the rule in the Add Update form;
 * the server is the source of truth and re-checks it against its own clock.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isConsoleAuthed())) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Expected a JSON body.");
  }

  const parsed = consoleProjectUpdateInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const store = await getDataStore();
  const project = await store.getProject(parsed.data.project_id);
  if (!project) {
    return apiError(404, "project_not_found", "No project has that id.");
  }

  if (
    isPastPlannedEnd(project.planned_end, todayUTCISO()) &&
    !parsed.data.delay_reason
  ) {
    return fieldError(
      "delay_reason",
      "This project is past its planned end — a delay reason is required.",
    );
  }

  try {
    const update = await store.addUpdate(parsed.data);
    return NextResponse.json({ update }, { status: 201 });
  } catch (error) {
    return apiError(
      500,
      "update_failed",
      error instanceof Error ? error.message : "Could not save the update.",
    );
  }
}