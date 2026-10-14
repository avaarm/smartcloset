/**
 * Opt-in recorder for real tag fixtures (quality-ratings.md 7.13, step 3). Skipped unless RECORD_TAGS=1, so a normal
 * `npx jest` never calls Vision.
 *
 *   RECORD_TAGS=1 TAG_PHOTOS_DIR=<folder outside the repo> TAG_SET=dev npx jest __tests__/scripts/recordTagFixture.test.ts
 *
 * Name each photo `<kind>__<anything>.jpg` (kind: us-english, canada-bilingual, eu-multilingual, japanese, turkish-percent-first,
 * down-jacket, bag, shoe-insole, printed-tee, satin, curved, set, hang-tag, neck-label), or set TAG_KIND for the whole folder.
 * `GOOGLE_VISION_API_KEY` is read from the untracked `.env`. One photo is one fixture; photos are sent one at a time.
 *
 * What it writes, to __tests__/fixtures/tags/<set>/<kind>-<hash of the photo>.json, and nothing else:
 *   { about, ocrText, medianWordHeight, meanConfidence, expected }
 * `ocrText` is the sanitised transcription (no phone numbers, emails, sites or long digit runs). The raw OCR text is held in
 * memory only and never written, logged or stored; no image is written. `expected` is null: fill it in by hand FROM THE
 * PHYSICAL TAG, before the parser's reading of that fixture has been looked at (the shape is documented in
 * tagParserCorpus.test.ts). An existing fixture is never overwritten, so a hand-filled `expected` cannot be lost.
 * The photos stay outside the repository.
 *
 * With RECORD_TAGS=1 the first suite below runs the recorder against a stubbed Vision call and a temporary folder, to
 * prove the file it writes holds the sanitised text only; run it alone with `-t stubbed`.
 */
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { TAG_OCR_FEATURE } from '../../src/config/ratingFlags';
import { sanitizeTranscription } from '../../src/utils/tagTranscription';
import { foldText } from '../../src/utils/textFold';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE_ROOT = path.join(ROOT, '__tests__/fixtures/tags');
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const MAX_PHOTO_BYTES = 9_500_000; // Vision takes 10 MB inline
const SETS = ['dev', 'gate'] as const;
type TagSet = (typeof SETS)[number];

// ─── The recorder ───────────────────────────────────────────────────────────

type Vertex = { x?: number; y?: number };
type VisionResponse = {
  responses?: Array<{
    error?: { code?: number };
    fullTextAnnotation?: { text?: string; pages?: Array<{ blocks?: Array<{ paragraphs?: Array<{ words?: Array<{ confidence?: number }> }> }> }> };
    textAnnotations?: Array<{ description?: string; boundingPoly?: { vertices?: Vertex[] } }>;
  }>;
};
type Ocr = { text: string; wordHeights: number[]; meanConfidence: number | null };
type Call = (imageBase64: string) => Promise<VisionResponse>;

/** The text, word heights and mean word confidence of a Vision response (quality-ratings.md 7.4, step 4). */
const extractOcr = (response: VisionResponse): Ocr => {
  const r = response?.responses?.[0];
  if (!r || r.error) throw new Error('Vision answered with an error for this photo');
  const text = r.fullTextAnnotation?.text ?? r.textAnnotations?.[0]?.description ?? '';
  const wordHeights = (r.textAnnotations ?? []).slice(1).map(a => {
    const ys = (a.boundingPoly?.vertices ?? []).map(v => v.y ?? 0);
    return ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
  });
  const confidences: number[] = [];
  for (const page of r.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) if (typeof word.confidence === 'number') confidences.push(word.confidence);
      }
    }
  }
  const meanConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  return { text, wordHeights, meanConfidence };
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** A file-name-safe version of a kind such as "Neck Label!" -> "neck-label". */
const kindSlug = (kind: string): string => foldText(kind).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unspecified';

const kindOf = (file: string, fallback: string | undefined): string => {
  const base = path.basename(file, path.extname(file));
  const at = base.indexOf('__');
  return at > 0 ? base.slice(0, at) : fallback || 'unspecified';
};

type Fixture = {
  about: string;
  ocrText: string;
  medianWordHeight: number | null;
  meanConfidence: number | null;
  expected: null;
};

/** The only thing that is ever written for a photo. The raw text goes in and only its sanitised form comes out. */
const buildFixture = (set: TagSet, kind: string, ocr: Ocr): Fixture => ({
  about: `set: ${set}; kind: ${kindSlug(kind)}; real`,
  ocrText: sanitizeTranscription(ocr.text),
  medianWordHeight: median(ocr.wordHeights),
  meanConfidence: ocr.meanConfidence === null ? null : Math.round(ocr.meanConfidence * 1000) / 1000,
  expected: null,
});

