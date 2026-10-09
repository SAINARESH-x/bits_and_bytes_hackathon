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

const dateOnly = z
  .string()
  .regex(DATE_ONLY, "Expected a date in YYYY-MM-DD format");

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
  "pothole",
  "open_trench",
  "damaged_structure",
  "blocked_drain",
  "waterlogging",
  "debris_obstruction",
  "unsafe_opening",
  "unlisted_digging",
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
    title: z.string().trim().min(3, "Title must be at least 3 characters"),
    purpose: z.string().trim().min(3, "Purpose must be at least 3 characters"),
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

// ---------------------------------------------------------------------------
// Citizen reports
// ---------------------------------------------------------------------------

export const citizenReportInputSchema = z
  .object({
    project_id: z.string().uuid().nullable().optional(),
    report_type: reportTypeEnum,
    description: z.string().trim().min(5, "Describe what you saw"),
    photo_url: z.string().url("Photo must be a URL").nullable().optional(),
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

// ---------------------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------------------

export const verificationInputSchema = z.object({
  project_id: z.string().uuid(),
  vote: verificationVoteEnum,
  device_id: deviceIdSchema,
});

export type VerificationInput = z.infer<typeof verificationInputSchema>;
