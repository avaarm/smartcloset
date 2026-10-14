/**
 * Removes everything from a PNG that is not needed to show the picture, without decoding or
 * re-compressing it: text (tEXt, zTXt, iTXt), the Exif block (eXIf), the modification time (tIME), the
 * physical size (pHYs), the background hint (bKGD), histograms and palettes of suggestions (hIST, sPLT),
 * animation chunks (acTL, fcTL, fdAT, which leaves the still image), every private or unknown optional
 * chunk, and anything after the end of the image. The chunks that decide how the picture looks are kept
 * byte for byte: header, palette, pixel data, transparency (tRNS), and colour handling (gAMA, cHRM,
 * sRGB, iCCP, sBIT, cICP).
 *
 * The app keeps a PNG a PNG (react-native-image-picker returns screenshots and other PNG sources
 * unchanged, and imageStorage.ts uploads the bytes as they are), so the swap function has to clean them
 * too. Plain TypeScript with no platform APIs, so the edge function (Deno) and the Jest tests (Node) run
 * the same code.
 */

export type PngCleanResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: 'not_png' | 'truncated' | 'malformed' };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP']);

/** True when the bytes start with the 8-byte PNG signature. */
export const isPng = (b: Uint8Array): boolean => b.length >= 8 && SIGNATURE.every((v, i) => b[i] === v);

let table: Uint32Array | null = null;
const crc32 = (b: Uint8Array, from: number, to: number): number => {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

export const stripPngMetadata = (input: Uint8Array): PngCleanResult => {
  if (!isPng(input)) return { ok: false, reason: 'not_png' };

  const kept: Array<[number, number]> = [[0, 8]];     // byte ranges of the input to keep, in order (the signature first)
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let first = true;
  let i = 8;

  while (i < input.length) {
    if (i + 12 > input.length) return { ok: false, reason: 'truncated' };
    const len = u32(input, i);
    const end = i + 12 + len;
    if (len > 0x7fffffff || end > input.length) return { ok: false, reason: 'truncated' };
    const type = String.fromCharCode(input[i + 4], input[i + 5], input[i + 6], input[i + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) return { ok: false, reason: 'malformed' };

    if (first) {
      if (type !== 'IHDR' || len !== 13) return { ok: false, reason: 'malformed' };
      width = u32(input, i + 8);
      height = u32(input, i + 12);
      if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) return { ok: false, reason: 'malformed' };
      first = false;
    }

    const critical = (input[i + 4] & 0x20) === 0;     // an upper-case first letter marks a chunk the picture cannot do without
    if (KEEP.has(type)) {
      if (crc32(input, i + 4, i + 8 + len) !== u32(input, i + 8 + len)) return { ok: false, reason: 'malformed' };
      if (type === 'IDAT') sawIdat = true;
      kept.push([i, end]);
    } else if (critical) {
      return { ok: false, reason: 'malformed' };      // a critical chunk we do not know: do not guess
    }
    i = end;

    if (type === 'IEND') {                             // everything after it is dropped
      if (!sawIdat) return { ok: false, reason: 'malformed' };
      let size = 0;
      for (const [a, b] of kept) size += b - a;
      const out = new Uint8Array(size);
      let o = 0;
      for (const [a, b] of kept) { out.set(input.subarray(a, b), o); o += b - a; }
      return { ok: true, bytes: out, width, height };
    }
  }
  return { ok: false, reason: 'truncated' };
};
