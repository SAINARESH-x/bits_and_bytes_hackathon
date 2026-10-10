import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NOOP_WEBSOCKET_TRANSPORT } from "@/lib/supabase/transport";

/**
 * Server-only Supabase Storage upload for citizen report photos.
 *
 * Uploads use the SERVICE-ROLE key: the anon key is read-only under the RLS
 * policies in supabase/schema.sql (and the bucket has no anon-write policy), so
 * only the server may write objects. The key never leaves the server — this
 * module is imported exclusively by route handlers.
 *
 * When the key is absent (demo mode, or a Supabase project without storage
 * configured) `uploadReportPhoto` returns null and the caller substitutes the
 * committed placeholder image. The app therefore works with no storage at all.
 */

const DEFAULT_BUCKET = "report-photos";

function bucketName(): string {
  return process.env.SUPABASE_REPORT_BUCKET || DEFAULT_BUCKET;
}

/**
 * A service-role client, or null when storage is not configured. Built per
 * call rather than cached so a missing key can never be captured at build time.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: NOOP_WEBSOCKET_TRANSPORT },
    });
  } catch {
    return null;
  }
}

export interface UploadResult {
  url: string;
}

/**
 * Upload cleaned image bytes and return their public URL, or null on any
 * failure (missing credentials, network error, bucket missing) so the caller
 * can fall back to the placeholder instead of failing the report.
 */
export async function uploadReportPhoto(args: {
  data: Buffer;
  contentType: string;
  extension: string;
}): Promise<UploadResult | null> {
  const client = createServiceClient();
  if (!client) return null;

  const objectPath = `reports/${crypto.randomUUID()}.${args.extension}`;
  try {
    const { error } = await client.storage
      .from(bucketName())
      .upload(objectPath, args.data, { contentType: args.contentType, upsert: false });
    if (error) return null;

    const { data } = client.storage.from(bucketName()).getPublicUrl(objectPath);
    return data.publicUrl ? { url: data.publicUrl } : null;
  } catch {
    return null;
  }
}

/** MIME type -> file extension for the formats the upload route accepts. */
export const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
