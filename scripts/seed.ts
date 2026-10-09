/**
 * Load data/seed.json into Supabase.
 *
 * Usage:
 *   npm run seed            # insert everything (fails if tables have rows)
 *   npm run seed -- --reset # wipe the tables first, then insert
 *
 * Requires .env.local (or exported env) with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   <- server-only; bypasses RLS
 *
 * Why the service-role key: the anon key is read-only under the RLS policies
 * in supabase/schema.sql, so an insert with it is rejected. This script runs
 * on your machine, never in the browser bundle.
 *
 * EVERY row it writes is simulated. That is not a caveat — it is enforced
 * below: each row is validated and stamped with is_simulated = true.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSeedDate, resolveSeedDateOptional } from "../lib/seed-dates";
import { NOOP_WEBSOCKET_TRANSPORT } from "../lib/supabase/transport";
import {
  citizenReportInputSchema,
  projectInputSchema,
  projectUpdateInputSchema,
} from "../lib/schemas";
import type { SeedData, SeedDate } from "../lib/types";

const RESET = process.argv.includes("--reset");

/**
 * Minimal .env.local loader.
 *
 * Node's own `--env-file` flag needs >=20.6, but this repo also has to run on
 * the team's Node 18 machines, so the file is parsed here rather than by a
 * flag or an added dotenv dependency. A value already present in the real
 * environment always wins, so exported values and CI secrets are never
 * overwritten.
 */
function loadEnvFile(filename: string): void {
  let raw: string;
  try {
    raw = readFileSync(filename, "utf8");
  } catch {
    return; // missing file is fine — the message below explains what is needed
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    [
      "Missing environment variables.",
      "",
      "Set these in .env.local (see .env.example) or export them:",
      "  NEXT_PUBLIC_SUPABASE_URL       https://<project>.supabase.co",
      "  SUPABASE_SERVICE_ROLE_KEY      <Project Settings -> API -> service_role>",
      "",
      "The anon key will NOT work: RLS makes these tables read-only for it.",
    ].join("\n"),
  );
  process.exit(1);
}

const client: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Realtime is never used here, but supabase-js always constructs a
  // RealtimeClient that needs a global WebSocket (Node 22+ only) — without
  // this, createClient throws on Node 18/20 before seeding can start.
  realtime: { transport: NOOP_WEBSOCKET_TRANSPORT },
});

// Insert order respects foreign keys.
const TABLES = [
  "verifications",
  "citizen_reports",
  "project_updates",
  "projects",
  "road_segments",
  "departments",
] as const;

type Seed = SeedData;

async function reset(): Promise<void> {
  console.log("Resetting tables (children first)...");
  for (const table of TABLES) {
    const { error } = await client.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`Reset ${table} failed: ${error.message}`);
  }
}

async function countRows(table: string): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return count ?? 0;
}

async function insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).insert(rows);
  if (error) {
    throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const raw = readFileSync(new URL("../data/seed.json", import.meta.url), "utf8");
  const seed = JSON.parse(raw) as Seed;

  if (seed.is_simulated !== true) {
    throw new Error("Refusing to seed: data/seed.json is not marked is_simulated.");
  }

  // Resolve relative dates (day offsets) against today so the demo data is
  // always plausible, then stamp is_simulated on every single row.
  const today = new Date();
  const iso = (d: SeedDate | null) => resolveSeedDateOptional(d, today);

  const departments = seed.departments.map((d) => ({ ...d, is_simulated: true }));
  const segments = seed.road_segments.map((s) => ({ ...s, is_simulated: true }));

  const projects = seed.projects.map((p) => {
    const row = {
      id: p.id,
      title: p.title,
      purpose: p.purpose,
      project_type: p.project_type,
      department_id: p.department_id,
      contractor_name: p.contractor_name ?? null,
      road_segment_id: p.road_segment_id,
      planned_start: iso(p.planned_start),
      planned_end: iso(p.planned_end),
      actual_start: iso(p.actual_start),
      actual_end: iso(p.actual_end),
      status: p.status,
      budget_inr: p.budget_inr ?? null,
      is_simulated: true,
    };
    // Validate before it reaches the database — a bad seed is a bug, not a
    // Postgres error three layers down.
    projectInputSchema.parse(row);
    return row;
  });

  const updates = seed.project_updates.map((u) => {
    const row = {
      project_id: u.project_id,
      status: u.status,
      note: u.note ?? null,
      delay_reason: u.delay_reason ?? null,
      new_planned_end: iso(u.new_planned_end),
      is_simulated: true,
    };
    projectUpdateInputSchema.parse(row);
    return { ...row, id: u.id, created_at: resolveSeedDate(u.created_at, today) };
  });

  const reports = seed.citizen_reports.map((r) => {
    const row = {
      project_id: r.project_id ?? null,
      report_type: r.report_type,
      description: r.description,
      photo_url: r.photo_url ?? null,
      lat: r.lat,
      lng: r.lng,
      is_unlisted_work: r.is_unlisted_work,
    };
    citizenReportInputSchema.parse(row);
    return { ...row, id: r.id, created_at: resolveSeedDate(r.created_at, today), is_simulated: true };
  });

  const verifications = seed.verifications.map((v) => ({
    id: v.id,
    project_id: v.project_id,
    vote: v.vote,
    device_id: v.device_id,
    is_simulated: true,
    created_at: resolveSeedDate(v.created_at, today),
  }));

  console.log("Seed loaded from data/seed.json");
  console.log(
    `  ${departments.length} departments, ${segments.length} segments, ` +
      `${projects.length} projects, ${updates.length} updates, ` +
      `${reports.length} reports, ${verifications.length} verifications`,
  );
  console.log(`  dates resolved against today (${today.toISOString().slice(0, 10)})`);

  if (RESET) {
    await reset();
  } else {
    const existing = await countRows("projects");
    if (existing > 0) {
      throw new Error(
        `Table "projects" already has ${existing} row(s).\n` +
          "Re-run with --reset to wipe and reload:  npm run seed -- --reset",
      );
    }
  }

  // Children first would violate FKs; parents must land before their rows.
  await insert("departments", departments);
  await insert("road_segments", segments);
  await insert("projects", projects);
  await insert("project_updates", updates);
  await insert("citizen_reports", reports);
  await insert("verifications", verifications);

  console.log("\nDone. Verify with:");
  console.log(
    "  select count(*) from projects where is_simulated = true;  -- expect",
    projects.length,
  );
}

main().catch((err: unknown) => {
  console.error("\nSeeding failed.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
