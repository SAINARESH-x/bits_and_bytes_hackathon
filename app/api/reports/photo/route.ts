import { NextResponse } from "next/server";
import { apiError, rateLimited } from "@/lib/api-response";
import { getClientIp } from "@/lib/client-ip";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/image/compress";
import { stripImageMetadata } from "@/lib/image/metadata";
import { PHOTO_RATE_LIMIT, checkRateLimit } from "@/lib/rate-limit";
import { PLACEHOLDER_PHOTO_URL } from "@/lib/report-photo";
import { PHOTO_EXTENSIONS, uploadReportPhoto } from "@/lib/supabase/storage";

/**
 * POST /api/reports/photo — accept, validate and store one report photo.
 *
 * Pipeline: rate-limit by IP -> parse multipart -> check MIME type and size ->
 * strip EXIF/metadata server-side -> upload with the service-role key, or fall
 * back to the committed placeholder when Storage is not configured (demo mode).
 *
 * The client compresses to <= 1 MB first, but nothing it sends is trusted: the
 * MIME type and the byte length are re-checked here, and the actual container is
 * sniffed so a renamed file cannot smuggle a different format through.
 */

export const dynamic = "force-dynamic";

function extensionFor(contentType: string): string {
  return PHOTO_EXTENSIONS[contentType] ?? "bin";
}

/**
 * Is this form entry an uploaded file?
 *
 * `value instanceof File` is NOT reliable: the `File` global is not defined on
 * every Node runtime Next supports (undici provides the File that
 * `request.formData()` returns, and it is not the global constructor), so an
 * `instanceof` check throws `ReferenceError: File is not defined` at request
 * time. Duck-typing the Blob surface works across runtimes and still rejects a
 * plain string field.
 */
function asFile(value: FormDataEntryValue | null): File | null {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).type === "string" &&
    typeof (value as Blob).size === "number"
  ) {
    return value as File;
  }
  return null;
}

export async function POST(request: Request) {
  const limit = checkRateLimit(
    `photo:${getClientIp(request)}`,
    PHOTO_RATE_LIMIT.limit,
    PHOTO_RATE_LIMIT.windowMs,
  );
  if (!limit.allowed) return rateLimited(limit);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "invalid_form", "Expected a multipart form upload.");
  }

  const file = asFile(form.get("photo"));
  if (!file) {
    return apiError(400, "photo_required", "Attach a photo to upload.");
  }

  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return apiError(
      415,
      "unsupported_type",
      "Only JPG, PNG or WebP images are accepted.",
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return apiError(
      413,
      "photo_too_large",
      "That photo is larger than 1 MB. Please choose a smaller image.",
    );
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const stripped = stripImageMetadata(raw);

  // A file whose bytes are not the declared image type is rejected rather than
  // stored blindly.
  if (stripped.format === "unknown") {
    return apiError(415, "unsupported_type", "That file is not a valid image.");
  }

  const upload = await uploadReportPhoto({
    data: stripped.data,
    contentType: file.type,
    extension: extensionFor(file.type),
  });

  if (upload) {
    return NextResponse.json({
      url: upload.url,
      stored: true,
      demo: false,
      metadataStripped: stripped.stripped,
    });
  }

  // No Storage configured (or the upload failed): keep the report usable with
  // the placeholder and be explicit that the real photo was not kept.
  return NextResponse.json({
    url: PLACEHOLDER_PHOTO_URL,
    stored: false,
    demo: true,
    metadataStripped: stripped.stripped,
    notice:
      "Demo mode: photo storage is not configured, so a placeholder image is used instead of your photo.",
  });
}
