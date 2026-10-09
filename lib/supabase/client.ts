import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns a Supabase client only when BOTH public env vars are present.
 * Without them the app runs in demo mode off data/seed.json — see lib/data.ts.
 *
 * The client is intentionally NOT module-scoped: create it per request so a
 * missing key can never be captured into a long-lived singleton at build time.
 */
export function createSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Keep a ceiling on requests so a hanging DB never wedges a page render.
    global: { headers: { "x-client-info": "digsync" } },
  });
}
