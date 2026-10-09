import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NOOP_WEBSOCKET_TRANSPORT } from "@/lib/supabase/transport";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns a Supabase client only when BOTH public env vars are present.
 * Without them the app runs in demo mode off data/seed.json — see lib/data.ts.
 *
 * The client is intentionally NOT module-scoped: create it per request so a
 * missing key can never be captured into a long-lived singleton at build time.
 *
 * Returns null (rather than throwing) on ANY construction failure, so a broken
 * credential or an unsupported runtime degrades to demo mode instead of
 * crashing every page.
 */
export function createSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // DigSync issues no realtime subscriptions, but supabase-js builds a
      // RealtimeClient that wants a global WebSocket (Node 22+ only).
      realtime: { transport: NOOP_WEBSOCKET_TRANSPORT },
      // Keep a ceiling on requests so a hanging DB never wedges a page render.
      global: { headers: { "x-client-info": "digsync" } },
    });
  } catch {
    // Never let client construction break a render — lib/data.ts falls back
    // to data/seed.json when this returns null.
    return null;
  }
}
