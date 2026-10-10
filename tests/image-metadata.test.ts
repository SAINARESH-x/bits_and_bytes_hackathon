import { describe, expect, it } from "vitest";
import {
  detectImageFormat,
  stripImageMetadata,
  stripMetadataBytes,
} from "@/lib/image/metadata";

/**
 * The stripper edits container bytes by hand, so these tests build tiny but
 * structurally valid JPEG / PNG / WebP buffers and assert that metadata
 * segments disappear while the rest survives untouched.
 */

// --- JPEG -------------------------------------------------------------------

/** APP1 EXIF segment: FF E1, length, "Exif\0\0", then a small payload. */
function jpegApp1Exif(payload: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), payload]);
  const length = body.length + 2;
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xe1;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, body]);
}

function jpegApp0(): Buffer {
  // A non-metadata APP0 (JFIF) segment — must be KEPT.
  const body = Buffer.from("JFIF\0\u0001\u0001", "binary");
  const length = body.length + 2;
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xe0;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, body]);
}

function jpegCom(): Buffer {
  const body = Buffer.from("a comment", "ascii");
  const length = body.length + 2;
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xfe;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, body]);
}

function jpegSos(): Buffer {
  // Start of scan: FF DA, length 2 (no header payload), then entropy bytes.
  const entropy = Buffer.from([0x12, 0x34, 0x56, 0xff, 0x00, 0x78]);
  const header = Buffer.from([0xff, 0xda, 0x00, 0x02]);
  return Buffer.concat([header, entropy]);
}

function jpeg(...segments: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments,
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe("detectImageFormat", () => {
  it("sniffs jpeg, png, webp and unknown", () => {
    expect(detectImageFormat(jpeg(jpegApp0()))).toBe("jpeg");
    expect(
      detectImageFormat(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("png");
    expect(
      detectImageFormat(
        Buffer.concat([
          Buffer.from("RIFF", "ascii"),
          Buffer.alloc(4),
          Buffer.from("WEBP", "ascii"),
        ]),
      ),
    ).toBe("webp");
    expect(detectImageFormat(Buffer.from("just text"))).toBe("unknown");
  });
});

describe("stripImageMetadata — JPEG", () => {
  it("removes an EXIF APP1 segment", () => {
    const gps = Buffer.from("GPS coordinates go here", "ascii");
    const input = jpeg(jpegApp0(), jpegApp1Exif(gps));
    expect(input.includes(gps)).toBe(true);

    const result = stripImageMetadata(input);
    expect(result.format).toBe("jpeg");
    expect(result.stripped).toBe(true);
    expect(result.data.includes(gps)).toBe(false);
    // SOI is still first; the kept APP0 survives.
    expect(result.data[0]).toBe(0xff);
    expect(result.data[1]).toBe(0xd8);
    expect(result.data.includes(Buffer.from("JFIF\0", "binary"))).toBe(true);
  });

  it("removes COM comment segments", () => {
    const input = jpeg(jpegCom());
    const result = stripImageMetadata(input);
    expect(result.stripped).toBe(true);
    expect(result.data.includes(Buffer.from("a comment", "ascii"))).toBe(false);
  });

  it("keeps non-metadata APP1 (e.g. a non-EXIF tag) untouched", () => {
    // An APP1 whose payload is NOT "Exif\0\0" or XMP — e.g. an ICC-ish tag.
    const body = Buffer.from("SomeOtherApp1Tag", "ascii");
    const length = body.length + 2;
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = 0xe1;
    header.writeUInt16BE(length, 2);
    const input = jpeg(Buffer.concat([header, body]));

    const result = stripImageMetadata(input);
    expect(result.stripped).toBe(false);
    expect(result.data.equals(input)).toBe(true);
  });

  it("copies pixel data after SOS verbatim", () => {
    const input = jpeg(jpegApp1Exif(Buffer.from("secret", "ascii")), jpegSos());
    const result = stripImageMetadata(input);
    // The 0xFF bytes inside the entropy stream must survive untouched.
    const entropy = Buffer.from([0x12, 0x34, 0x56, 0xff, 0x00, 0x78]);
    expect(result.data.includes(entropy)).toBe(true);
  });

  it("never corrupts the image when strips do nothing", () => {
    const input = jpeg(jpegApp0(), jpegSos());
    const result = stripImageMetadata(input);
    expect(result.stripped).toBe(false);
    expect(result.data.equals(input)).toBe(true);
  });
});

// --- PNG --------------------------------------------------------------------

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); // CRC is not validated by the stripper.
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, crc]);
}

