/**
 * Domain types shared across the app.
 *
 * Every entity carries `is_simulated` — see AGENTS.md "Data honesty".
 * This is a hard rule, not a convention: nothing here is ever presented as real.
 */

export type UtilityType = "road" | "drain" | "water" | "power" | "fibre";

export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "stalled"
  | "cancelled";

export interface Department {
  id: string;
  name: string;
  code: string;
  is_simulated: true;
}

export interface Contractor {
  id: string;
  name: string;
  is_simulated: true;
}

/** A stretch of road. `adjacency` holds ids of nearby corridors (precomputed, <= ~60m). */
export interface Corridor {
  id: string;
  road_name: string;
  locality: string;
  lat: number;
  lng: number;
  adjacency: string[];
  is_simulated: true;
}

export interface Project {
  id: string;
  corridor_id: string;
  department_id: string;
  contractor_id: string | null;
  title: string;
  purpose: string;
  utility_type: UtilityType;
  status: ProjectStatus;
  /** Date-only strings (YYYY-MM-DD) in UTC. */
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  restored_at?: string;
  budget_inr?: number;
  delay_reason?: string;
  is_simulated: true;
}

/** `project_id: null` means an UNLISTED work — discovered by a citizen, not in the registry. */
export interface CitizenReport {
  id: string;
  project_id: string | null;
  lat: number;
  lng: number;
  category: string;
  description: string;
  photo_url?: string;
  created_at: string;
  is_simulated: true;
}

/** Shape of data/seed.json. */
export interface SeedData {
  is_simulated: true;
  generated_at: string;
  note: string;
  departments: Department[];
  contractors: Contractor[];
  corridors: Corridor[];
  projects: Project[];
  citizen_reports: CitizenReport[];
}
