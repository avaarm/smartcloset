import { isPng, stripPngMetadata } from '../../supabase/functions/_shared/pngMetadata';

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: number[]) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: number[] = [], badCrc = false) => {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(body) ^ (badCrc ? 1 : 0))];
};

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = (w = 64, h = 48) => chunk('IHDR', [...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x18, 0x05, 0xa3, 0x60, 0x14, 0x0c, 0x00, 0x00, 0x00, 0x00]);
const IDAT2 = chunk('IDAT', [1, 2, 3, 4, 5, 6]);
const IEND = chunk('IEND');
const png = (parts: number[][], trailing: number[] = []) => Uint8Array.from([...SIGNATURE, ...parts.flat(), ...trailing]);
const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).toString('latin1').includes(text);

// Chunks that carry personal or hidden data.
const TEXT = chunk('tEXt', [...ascii('Comment'), 0, ...ascii('shot at the cafe on Elm Street')]);
const ZTXT = chunk('zTXt', [...ascii('Software'), 0, 0, 1, 2, 3]);
const ITXT = chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('GPSLatitude 37.77')]);
const EXIF = chunk('eXIf', [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ascii('GPSLATITUDE-37.77')]);
const TIME = chunk('tIME', [0x07, 0xea, 10, 13, 17, 30, 5]);
const PHYS = chunk('pHYs', [...u32(2835), ...u32(2835), 1]);
const BKGD = chunk('bKGD', [0, 0, 0, 0, 0, 0]);
const PRIVATE = chunk('prVt', ascii('HIDDEN-PAYLOAD'));
const ACTL = chunk('acTL', [...u32(2), ...u32(0)]);
const FCTL = chunk('fcTL', new Array(26).fill(0));
const FDAT = chunk('fdAT', [...u32(1), 9, 9, 9]);
// Chunks that decide how the picture looks.
const SRGB = chunk('sRGB', [0]);
const GAMA = chunk('gAMA', u32(45455));
const ICCP = chunk('iCCP', [...ascii('sRGB profile'), 0, 0, 5, 5, 5]);
const PLTE = chunk('PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255]);
const TRNS = chunk('tRNS', [0, 128, 255]);

describe('stripPngMetadata', () => {
  it('removes text, Exif, XMP, time, size, private chunks, animation chunks and trailing bytes', () => {
    const input = png([IHDR(), TEXT, EXIF, TIME, PHYS, ZTXT, ITXT, BKGD, PRIVATE, ACTL, IDAT, FCTL, FDAT, IEND], ascii('TRAILING-SECRET'));
    const r = stripPngMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    for (const secret of ['Elm Street', 'GPSLATITUDE', 'GPSLatitude', 'Comment', 'XML:com.adobe', 'HIDDEN-PAYLOAD', 'TRAILING-SECRET', 'tIME', 'pHYs', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'acTL', 'fcTL', 'fdAT', 'bKGD', 'prVt']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(isPng(r.bytes)).toBe(true);
    expect(r.width).toBe(64);
    expect(r.height).toBe(48);
  });

  it('leaves exactly the signature, the header, the pixel data and the end', () => {
    const r = stripPngMetadata(png([IHDR(), TEXT, IDAT, TIME, IEND]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png([IHDR(), IDAT, IEND])));
  });

  it('keeps the picture data byte for byte, across several IDAT chunks', () => {
    const body = [IHDR(), IDAT, IDAT2, IEND];
    const r = stripPngMetadata(png(body));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png(body)));
  });

  it('keeps palette, transparency and colour handling, in order', () => {
    const body = [IHDR(), GAMA, SRGB, ICCP, PLTE, TRNS, IDAT, IEND];
    const r = stripPngMetadata(png([IHDR(), GAMA, TEXT, SRGB, ICCP, PLTE, TRNS, PHYS, IDAT, IEND]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png(body)));
  });

  it('is idempotent', () => {
    const once = stripPngMetadata(png([IHDR(), TEXT, IDAT, IEND], [1, 2, 3]));
    if (!once.ok) throw new Error(once.reason);
    const twice = stripPngMetadata(once.bytes);
    if (!twice.ok) throw new Error(twice.reason);
    expect(Array.from(twice.bytes)).toEqual(Array.from(once.bytes));
  });

  it('refuses what is not a usable PNG', () => {
    const reason = (b: Uint8Array) => { const r = stripPngMetadata(b); return r.ok ? 'ok' : r.reason; };
    expect(reason(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('not_png');                       // a JPEG
    expect(reason(Uint8Array.from(ascii('GIF89a......')))).toBe('not_png');
    expect(reason(Uint8Array.from(SIGNATURE))).toBe('truncated');                                     // signature only
    expect(reason(png([IHDR(), IDAT]))).toBe('truncated');                                            // no IEND
    expect(reason(png([IHDR(), IDAT, IEND]).slice(0, -5))).toBe('truncated');                         // cut inside IEND
    expect(reason(png([IDAT, IEND]))).toBe('malformed');                                              // no header first
    expect(reason(png([IHDR(), IEND]))).toBe('malformed');                                            // no pixel data
    expect(reason(png([IHDR(0, 10), IDAT, IEND]))).toBe('malformed');                                 // zero width
    expect(reason(png([IHDR(), chunk('IDAT', [1, 2, 3], true), IEND]))).toBe('malformed');            // corrupt pixel data
    expect(reason(png([IHDR(), chunk('XYZW', [1]), IDAT, IEND]))).toBe('malformed');                  // unknown critical chunk
    expect(reason(png([IHDR(), chunk('ab1c', [1]), IDAT, IEND]))).toBe('malformed');                  // not letters
  });

  it('does not trust a length that points past the end', () => {
    const bad = Uint8Array.from([...SIGNATURE, ...u32(0x7fffffff), ...ascii('IHDR'), 0, 0, 0, 0]);
    const r = stripPngMetadata(bad);
    expect(r.ok).toBe(false);
  });

  it('recognises a PNG by its signature only', () => {
    expect(isPng(png([IHDR(), IDAT, IEND]))).toBe(true);
    expect(isPng(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(isPng(new Uint8Array(0))).toBe(false);
  });
});
