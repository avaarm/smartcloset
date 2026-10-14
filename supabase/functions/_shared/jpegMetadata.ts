/**
 * Removes everything from a JPEG that is not needed to show the picture, without decoding
 * or re-compressing it: location (GPS) and camera details in the Exif block, XMP, IPTC,
 * comments, embedded thumbnails and multi-picture data, plus anything after the end of
 * the image. The colour profile (ICC) and the Adobe colour flag are kept so colours look
 * the same. If the photo carried a rotation flag, a minimal Exif block holding only that
 * flag is written back so the photo still shows upright.
 *
 * Plain TypeScript with no platform APIs, so the edge function (Deno) and the Jest tests
 * (Node) run the same code.
 */

export type JpegCleanResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number; orientation: number }
  | { ok: false; reason: 'not_jpeg' | 'truncated' | 'malformed' };

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

const startsWith = (b: Uint8Array, at: number, text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (b[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/** Reads the Exif Orientation (1-8) from an APP1 payload that starts at "Exif\0\0"; 1 when absent. */
export const readExifOrientation = (b: Uint8Array, start: number, end: number): number => {
  if (end - start < 14 || !startsWith(b, start, 'Exif') || b[start + 4] !== 0 || b[start + 5] !== 0) return 1;
  const tiff = start + 6;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    little
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (tiff + 8 > end || u16(tiff + 2) !== 42) return 1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) return 1;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
};

const orientationBlock = (orientation: number): Uint8Array =>
  Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,                               // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                   // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,       // big-endian TIFF header, IFD at 8
    0x00, 0x01,                                           // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,       // Orientation, SHORT, count 1
    0x00, orientation, 0x00, 0x00,                        // value
    0x00, 0x00, 0x00, 0x00,                               // no next IFD
  ]);

export const stripJpegMetadata = (input: Uint8Array): JpegCleanResult => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return { ok: false, reason: 'not_jpeg' };

  const kept: Array<[number, number]> = [];   // byte ranges of the input to keep, in order
  let orientation = 1;
  let width = 0;
  let height = 0;
  let sawScan = false;
  let i = 2;

  while (i < input.length) {
    if (input[i] !== 0xff) return { ok: false, reason: 'malformed' };
    while (input[i] === 0xff && i + 1 < input.length) i++;          // fill bytes
    const marker = input[i];
    i++;
    if (marker === 0xd9) {                                           // EOI: everything after is dropped
      if (!sawScan || width === 0) return { ok: false, reason: 'malformed' };
      const head = Uint8Array.from([0xff, 0xd8]);
      const block = orientation > 1 ? orientationBlock(orientation) : new Uint8Array(0);
      let size = head.length + block.length + 2;
      for (const [a, b] of kept) size += b - a;
      const out = new Uint8Array(size);
      let o = 0;
      out.set(head, o); o += head.length;
      out.set(block, o); o += block.length;
      for (const [a, b] of kept) { out.set(input.subarray(a, b), o); o += b - a; }
      out[o++] = 0xff; out[o++] = 0xd9;
      return { ok: true, bytes: out, width, height, orientation };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x00) continue;   // no length
    if (i + 2 > input.length) return { ok: false, reason: 'truncated' };
    const len = (input[i] << 8) | input[i + 1];
    const segStart = i - 2;                                          // includes the FF xx marker
    const segEnd = i + len;
    if (len < 2 || segEnd > input.length) return { ok: false, reason: 'truncated' };
    const payload = i + 2;

    let keep = true;
    if (marker === 0xe1) {                                           // Exif / XMP
      if (startsWith(input, payload, 'Exif')) {
        const o = readExifOrientation(input, payload, segEnd);
        if (o > 1) orientation = o;
      }
      keep = false;
    } else if (marker === 0xe2) {                                    // ICC profile kept, multi-picture data dropped
      keep = startsWith(input, payload, 'ICC_PROFILE');
    } else if (marker === 0xee) {                                    // Adobe colour transform kept
      keep = startsWith(input, payload, 'Adobe');
    } else if (marker === 0xfe || (marker >= 0xe3 && marker <= 0xef)) {
      keep = false;                                                  // comments, APP3-APP15 (IPTC, Photoshop, vendor)
    } else if (SOF_MARKERS.has(marker)) {
      height = (input[payload + 1] << 8) | input[payload + 2];
      width = (input[payload + 3] << 8) | input[payload + 4];
    }
    if (keep) kept.push([segStart, segEnd]);
    i = segEnd;

    if (marker === 0xda) {                                           // SOS: copy the entropy-coded data
      sawScan = true;
      const dataStart = i;
      while (i < input.length) {
        if (input[i] === 0xff) {
          const next = input[i + 1];
          if (next === undefined) return { ok: false, reason: 'truncated' };
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { i += 2; continue; }
          if (next === 0xff) { i++; continue; }
          break;                                                     // a real marker follows
        }
        i++;
      }
      if (i >= input.length) return { ok: false, reason: 'truncated' };
      kept.push([dataStart, i]);
    }
  }
  return { ok: false, reason: 'truncated' };
};
