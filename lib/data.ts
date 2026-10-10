import seed from "@/data/seed.json";
import { resolveSeedDate, resolveSeedDateOptional } from "@/lib/seed-dates";
import type {
  ProjectInput,
  ProjectUpdateInput,
  VerificationInput,
} from "@/lib/schemas";
import { createSupabaseClient } from "@/lib/supabase/client";
import type {
  CitizenReport,
  Department,
  Project,
  ProjectUpdate,
  RoadSegment,
  SeedData,
  Verification,
} from "@/lib/types";

export type DataMode = "demo" | "supabase";

/** Hard ceiling on any Supabase round-trip before we fall back to demo data. */
const QUERY_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// The contract both backends implement.
//
// Pages and route handlers depend on this interface only — they never import
// Supabase directly. Swapping the backend is a decision made once, here.
// ---------------------------------------------------------------------------

export interface DataStore {
  readonly mode: DataMode;
  listDepartments(): Promise<Department[]>;
  listSegments(): Promise<RoadSegment[]>;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  listUpdates(projectId: string): Promise<ProjectUpdate[]>;
  listReports(): Promise<CitizenReport[]>;
  listVerifications(projectId: string): Promise<Verification[]>;
  createProject(input: ProjectInput): Promise<Project>;
  addUpdate(input: ProjectUpdateInput): Promise<ProjectUpdate>;
  addVerification(input: VerificationInput): Promise<Verification>;
}

// ---------------------------------------------------------------------------
// Seed / demo implementation
// ---------------------------------------------------------------------------

/**
 * The committed seed, typed.
 *
 * Dates in it are still day offsets at this point — `hydrateProject` and the
 * store below resolve them against "today" so the demo never goes stale.
 *
 * The JSON import widens tuple types (e.g. LineString coordinates), so the
 * cast goes through unknown rather than pretending the shapes line up.
 */
function readSeed(): SeedData {
  return seed as unknown as SeedData;
}

function hydrateProject(p: SeedData["projects"][number], now: Date): Project {
  return {
    ...p,
    planned_start: resolveSeedDateOptional(p.planned_start, now),
    planned_end: resolveSeedDateOptional(p.planned_end, now),
    actual_start: resolveSeedDateOptional(p.actual_start, now),
    actual_end: resolveSeedDateOptional(p.actual_end, now),
  };
}

/**
 * Demo store: reads data/seed.json, resolving day-offsets to real dates at
 * call time so the demo data never goes stale. Writes mutate an in-memory
 * copy — they survive for the lifetime of the process only, which is enough
 * to exercise the create/update flows without a database.
 */
