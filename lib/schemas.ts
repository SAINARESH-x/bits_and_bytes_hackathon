import { z } from "zod";

/**
 * Validation schemas shared by client and server.
 *
 * The server is the source of truth: every route handler parses its body with
 * these before touching the database. The client reuses the same schemas so a
 * form can never accept something the server would reject — one definition,
 * no drift.
 *
 * Note the DB also enforces the window ordering (see supabase/schema.sql
 * CHECK constraints). We re-check here so a bad payload fails fast with a
 * readable message instead of a Postgres error.
 */

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "2026-02-30" passes the shape regex but is not a calendar day. The
 * round-trip check (parse, then re-serialize) rejects impossible dates the
 * same way the clash engine does in lib/clash/window.ts — a typo must fail
 * validation, not silently become 2 March.
 */
function isValidCalendarDay(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const dateOnly = z
  .string()
  .regex(DATE_ONLY, "Expected a date in YYYY-MM-DD format")
  .refine(isValidCalendarDay, "Not a real calendar day");

/** Optional date: allow "" from a form, normalise to null. */
const dateOnlyOptional = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  dateOnly.nullable(),
);

export const projectTypeEnum = z.enum([
  "road",
  "drain",
  "water_pipeline",
  "power_cable",
  "fibre",
  "other",
]);

export const projectStatusEnum = z.enum([
  "planned",
  "in_progress",
  "stalled",
  "completed",
  "cancelled",
]);

export const delayReasonEnum = z.enum([
  "contractor_delay",
  "monsoon",
  "permit_pending",
  "material_shortage",
  "utility_conflict",
  "redesign",
  "budget_held",
  "unforeseen_ground_condition",
  "other",
]);

export const reportTypeEnum = z.enum([
  "unsafe_barricade",
  "work_stalled",
  "poor_road_restoration",
  "debris_dust_noise",
  "unlisted_work",
  "other",
]);

export const verificationVoteEnum = z.enum(["confirm", "dispute"]);

/** A UUID v4-ish string. Loose on purpose — devices mint these client-side. */
export const deviceIdSchema = z
  .string()
  .uuid("device_id must be a UUID")
  .describe("Client-generated UUID stored in localStorage");

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** `id` is omitted on create; the DB generates it. */
export const projectInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be under 200 characters"),
    purpose: z
      .string()
      .trim()
      .min(3, "Purpose must be at least 3 characters")
      .max(2000, "Purpose must be under 2000 characters"),
    project_type: projectTypeEnum,
    department_id: z.string().uuid("Unknown department"),
    contractor_name: z
      .string()
      .trim()
      .max(120)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    road_segment_id: z.string().uuid("Unknown road segment"),
    planned_start: dateOnlyOptional,
    planned_end: dateOnlyOptional,
    actual_start: dateOnlyOptional,
    actual_end: dateOnlyOptional,
    status: projectStatusEnum.default("planned"),
    budget_inr: z.coerce
      .number()
      .nonnegative("Budget cannot be negative")
      .nullable()
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.planned_start && val.planned_end && val.planned_end < val.planned_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planned_end"],
        message: "Planned end cannot be before the planned start",
      });
    }
    if (val.actual_start && val.actual_end && val.actual_end < val.actual_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actual_end"],
        message: "Actual end cannot be before the actual start",
      });
    }
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;

// ---------------------------------------------------------------------------
// Project updates (append-only)
// ---------------------------------------------------------------------------

export const projectUpdateInputSchema = z
  .object({
    project_id: z.string().uuid(),
    status: projectStatusEnum,
    note: z.string().trim().max(1000).nullable().optional(),
    delay_reason: delayReasonEnum.nullable().optional(),
    new_planned_end: dateOnlyOptional,
  })
  .superRefine((val, ctx) => {
    if (val.status !== "stalled" && val.delay_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delay_reason"],
        message: "A delay reason only makes sense when status is 'stalled'",
      });
    }
  });

export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;

/**
 * The console's update payload.
 *
 * Unlike the public schema, a delay_reason is allowed alongside ANY status:
 * the console's rule — "a delay reason is REQUIRED once a project is past its
 * planned end" — applies equally to a late completion or a still-running job,
 * not just a stall. Whether the project actually IS past due is server-side
 * context (the payload does not carry the project's planned end), so that half
 * of the rule lives in the route handler and is mirrored by the Add Update
 * form. Empty note / reason / end-date values from a form normalise to null.
 */
export const consoleProjectUpdateInputSchema = z.object({
  project_id: z.string().uuid(),
  status: projectStatusEnum,
  note: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().trim().max(1000, "Note is too long").nullable(),
  ),
  delay_reason: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    delayReasonEnum.nullable(),
  ),
  new_planned_end: dateOnlyOptional,
});

export type ConsoleProjectUpdateInput = z.infer<
  typeof consoleProjectUpdateInputSchema
>;

/**
 * Is a project past its planned end? `today` is the UTC YYYY-MM-DD string the
 * server (and the mirrored form) uses as "now". Strictly-after: a project
 * whose planned end is today is not yet late. YYYY-MM-DD strings compare
 * correctly with plain lexicographic `<`, so no date parsing is needed.
 */
export function isPastPlannedEnd(
  plannedEnd: string | null | undefined,
  today: string,
): boolean {
  return typeof plannedEnd === "string" && plannedEnd !== "" && today > plannedEnd;
}

// ---------------------------------------------------------------------------
// Citizen reports
// ---------------------------------------------------------------------------

/**
 * A stored photo is either an absolute URL (Supabase Storage, or any https
 * host) or an app-local path such as `/report-placeholder.svg` (demo mode).
 * A blank string from a form normalises to null rather than failing.
 */
const photoUrlSchema = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .trim()
    .max(2048, "Photo URL is too long")
    .refine(
      (v) => v.startsWith("/") || /^https?:\/\//i.test(v),
      "Photo must be an https URL or an app-local path",
    )
    .nullable(),
);

export const citizenReportInputSchema = z
  .object({
    project_id: z.string().uuid().nullable().optional(),
    report_type: reportTypeEnum,
    description: z
      .string()
      .trim()
      .min(10, "Please describe what you saw in at least 10 characters")
      .max(500, "Please keep the description under 500 characters"),
    photo_url: photoUrlSchema,
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    is_unlisted_work: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    // An unlisted dig, by definition, has no matching registry entry.
    if (val.is_unlisted_work && val.project_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project_id"],
        message: "An unlisted work cannot be linked to a project",
      });
    }
  });

export type CitizenReportInput = z.infer<typeof citizenReportInputSchema>;

/**
 * The vote payload, minus the project id — the route takes that from the path
 * so a caller cannot vote on a different project than the one in the URL.
 */
export const verdictInputSchema = z.object({
  vote: verificationVoteEnum,
  device_id: deviceIdSchema,
});

export type VerdictInput = z.infer<typeof verdictInputSchema>;

// ---------------------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------------------

export const verificationInputSchema = z.object({
  project_id: z.string().uuid(),
  vote: verificationVoteEnum,
  device_id: deviceIdSchema,
});

export type VerificationInput = z.infer<typeof verificationInputSchema>;