type RecordOptions = { photosDir: string; outRoot: string; set: TagSet; kind?: string; call: Call };
type RecordResult = { written: string[]; skipped: Array<{ file: string; why: string }> };

const recordFolder = async ({ photosDir, outRoot, set, kind, call }: RecordOptions): Promise<RecordResult> => {
  const result: RecordResult = { written: [], skipped: [] };
  const files = fs
    .readdirSync(photosDir)
    .filter(name => PHOTO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(photosDir, name));
    if (bytes.length > MAX_PHOTO_BYTES) {
      result.skipped.push({ file: name, why: 'larger than 9.5 MB' });
      continue;
    }
    const photoKind = kindOf(name, kind);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const out = path.join(outRoot, set, `${kindSlug(photoKind)}-${hash}.json`);
    if (fs.existsSync(out)) {
      result.skipped.push({ file: name, why: 'already recorded; not overwritten' });
      continue;
    }
    const ocr = extractOcr(await call(bytes.toString('base64'))); // one photo at a time
    if (ocr.text.trim() === '') {
      result.skipped.push({ file: name, why: 'Vision found no text' });
      continue;
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(buildFixture(set, photoKind, ocr), null, 2)}\n`, 'utf8');
    result.written.push(out);
  }
  return result;
};

/** GOOGLE_VISION_API_KEY from a .env file: KEY=value, optional `export`, optional quotes. Null when absent or empty. */
const readEnvKey = (envPath: string): string | null => {
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?GOOGLE_VISION_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const value = m[1].replace(/^(['"])(.*)\1$/, '$2').trim();
    return value === '' ? null : value;
  }
  return null;
};

/** The real call: images:annotate with the tag feature, the key in a header (never in a URL or a log). */
const visionCall =
  (apiKey: string): Call =>
  imageBase64 =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify({ requests: [{ image: { content: imageBase64 }, features: [{ type: TAG_OCR_FEATURE }] }] });
      const req = https.request(
        VISION_URL,
        { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-goog-api-key': apiKey } },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
              reject(new Error(`Vision answered HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new Error('Vision answered with something that is not JSON'));
            }
          });
        },
      );
      req.setTimeout(30000, () => req.destroy(new Error('Vision did not answer within 30 seconds')));
      req.on('error', reject);
      req.write(body);
      req.end();
    });

// ─── Tests, only with RECORD_TAGS=1 ─────────────────────────────────────────

const RECORDING = process.env.RECORD_TAGS === '1';
const suite = RECORDING ? describe : describe.skip;