export function createSeedStore(now: Date = new Date()): DataStore {
  const data = readSeed();
  const projects: Project[] = data.projects.map((p) => hydrateProject(p, now));
  const updates: ProjectUpdate[] = data.project_updates.map((u) => ({
    ...u,
    new_planned_end: resolveSeedDateOptional(u.new_planned_end, now),
    created_at: resolveSeedDate(u.created_at, now) + "T00:00:00.000Z",
  }));
  const verifications: Verification[] = data.verifications.map((v) => ({
    ...v,
    created_at: resolveSeedDate(v.created_at, now) + "T00:00:00.000Z",
  }));
  const reports: CitizenReport[] = data.citizen_reports.map((r) => ({
    ...r,
    created_at: resolveSeedDate(r.created_at, now) + "T00:00:00.000Z",
  }));

  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-local-${++seq}-${Date.now()}`;

  return {
    mode: "demo",
    listDepartments: async () => data.departments,
    listSegments: async () => data.road_segments,
    listProjects: async () => projects,
    getProject: async (id) => projects.find((p) => p.id === id) ?? null,
    listUpdates: async (projectId) =>
      updates
        .filter((u) => u.project_id === projectId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    listReports: async () => reports,
    listVerifications: async (projectId) =>
      verifications.filter((v) => v.project_id === projectId),

    createProject: async (input) => {
      const project: Project = {
        id: nextId("proj"),
        title: input.title,
        purpose: input.purpose,
        project_type: input.project_type,
        department_id: input.department_id,
        contractor_name: input.contractor_name ?? null,
        road_segment_id: input.road_segment_id,
        planned_start: input.planned_start ?? null,
        planned_end: input.planned_end ?? null,
        actual_start: input.actual_start ?? null,
        actual_end: input.actual_end ?? null,
        status: input.status,
        budget_inr: input.budget_inr ?? null,
        // Demo writes are not persisted, so they are still simulated.
        is_simulated: true,
      };
      projects.push(project);
      return project;
    },

    addUpdate: async (input) => {
      const update: ProjectUpdate = {
        id: nextId("upd"),
        project_id: input.project_id,
        status: input.status,
        note: input.note ?? null,
        delay_reason: input.delay_reason ?? null,
        new_planned_end: input.new_planned_end ?? null,
        // Demo writes are not persisted, so they are still simulated.
        is_simulated: true,
        created_at: new Date().toISOString(),
      };
      updates.push(update);
      return update;
    },

    addVerification: async (input) => {
      // Mirror the DB's unique(project_id, device_id) constraint.
      const existing = verifications.find(
        (v) => v.project_id === input.project_id && v.device_id === input.device_id,
      );
      if (existing) {
        existing.vote = input.vote;
        return existing;
      }
      const verification: Verification = {
        id: nextId("ver"),
        project_id: input.project_id,
        vote: input.vote,
        device_id: input.device_id,
        // Demo writes are not persisted, so they are still simulated.
        is_simulated: true,
        created_at: new Date().toISOString(),
      };
      verifications.push(verification);
      return verification;
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

/**
 * Wraps a Supabase call in an AbortController so a hanging database can never
 * wedge a page render. Any failure resolves to null rather than throwing.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const { data, error } = await run(controller.signal);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createSupabaseStore(): DataStore | null {
  const client = createSupabaseClient();
  if (!client) return null;

  return {
    mode: "supabase",

    listDepartments: async () =>
      (await withTimeout((signal) =>
        client.from("departments").select("*").order("name").abortSignal(signal),
      )) ?? [],

    listSegments: async () =>
      (await withTimeout((signal) =>
        client.from("road_segments").select("*").order("name").abortSignal(signal),
      )) ?? [],

    listProjects: async () =>
      (await withTimeout((signal) =>
        client.from("projects").select("*").order("planned_start").abortSignal(signal),
      )) ?? [],

    getProject: async (id) =>
      await withTimeout((signal) =>
        client
          .from("projects")
          .select("*")
          .eq("id", id)
          .abortSignal(signal)
          .maybeSingle(),
      ),

    listUpdates: async (projectId) =>
      (await withTimeout((signal) =>
        client
          .from("project_updates")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at")
          .abortSignal(signal),
      )) ?? [],

    listReports: async () =>
      (await withTimeout((signal) =>
        client.from("citizen_reports").select("*").order("created_at").abortSignal(signal),
      )) ?? [],

    listVerifications: async (projectId) =>
      (await withTimeout((signal) =>
        client
          .from("verifications")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at")
          .abortSignal(signal),
      )) ?? [],

    // Writes go through the anon key, which is read-only under RLS. Until the
    // service-role path exists, persisting is a no-op that still returns a
    // row-shaped result so callers don't special-case the mode.
    createProject: async (input) => {
      const row = await withTimeout((signal) =>
        client.from("projects").insert(input).select().abortSignal(signal).single(),
      );
      if (!row) throw new Error("Could not save the project. Please try again.");
      return row as Project;
    },

    addUpdate: async (input) => {
      const row = await withTimeout((signal) =>
        client
          .from("project_updates")
          .insert(input)
          .select()
          .abortSignal(signal)
          .single(),
      );
      if (!row) throw new Error("Could not save the update. Please try again.");
      return row as ProjectUpdate;
    },

    addVerification: async (input) => {
      // Upsert on (project_id, device_id) to match the DB unique constraint.
      const row = await withTimeout((signal) =>
        client
          .from("verifications")
          .upsert(input, { onConflict: "project_id,device_id" })
          .select()
          .abortSignal(signal)
          .single(),
      );
      if (!row) throw new Error("Could not save your vote. Please try again.");
      return row as Verification;
    },
  };
}

// ---------------------------------------------------------------------------
// Mode selection
// ---------------------------------------------------------------------------

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * The store the app should use.
 *
 * Supabase env present -> Supabase, unless the credentials are unusable, in
 * which case we degrade to the seed. No env -> seed. Pages never branch on
 * this; they just call the methods.
 */
export async function getDataStore(): Promise<DataStore> {
  if (!hasSupabaseEnv()) return createSeedStore();

  const supabase = createSupabaseStore();
  if (!supabase) return createSeedStore();

  // Cheap probe: if the DB is unreachable or the schema isn't loaded, fall
  // back so the app keeps working rather than rendering errors.
  const probe = await supabase.listProjects();
  return probe.length > 0 ? supabase : createSeedStore();
}

// ---------------------------------------------------------------------------
// Convenience functions — the API most callers want.
// ---------------------------------------------------------------------------

export function getDataMode(): DataMode {
  return hasSupabaseEnv() ? "supabase" : "demo";
}

/**
 * Everything the registry screens need, resolved against ONE store in ONE
 * round trip.
 *
 * The convenience functions below each resolve the store on their own, and
 * `getDataStore` probes Supabase before deciding — so a page calling four of
 * them pays for four probes. This is the entry point both list screens use
 * instead.
 */
export interface RegistryData {
  projects: Project[];
  segments: RoadSegment[];
  departments: Department[];
}

export async function loadRegistry(): Promise<RegistryData> {
  const store = await getDataStore();
  const [projects, segments, departments] = await Promise.all([
    store.listProjects(),
    store.listSegments(),
    store.listDepartments(),
  ]);
  return { projects, segments, departments };
}

export async function listProjects(): Promise<Project[]> {
  const store = await getDataStore();
  return store.listProjects();
}

export async function getProject(id: string): Promise<Project | null> {
  const store = await getDataStore();
  return store.getProject(id);
}

export async function listSegments(): Promise<RoadSegment[]> {
  const store = await getDataStore();
  return store.listSegments();
}

export async function listDepartments(): Promise<Department[]> {
  const store = await getDataStore();
  return store.listDepartments();
}

export async function listUpdates(projectId: string): Promise<ProjectUpdate[]> {
  const store = await getDataStore();
  return store.listUpdates(projectId);
}

export async function listReports(): Promise<CitizenReport[]> {
  const store = await getDataStore();
  return store.listReports();
}

export async function listVerifications(
  projectId: string,
): Promise<Verification[]> {
  const store = await getDataStore();
  return store.listVerifications(projectId);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const store = await getDataStore();
  return store.createProject(input);
}

export async function addUpdate(input: ProjectUpdateInput): Promise<ProjectUpdate> {
  const store = await getDataStore();
  return store.addUpdate(input);
}

export async function addVerification(input: VerificationInput): Promise<Verification> {
  const store = await getDataStore();
  return store.addVerification(input);
}
