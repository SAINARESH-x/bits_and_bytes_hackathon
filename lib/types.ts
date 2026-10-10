/**
 * Domain types shared across the app.
 *
 * These mirror supabase/schema.sql exactly. Every entity carries
 * `is_simulated` — see AGENTS.md "Data honesty". This is a hard rule, not a
 * convention: nothing here is ever presented as real.
 */

export type ProjectType =
  | "road"
  | "drain"
  | "water_pipeline"
  | "power_cable"
  | "fibre"
  | "other";

export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "stalled"
  | "completed"
  | "cancelled";

export type DelayReason =
  | "contractor_delay"
  | "monsoon"
  | "permit_pending"
  | "material_shortage"
  | "utility_conflict"
  | "redesign"
  | "budget_held"
  | "unforeseen_ground_condition"
  | "other";

export type ReportType =
  | "unsafe_barricade"
  | "work_stalled"
  | "poor_road_restoration"
  | "debris_dust_noise"
  | "unlisted_work"
  | "other";

export type VerificationVote = "confirm" | "dispute";

export type ProfileRole = "admin" | "department";

/** GeoJSON LineString in EPSG:4326 — coordinates are [lon, lat]. */
export interface LineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  is_simulated: boolean;
}

export interface RoadSegment {
  id: string;
  name: string;
  ward: string;
  geometry: LineString;
  is_simulated: boolean;
}

export interface Project {
  id: string;
  title: string;
  purpose: string;
  project_type: ProjectType;
  department_id: string;
  contractor_name: string | null;
  road_segment_id: string;
  /** Date-only strings (YYYY-MM-DD) in UTC. */
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: ProjectStatus;
  budget_inr: number | null;
  is_simulated: boolean;
}

/** Append-only row on a project. Never updated once written. */
export interface ProjectUpdate {
  id: string;
  project_id: string;
  status: ProjectStatus;
  note: string | null;
  delay_reason: DelayReason | null;
  new_planned_end: string | null;
  is_simulated: boolean;
  created_at: string;
}

/** `project_id: null` + `is_unlisted_work: true` = digging with no registry entry. */
export interface CitizenReport {
  id: string;
  project_id: string | null;
  report_type: ReportType;
  description: string;
  photo_url: string | null;
  lat: number;
  lng: number;
  is_unlisted_work: boolean;
  is_simulated: boolean;
  created_at: string;
}

export interface Verification {
  id: string;
  project_id: string;
  vote: VerificationVote;
  device_id: string;
  is_simulated: boolean;
  created_at: string;
}

/**
 * A Project joined with the rows an author actually needs for display, so
 * components never issue their own lookups.
 */
export interface ProjectWithRelations extends Project {
  department: Department | null;
  segment: RoadSegment | null;
  updates: ProjectUpdate[];
  verifications: { confirm: number; dispute: number };
  report_count: number;
}

// ---------------------------------------------------------------------------
// Seed-specific shapes. The seed stores dates as day offsets from "today"
// rather than absolute dates, so the demo data never goes stale — see
// lib/seed-dates.ts.
// ---------------------------------------------------------------------------

/** ISO date (YYYY-MM-DD) or a day offset relative to today (may be negative). */
export type SeedDate = string | number;

export interface SeedProject extends Omit<
  Project,
  "planned_start" | "planned_end" | "actual_start" | "actual_end"
> {
  planned_start: SeedDate | null;
  planned_end: SeedDate | null;
  actual_start: SeedDate | null;
  actual_end: SeedDate | null;
}

export interface SeedProjectUpdate
  extends Omit<ProjectUpdate, "new_planned_end" | "created_at"> {
  new_planned_end: SeedDate | null;
  created_at: SeedDate;
}

export interface SeedCitizenReport extends Omit<CitizenReport, "created_at"> {
  created_at: SeedDate;
}

export interface SeedVerification extends Omit<Verification, "created_at"> {
  created_at: SeedDate;
}

export interface SeedData {
  is_simulated: true;
  generated_at: string;
  note: string;
  /** Describes the planted demo scenarios for whoever reads the seed. */
  scenarios: string[];
  departments: Department[];
  road_segments: RoadSegment[];
  projects: SeedProject[];
  project_updates: SeedProjectUpdate[];
  citizen_reports: SeedCitizenReport[];
  verifications: SeedVerification[];
}