suite('recordTagFixture with a stubbed Vision call', () => {
  const RAW = [
    '100% COTTON',
    'MADE IN ITALY',
    'CALL +1 (555) 123-4567',
    'jane.doe@example.com',
    'www.example.com',
    'BARCODE 1234567890',
    'RN 12345',
  ].join('\n');
  const PHOTO_MARKER = 'PHOTO-BYTES-MARKER';
  const response = (text: string): VisionResponse => ({
    responses: [
      {
        fullTextAnnotation: { text, pages: [{ blocks: [{ paragraphs: [{ words: [{ confidence: 0.9 }, { confidence: 0.8 }, { confidence: 0.7 }] }] }] }] },
        textAnnotations: [
          { description: text },
          { description: '100%', boundingPoly: { vertices: [{ x: 0, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 30 }, { x: 0, y: 30 }] } },
          { description: 'COTTON', boundingPoly: { vertices: [{ x: 0, y: 40 }, { x: 5, y: 40 }, { x: 5, y: 80 }, { x: 0, y: 80 }] } },
          { description: 'MADE', boundingPoly: { vertices: [{ x: 0 }, { x: 5 }] } },
        ],
      },
    ],
  });

  let tmp = '';
  let photos = '';
  let out = '';
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tagrec-'));
    photos = path.join(tmp, 'photos');
    out = path.join(tmp, 'fixtures');
    fs.mkdirSync(photos);
    fs.writeFileSync(path.join(photos, 'neck-label__IMG_0001.jpg'), `${PHOTO_MARKER} one`);
    fs.writeFileSync(path.join(photos, 'Care Tag!__IMG_0002.PNG'), `${PHOTO_MARKER} two`);
    fs.writeFileSync(path.join(photos, 'notes.txt'), 'not a photo');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('stubbed: writes the sanitised text only, no raw text and no image, with expected null and the set in about', async () => {
    const calls: string[] = [];
    const result = await recordFolder({ photosDir: photos, outRoot: out, set: 'dev', call: async b64 => { calls.push(b64); return response(RAW); } });
    expect(result.written).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(result.written.map(f => path.relative(out, f).replace(/-[0-9a-f]{10}\.json$/, ''))).toEqual(['dev/care-tag', 'dev/neck-label']);

    for (const file of result.written) {
      const text = fs.readFileSync(file, 'utf8');
      const fixture = JSON.parse(text);
      expect(Object.keys(fixture)).toEqual(['about', 'ocrText', 'medianWordHeight', 'meanConfidence', 'expected']);
      expect(fixture.expected).toBeNull();
      expect(fixture.about).toMatch(/^set: dev; kind: .+; real$/);
      expect(fixture.ocrText).toBe(sanitizeTranscription(RAW));
      expect(fixture.ocrText).toBe('100% COTTON\nMADE IN ITALY\nRN 12345');
      expect(fixture.medianWordHeight).toBe(20); // heights 20, 40 and 0
      expect(fixture.meanConfidence).toBe(0.8);
      // nothing sensitive and no image anywhere in the file
      for (const secret of ['555', 'jane.doe', 'example.com', '1234567890', PHOTO_MARKER, Buffer.from(`${PHOTO_MARKER} one`).toString('base64')]) {
        expect(text).not.toContain(secret);
      }
    }
    expect(fs.readFileSync(result.written[1], 'utf8')).toContain('kind: neck-label');
    expect(fs.readFileSync(result.written[0], 'utf8')).toContain('kind: care-tag');
    expect(fs.readdirSync(path.join(out, 'dev')).every(n => n.endsWith('.json'))).toBe(true);
    // the photo and the notes file are untouched, and nothing else was created
    expect(fs.readdirSync(photos).sort()).toEqual(['Care Tag!__IMG_0002.PNG', 'neck-label__IMG_0001.jpg', 'notes.txt']);
    expect(fs.readdirSync(out)).toEqual(['dev']);
  });

  it('stubbed: sends one photo at a time, as base64, and nothing else', async () => {
    const seen: string[] = [];
    let running = 0;
    let most = 0;
    await recordFolder({
      photosDir: photos, outRoot: out, set: 'dev',
      call: async b64 => {
        running += 1;
        most = Math.max(most, running);
        seen.push(Buffer.from(b64, 'base64').toString());
        await new Promise(r => setTimeout(r, 5));
        running -= 1;
        return response(RAW);
      },
    });
    expect(most).toBe(1);
    expect(seen).toEqual([`${PHOTO_MARKER} two`, `${PHOTO_MARKER} one`]);
  });

  it('stubbed: records the sealed set under gate/ when asked, and says so in about', async () => {
    const result = await recordFolder({ photosDir: photos, outRoot: out, set: 'gate', kind: 'ignored', call: async () => response(RAW) });
    expect(result.written.every(f => path.relative(out, f).startsWith('gate'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(result.written[0], 'utf8')).about).toMatch(/^set: gate; /);
  });

  it('stubbed: uses TAG_KIND for a photo with no kind in its name, and never overwrites a fixture that exists', async () => {
    fs.writeFileSync(path.join(photos, 'IMG_0003.jpg'), `${PHOTO_MARKER} three`);
    const first = await recordFolder({ photosDir: photos, outRoot: out, set: 'dev', kind: 'Hang Tag', call: async () => response(RAW) });
    const hangTag = first.written.find(f => f.includes('hang-tag-')) as string;
    expect(JSON.parse(fs.readFileSync(hangTag, 'utf8')).about).toBe('set: dev; kind: hang-tag; real');
    // the owner fills `expected` in by hand; recording again must not touch it
    const filled = { ...JSON.parse(fs.readFileSync(hangTag, 'utf8')), expected: { groups: [], care: [], origin: null, size: null } };
    fs.writeFileSync(hangTag, JSON.stringify(filled));
    const call = jest.fn(async () => response(RAW));
    const second = await recordFolder({ photosDir: photos, outRoot: out, set: 'dev', kind: 'Hang Tag', call });
    expect(second.written).toEqual([]);
    expect(second.skipped.map(s => s.why)).toEqual(['already recorded; not overwritten', 'already recorded; not overwritten', 'already recorded; not overwritten']);
    expect(call).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(hangTag, 'utf8')).expected).toEqual(filled.expected);
  });

  it('stubbed: writes nothing for a photo with no text, and fails on a Vision error without writing', async () => {
    const empty = await recordFolder({ photosDir: photos, outRoot: out, set: 'dev', call: async () => response('   ') });
    expect(empty.written).toEqual([]);
    expect(empty.skipped.map(s => s.why)).toEqual(['Vision found no text', 'Vision found no text']);
    await expect(
      recordFolder({ photosDir: photos, outRoot: out, set: 'dev', call: async () => ({ responses: [{ error: { code: 3 } }] }) }),
    ).rejects.toThrow('Vision answered with an error for this photo');
    expect(fs.existsSync(path.join(out, 'dev'))).toBe(false);
  });

  it('stubbed: skips a photo that is too large to send', async () => {
    fs.writeFileSync(path.join(photos, 'big__IMG.jpg'), Buffer.alloc(9_600_000));
    const call = jest.fn(async () => response(RAW));
    const result = await recordFolder({ photosDir: photos, outRoot: out, set: 'dev', call });
    expect(result.skipped).toContainEqual({ file: 'big__IMG.jpg', why: 'larger than 9.5 MB' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('stubbed: reads the text from textAnnotations when there is no fullTextAnnotation, with no confidence', () => {
    const ocr = extractOcr({ responses: [{ textAnnotations: [{ description: 'ONLY THIS' }, { description: 'x', boundingPoly: { vertices: [{ y: 4 }, { y: 9 }] } }] }] });
    expect(ocr).toEqual({ text: 'ONLY THIS', wordHeights: [5], meanConfidence: null });
    expect(buildFixture('dev', 'k', ocr).meanConfidence).toBeNull();
    expect(extractOcr({ responses: [{}] })).toEqual({ text: '', wordHeights: [], meanConfidence: null });
  });

  it('stubbed: reads the key from a .env file, with or without quotes and export, and never from anything else', () => {
    const env = path.join(tmp, '.env');
    expect(readEnvKey(env)).toBeNull();
    fs.writeFileSync(env, '# comment\nOTHER=1\nGOOGLE_VISION_API_KEY=abc123\n');
    expect(readEnvKey(env)).toBe('abc123');
    fs.writeFileSync(env, 'export GOOGLE_VISION_API_KEY="quoted-key"\n');
    expect(readEnvKey(env)).toBe('quoted-key');
    fs.writeFileSync(env, "GOOGLE_VISION_API_KEY='single'\r\nX=y\r\n");
    expect(readEnvKey(env)).toBe('single');
    fs.writeFileSync(env, 'GOOGLE_VISION_API_KEY=\nGOOGLE_CLOUD_PROJECT_ID=zzz\n');
    expect(readEnvKey(env)).toBeNull();
    fs.writeFileSync(env, 'NOT_GOOGLE_VISION_API_KEY=nope\n');
    expect(readEnvKey(env)).toBeNull();
  });

  it('stubbed: slugs kinds without anything unsafe in a file name', () => {
    expect(kindSlug('Neck Label!')).toBe('neck-label');
    expect(kindSlug('  ')).toBe('unspecified');
    expect(kindSlug('../../etc')).toBe('etc');
    expect(kindSlug('Türkçe')).toBe('turkce');
  });
});

suite('recordTagFixture with the real Vision API', () => {
  it('records the photos in TAG_PHOTOS_DIR into __tests__/fixtures/tags/<TAG_SET>/', async () => {
    const dir = process.env.TAG_PHOTOS_DIR;
    const set = (process.env.TAG_SET ?? 'dev') as TagSet;
    if (!dir) throw new Error('Set TAG_PHOTOS_DIR to the folder with the tag photos (outside the repository).');
    if (!(SETS as readonly string[]).includes(set)) throw new Error('TAG_SET must be "dev" or "gate".');
    const photosDir = path.resolve(dir);
    if (photosDir === ROOT || photosDir.startsWith(`${ROOT}${path.sep}`)) throw new Error('Keep the tag photos outside the repository.');
    const key = readEnvKey(path.join(ROOT, '.env'));
    if (!key) throw new Error('GOOGLE_VISION_API_KEY is not set in the untracked .env.');
    const result = await recordFolder({ photosDir, outRoot: FIXTURE_ROOT, set, kind: process.env.TAG_KIND, call: visionCall(key) });
    console.info(
      `recorded ${result.written.length} fixtures into ${path.join('__tests__/fixtures/tags', set)}: ${result.written.map(f => path.basename(f)).join(', ') || 'none'}` +
        (result.skipped.length > 0 ? `; skipped ${result.skipped.map(s => `${s.file} (${s.why})`).join(', ')}` : ''),
    );
    expect(result.written.length + result.skipped.length).toBeGreaterThan(0);
  }, 10 * 60 * 1000);
});
