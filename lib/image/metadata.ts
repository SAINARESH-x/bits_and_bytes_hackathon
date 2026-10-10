/**
 * Server-side image metadata stripping (PLAN.md M6 item 2).
 *
 * Report photos are re-encoded in the browser before upload, which already
 * drops EXIF — but the server cannot assume a browser was involved, so it
 * strips metadata again from the bytes it actually receives. A phone photo can
 * carry GPS coordinates in EXIF, and publishing that beside a report is a
 * privacy leak with real-world consequences.
 *
 * Hand-written JPEG / PNG / WebP container parsing — no image or EXIF
 * dependency is added. Only metadata segments are removed; pixel data is left
 * byte-for-byte untouched. Any format we do not recognise is returned
 * unchanged with `stripped: false`, and the caller records that limitation.
 *
 * Scope: this is a metadata remover, not a metadata *reader*. It cannot tell
 * whether a photo had GPS, only that the chunks which could hold it are gone.
 */

export type ImageFormat = "jpeg" | "png" | "webp" | "unknown";

export interface StripResult {
  data: Buffer;
  format: ImageFormat;
  /** True when at least one metadata segment/chunk was removed. */
  stripped: boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageFormat(buffer: Buffer): ImageFormat {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return "unknown";
}

/** Does an APP1 payload look like EXIF or XMP rather than, say, an ICC tag? */
function isApp1Metadata(payload: Buffer): boolean {
  return (
    payload.subarray(0, 6).equals(Buffer.from("Exif\0\0", "ascii")) ||
    payload
      .subarray(0, 29)
      .equals(Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"))
  );
}

/**
 * Walk the JPEG marker segments up to the start of scan (SOS), dropping APP1
 * (EXIF/XMP), APP13 (Photoshop IRB) and COM (comment) segments. Everything from
 * SOS onward — the entropy-coded image — is copied verbatim, because those
 * bytes may legitimately contain 0xFF sequences that are not markers.
 */
function stripJpeg(buffer: Buffer): StripResult {
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let stripped = false;
  let i = 2;

  while (i + 1 < buffer.length) {
    if (buffer[i] !== 0xff) {
      // Malformed structure; hand back the original rather than corrupt it.
      return { data: buffer, format: "jpeg", stripped: false };
    }

    const marker = buffer[i + 1];

    // Fill bytes and standalone markers carry no payload length.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      parts.push(buffer.subarray(i, i + 2));
      i += 2;
      if (marker === 0xd9) break; // EOI
      continue;
    }

    if (i + 3 >= buffer.length) break;
    const length = buffer.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buffer.length) {
      return { data: buffer, format: "jpeg", stripped: false };
    }
    const end = i + 2 + length;

    const drop =
      marker === 0xfe || // COM
      marker === 0xed || // APP13
      (marker === 0xe1 && isApp1Metadata(buffer.subarray(i + 4, end))); // APP1

    if (drop) stripped = true;
    else parts.push(buffer.subarray(i, end));

    i = end;

    if (marker === 0xda) {
      // Start of scan: copy the remainder untouched.
      parts.push(buffer.subarray(i));
      i = buffer.length;
      break;
    }
  }

  if (i < buffer.length) parts.push(buffer.subarray(i));
  return { data: Buffer.concat(parts), format: "jpeg", stripped };
}

/** Ancillary PNG chunks that may carry location, timestamps or free text. */
const PNG_DROP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(buffer: Buffer): StripResult {
  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let stripped = false;
  let i = 8;

  while (i + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(i);
    const type = buffer.toString("ascii", i + 4, i + 8);
    const end = i + 12 + length; // length + type(4) + data + crc(4)
    if (length > buffer.length || end > buffer.length) {
      return { data: buffer, format: "png", stripped: false };
    }

    if (PNG_DROP_CHUNKS.has(type)) stripped = true;
    else parts.push(buffer.subarray(i, end));

    i = end;
    if (type === "IEND") break;
  }

  if (i < buffer.length) parts.push(buffer.subarray(i));
  return { data: Buffer.concat(parts), format: "png", stripped };
}

/** RIFF chunks that hold metadata. */
const WEBP_DROP_CHUNKS = new Set(["EXIF", "XMP "]);

function stripWebp(buffer: Buffer): StripResult {
  const parts: Buffer[] = [];
  let stripped = false;
  let i = 12; // past "RIFF" + size + "WEBP"

  while (i + 8 <= buffer.length) {
    const fourcc = buffer.toString("ascii", i, i + 4);
    const size = buffer.readUInt32LE(i + 4);
    const padded = size + (size % 2);
    const end = i + 8 + padded;
    if (end > buffer.length) break;

    if (WEBP_DROP_CHUNKS.has(fourcc)) {
      stripped = true;
    } else if (fourcc === "VP8X" && size >= 1) {
      // Clear the EXIF (0x08) and XMP (0x04) presence bits so a decoder does
      // not expect metadata we just removed.
      const chunk = Buffer.from(buffer.subarray(i, end));
      chunk[8] &= ~0x08;
      chunk[8] &= ~0x04;
      parts.push(chunk);
    } else {
      parts.push(buffer.subarray(i, end));
    }

    i = end;
  }

  const chunks = Buffer.concat(parts);
  const webp = Buffer.from("WEBP", "ascii");
  const size = Buffer.alloc(4);
  // The RIFF size field counts everything after the first 8 bytes, i.e. the
  // "WEBP" form label plus the retained chunks.
  size.writeUInt32LE(webp.length + chunks.length, 0);
  return {
    // Standard layout: RIFF (0-3) + size (4-7) + WEBP (8-11) + chunks.
    data: Buffer.concat([Buffer.from("RIFF", "ascii"), size, webp, chunks]),
    format: "webp",
    stripped,
  };
}

/** Strip metadata from the bytes we actually received, by sniffing the format. */
export function stripImageMetadata(buffer: Buffer): StripResult {
  const format = detectImageFormat(buffer);
  switch (format) {
    case "jpeg":
      return stripJpeg(buffer);
    case "png":
      return stripPng(buffer);
    case "webp":
      return stripWebp(buffer);
    default:
      return { data: buffer, format, stripped: false };
  }
}

/** Convenience for callers that only want the cleaned bytes. */
export function stripMetadataBytes(buffer: Buffer): Buffer {
  return stripImageMetadata(buffer).data;
}
