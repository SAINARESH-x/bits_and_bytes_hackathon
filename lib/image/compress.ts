/**
 * Client-side photo compression (PLAN.md M6 item 2).
 *
 * A modern phone photo is 3–8 MB, but the task caps uploads at 1 MB. Rather
 * than reject the user's photo, the browser downscales and re-encodes it until
 * it fits. Re-drawing through a canvas also drops the original EXIF as a side
 * effect — the server strips again (lib/image/metadata.ts) because it cannot
 * trust that a browser did this.
 *
 * Output is always JPEG: it has an adjustable quality knob (PNG does not) and
 * a geotagged photo has no transparency to preserve. The route still accepts
 * PNG/WebP uploads, so a non-browser client is not locked out.
 */

export const MAX_PHOTO_BYTES = 1_048_576; // 1 MiB
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const MAX_DIMENSION = 1600;
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5];
const MAX_PASSES = 5;

export interface CompressResult {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
}

/** Scale (w, h) down so the longest side is at most `max`, preserving ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isAcceptedPhotoType(type: string): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type);
}

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Downscale and re-encode `file` to at most `MAX_PHOTO_BYTES`. Throws a
 * user-readable Error when the image cannot be read or cannot be squeezed
 * under the cap (an extreme input, not a normal photo).
 */
export async function compressImage(
  file: File,
  options: { maxBytes?: number; maxDimension?: number } = {},
): Promise<CompressResult> {
  const maxBytes = options.maxBytes ?? MAX_PHOTO_BYTES;
  const maxDimension = options.maxDimension ?? MAX_DIMENSION;

  if (!isAcceptedPhotoType(file.type)) {
    throw new Error("Please attach a JPG, PNG or WebP image.");
  }

  const decoded = await decode(file);
  try {
    let { width, height } = fitWithin(decoded.width, decoded.height, maxDimension);

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot process images.");
      context.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= maxBytes) {
          const base = file.name.replace(/\.[^.]+$/, "") || "report-photo";
          return { blob, fileName: `${base}.jpg`, width, height };
        }
      }

      // Still too big: shrink another 20% and try again.
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    throw new Error("That image is too large to process. Try a smaller photo.");
  } finally {
    decoded.cleanup();
  }
}
