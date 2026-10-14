import { readExifOrientation, stripJpegMetadata } from '../../supabase/functions/_shared/jpegMetadata';

const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];

/** Big-endian Exif: Orientation (optional) and a GPS block with a recognisable marker string. */
const exif = (orientation: number | null, withGps: boolean) => {
  const entries: number[][] = [];
  if (orientation !== null) entries.push([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0]);
  if (withGps) entries.push([0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0x40]);
  const ifd = [...u16(entries.length), ...entries.flat(), 0, 0, 0, 0];
  const gps = withGps ? [...ascii('GPSLATITUDE-37.77-LONGITUDE-122.41')] : [];
  return seg(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ifd, ...gps]);
};

const SOF0 = seg(0xc0, [8, ...u16(48), ...u16(64), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(16)]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0), 0]);
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];          // a stuffed FF00 and a restart marker
const ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9, 9]);
const MPF = seg(0xe2, [...ascii('MPF'), 0, 1, 2, 3]);
const ADOBE = seg(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const APP0 = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const COMMENT = seg(0xfe, ascii('shot at the cafe on Elm Street'));
const IPTC = seg(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('Jane Doe')]);

const jpeg = (parts: number[][], trailing: number[] = []) =>
  Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9, ...trailing]);

const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).toString('latin1').includes(text);

describe('stripJpegMetadata', () => {
  const body = [APP0, DQT, SOF0, DHT, SOS, SCAN];

  it('removes location, camera, comments, IPTC, multi-picture data and trailing bytes', () => {
    const input = jpeg([APP0, exif(1, true), COMMENT, IPTC, MPF, DQT, SOF0, DHT, SOS, SCAN], ascii('HIDDEN-PAYLOAD'));
    const r = stripJpegMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    for (const secret of ['GPSLATITUDE', 'Exif', 'Elm Street', 'Jane Doe', 'Photoshop', 'MPF', 'HIDDEN-PAYLOAD']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(Array.from(r.bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(r.bytes.slice(-2))).toEqual([0xff, 0xd9]);
    expect(r.width).toBe(64);
    expect(r.height).toBe(48);
  });

  it('keeps the picture data byte for byte, including stuffed bytes and restart markers', () => {
    const r = stripJpegMetadata(jpeg(body));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(jpeg(body)));
  });

  it('keeps the colour profile and the Adobe colour flag', () => {
    const r = stripJpegMetadata(jpeg([APP0, ICC, ADOBE, DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(contains(r.bytes, 'ICC_PROFILE')).toBe(true);
    expect(contains(r.bytes, 'Adobe')).toBe(true);
  });

  it('writes back only the rotation flag when the photo was rotated', () => {
    const r = stripJpegMetadata(jpeg([APP0, exif(6, true), DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.orientation).toBe(6);
    expect(contains(r.bytes, 'GPSLATITUDE')).toBe(false);
    // The only Exif block left is the 36-byte, orientation-only one right after SOI.
    expect(Array.from(r.bytes.slice(2, 6))).toEqual([0xff, 0xe1, 0x00, 0x22]);
    expect(readExifOrientation(r.bytes, 6, 38)).toBe(6);
  });

  it('writes no Exif block at all for an upright photo', () => {
    const r = stripJpegMetadata(jpeg([APP0, exif(1, true), DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.orientation).toBe(1);
    expect(contains(r.bytes, 'Exif')).toBe(false);
  });

  it('handles progressive photos with more than one scan', () => {
    const second = [...SOS, 0x77, 0xff, 0x00, 0x88];
    const r = stripJpegMetadata(jpeg([APP0, DQT, SOF0, DHT, SOS, SCAN, DHT, second]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(jpeg([APP0, DQT, SOF0, DHT, SOS, SCAN, DHT, second])));
  });

  it('is idempotent', () => {
    const once = stripJpegMetadata(jpeg([APP0, exif(8, true), COMMENT, DQT, SOF0, DHT, SOS, SCAN]));
    if (!once.ok) throw new Error(once.reason);
    const twice = stripJpegMetadata(once.bytes);
    if (!twice.ok) throw new Error(twice.reason);
    expect(Array.from(twice.bytes)).toEqual(Array.from(once.bytes));
    expect(twice.orientation).toBe(8);
  });

  it('reads the orientation in little-endian Exif too', () => {
    const le = [...ascii('Exif'), 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0];
    expect(readExifOrientation(Uint8Array.from(le), 0, le.length)).toBe(3);
  });

  it('rejects what is not a complete JPEG', () => {
    expect(stripJpegMetadata(Uint8Array.from(ascii('\u0089PNG')))).toEqual({ ok: false, reason: 'not_jpeg' });
    expect(stripJpegMetadata(Uint8Array.from([]))).toEqual({ ok: false, reason: 'not_jpeg' });
    const whole = jpeg(body);
    expect(stripJpegMetadata(whole.slice(0, whole.length - 12)).ok).toBe(false);
    expect(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0x12, 0x34, 0x56])).ok).toBe(false);
    // A picture with no frame header or no scan is not a picture.
    expect(stripJpegMetadata(jpeg([APP0, DQT])).ok).toBe(false);
  });
});