function png(...chunks: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]);
}

describe("stripImageMetadata — PNG", () => {
  it("drops tEXt and eXIf chunks but keeps IHDR/IDAT", () => {
    const text = pngChunk("tEXt", Buffer.from("Comment\0lat=13.0", "ascii"));
    const ihdr = pngChunk("IHDR", Buffer.alloc(13, 1));
    const idat = pngChunk("IDAT", Buffer.from([1, 2, 3, 4]));
    const input = png(ihdr, text, idat, pngChunk("IEND", Buffer.alloc(0)));

    const result = stripImageMetadata(input);
    expect(result.format).toBe("png");
    expect(result.stripped).toBe(true);
    expect(result.data.includes(text)).toBe(false);
    expect(result.data.includes(ihdr)).toBe(true);
    expect(result.data.includes(idat)).toBe(true);
  });

  it("leaves a metadata-free PNG unchanged", () => {
    const input = png(
      pngChunk("IHDR", Buffer.alloc(13, 1)),
      pngChunk("IEND", Buffer.alloc(0)),
    );
    const result = stripImageMetadata(input);
    expect(result.stripped).toBe(false);
    expect(result.data.equals(input)).toBe(true);
  });
});

// --- WebP -------------------------------------------------------------------

function webpChunk(fourcc: string, data: Buffer): Buffer {
  const padded = data.length + (data.length % 2);
  const body = Buffer.alloc(padded);
  data.copy(body);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length, 0);
  return Buffer.concat([Buffer.from(fourcc, "ascii"), size, body]);
}

function webp(...chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length, 0);
  // RIFF (0-3) + size (4-7) + WEBP (8-11) then chunks — the standard layout.
  return Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    size,
    Buffer.from("WEBP", "ascii"),
    body,
  ]);
}

describe("stripImageMetadata — WebP", () => {
  it("drops EXIF chunks and clears the VP8X metadata flags", () => {
    // VP8X with all three metadata bits set (EXIF 0x08, XMP 0x04).
    const vp8xData = Buffer.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const vp8x = webpChunk("VP8X", vp8xData);
    const exif = webpChunk("EXIF", Buffer.from("gps data!", "ascii"));
    const vp8 = webpChunk("VP8 ", Buffer.from([9, 8, 7]));

    const input = webp(vp8x, exif, vp8);
    const result = stripImageMetadata(input);

    expect(result.format).toBe("webp");
    expect(result.stripped).toBe(true);
    expect(result.data.includes(exif)).toBe(false);
    // The EXIF and XMP presence bits in VP8X are now clear.
    const vp8xOffset = result.data.indexOf(Buffer.from("VP8X", "ascii"));
    expect(vp8xOffset).toBeGreaterThan(0);
    // FourCC (4) + size (4) then the flags byte.
    expect(result.data[vp8xOffset + 8] & 0x0c).toBe(0);
  });
});

describe("stripMetadataBytes", () => {
  it("returns just the cleaned bytes", () => {
    const input = jpeg(jpegCom());
    expect(stripMetadataBytes(input).length).toBeLessThan(input.length);
  });

  it("returns unknown bytes unchanged", () => {
    const input = Buffer.from("not an image at all");
    expect(stripMetadataBytes(input).equals(input)).toBe(true);
  });
});
