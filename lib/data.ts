import seed from "@/data/seed.json";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { Project, SeedData } from "@/lib/types";

export type DataMode = "demo" | "supabase";

const DEMO_FALLBACK_MS = 3000;

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Which backend the app is talking to right now.
 * Surfaced by /api/health and shown in the UI so demo mode is never mistaken
 * for a live database (AGENTS.md "Data honesty").
 */
export function getDataMode(): DataMode {
  return hasSupabaseEnv() ? "supabase" : "demo";
}

/** The simulated dataset backing demo mode. Never shown as real. */
export function getSeed(): SeedData {
  return seed as SeedData;
}

/** Reads from the committed seed. Always available, never hits the network. */
export function listProjectsFromSeed(): Project[] {
  return getSeed().projects;
}

/**
 * Fetch from Postgres with a hard timeout. Returns null on ANY failure
 * (missing table, network, auth) so callers can fall back to demo data
 * rather than rendering an error page.
 */
async function fetchProjectsFromSupabase(): Promise<Project[] | null> {
  const client = createSupabaseClient();
  if (!client) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEMO_FALLBACK_MS);

  try {
    // Table lands in M2. Until it exists this rejects and we degrade to demo,
    // which is exactly the required behaviour when Supabase is unreachable.
    const { data, error } = await client
      .from("projects")
      .select("*")
      .order("planned_start", { ascending: false })
      .abortSignal(controller.signal);

    if (error || !data) return null;
    return data as Project[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single read path for projects. Switches automatically:
 *   Supabase env present -> try Postgres (3s timeout) -> fall back to seed
 *   otherwise            -> seed.json
 *
 * Callers never need to know which mode they are in.
 */
export async function listProjects(): Promise<Project[]> {
  if (hasSupabaseEnv()) {
    const rows = await fetchProjectsFromSupabase();
    if (rows) return rows;
  }
  return listProjectsFromSeed();
}
