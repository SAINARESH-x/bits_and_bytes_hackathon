import { NextResponse } from "next/server";
import { isConsoleAuthed } from "@/lib/console-auth";
import { apiError, unauthorized, validationError } from "@/lib/console-api";
import { createProject } from "@/lib/data";
import { projectInputSchema } from "@/lib/schemas";

/**
 * POST /api/console/projects — create a project from the console.
 *
 * The console reads the NEW project form's fields and re-validates them with
 * the SAME Zod schema the browser used (lib/schemas.ts is shared on purpose).
 * The payload is never trusted: date ordering, calendar validity, budget sign
 * and enum values are all re-checked here before the store is touched.
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

  const parsed = projectInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const project = await createProject(parsed.data);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(
      500,
      "create_failed",
      error instanceof Error ? error.message : "Could not save the project.",
    );
  }
}