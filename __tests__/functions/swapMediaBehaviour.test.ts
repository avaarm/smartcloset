/**
 * Runs the swap-media handler itself (Deno code) in Jest, with the Deno globals, the Supabase client and
 * Google's endpoint replaced by fakes. swapMediaFunction.test.ts pins the source text; this one pins what
 * the function does with a request: what it refuses, what it stores, what it asks the database, and what
 * it never lets through. The real thing (Deno, Storage, the Vision API) is proved by hand at gate G3.
 */
import { stripJpegMetadata } from '../../supabase/functions/_shared/jpegMetadata';

const mockClients = { make: (_key: string): any => null };
jest.mock(
  'https://esm.sh/@supabase/supabase-js@2.45.4',
  () => ({ createClient: (_url: string, key: string) => mockClients.make(key) }),
  { virtual: true },
);

const URL_BASE = 'https://project.supabase.test';
const ANON = 'anon-key-for-tests';
const SERVICE = 'service-key-for-tests-0123456789';
const USER = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const LISTING = '33333333-3333-4333-8333-333333333333';
const SOURCE = `${USER}/closet-photo.jpg`;
const VISION_KEY = 'vision-key-for-tests';

// ── Image builders (same shapes as jpegMetadata.test.ts and pngMetadata.test.ts) ───────────────────────
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];
const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).toString('latin1').includes(text);

const gpsExif = seg(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, ...ascii('GPSLATITUDE-37.77')]);
const SOF0 = seg(0xc0, [8, ...u16(48), ...u16(64), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(16)]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0), 0]);
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const jpegWithGps = () => Uint8Array.from([0xff, 0xd8, ...gpsExif, ...DQT, ...SOF0, ...DHT, ...SOS, ...SCAN, 0xff, 0xd9, ...ascii('TRAILING-SECRET')]);

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
const chunk = (type: string, data: number[] = []) => {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(body))];
};
const pngWithText = () =>
  Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...u32(64), ...u32(48), 8, 6, 0, 0, 0]),
    ...chunk('tEXt', [...ascii('Comment'), 0, ...ascii('shot at the cafe on Elm Street')]),
    ...chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x18, 0x05, 0xa3, 0x60, 0x14, 0x0c, 0x00, 0x00, 0x00, 0x00]),
    ...chunk('IEND'),
  ]);

// ── The fake platform ───────────────────────────────────────────────────────────────────────────────────
type Upload = { bucket: string; path: string; bytes: Uint8Array; contentType?: string; upsert?: boolean };
type Removal = { bucket: string; paths: string[] };
type StoredObject = { name: string; created_at?: string };

const fake = {
  user: null as any,
  rpcCalls: [] as Array<[string, any]>,
  rpcResults: {} as Record<string, (args: any) => { data?: any; error?: any }>,
  files: {} as Record<string, Uint8Array>,
  uploads: [] as Upload[],
  removals: [] as Removal[],
  uploadError: null as any,
  queue: [] as string[],
  objects: [] as StoredObject[],
  clients: [] as Array<{ kind: 'user' | 'admin'; headers?: any }>,
};
const env: Record<string, string | undefined> = {};
const pending: Array<Promise<unknown>> = [];

const reset = () => {
  fake.user = { id: USER };
  fake.rpcCalls = [];
  fake.rpcResults = {
    swap_publish_precheck: () => ({ data: { listingId: LISTING, sourcePath: SOURCE } }),
    swap_publish_commit: () => ({ data: LISTING }),
    swap_janitor: () => ({ data: null }),
    swap_known_photo_paths: () => ({ data: [] }),
  };
  fake.files = { [`wardrobe-images/${SOURCE}`]: jpegWithGps() };
  fake.uploads = [];
  fake.removals = [];
  fake.uploadError = null;
  fake.queue = [];
  fake.objects = [];
  fake.clients = [];
  pending.length = 0;
  for (const k of Object.keys(env)) delete env[k];
  env.SUPABASE_URL = URL_BASE;
  env.SUPABASE_ANON_KEY = ANON;
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  env.GOOGLE_VISION_API_KEY = VISION_KEY;
};

const makeClient = (key: string) => {
  if (key === ANON) {
    fake.clients.push({ kind: 'user' });
    return { auth: { getUser: async () => (fake.user ? { data: { user: fake.user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }) } };
  }
  fake.clients.push({ kind: 'admin' });
  return {
    rpc: async (name: string, args: any) => {
      fake.rpcCalls.push([name, args]);
      const result = fake.rpcResults[name];
      if (!result) throw new Error(`unexpected rpc ${name}`);
      const r = result(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (table: string) => {
      if (table !== 'swap_photo_gc') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ order: () => ({ limit: async (n: number) => ({ data: fake.queue.slice(0, n).map(path => ({ path })), error: null }) }) }),
        delete: () => ({ in: async (_col: string, paths: string[]) => { fake.queue = fake.queue.filter(p => !paths.includes(p)); return { error: null }; } }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          const bytes = fake.files[`${bucket}/${path}`];
          if (!bytes) return { data: null, error: { message: 'not found' } };
          return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, error: null };
        },
        upload: async (path: string, bytes: Uint8Array, opts: any) => {
          fake.uploads.push({ bucket, path, bytes, contentType: opts?.contentType, upsert: opts?.upsert });
          return { error: fake.uploadError };
        },
        remove: async (paths: string[]) => {
          fake.removals.push({ bucket, paths });
          fake.objects = fake.objects.filter(o => !paths.includes(o.name));
          return { data: paths.map(name => ({ name })), error: null };
        },
        list: async (_prefix: string, opts: { limit: number; offset: number }) => ({
          data: fake.objects.slice(opts.offset, opts.offset + opts.limit), error: null,
        }),
      }),
    },
  };
};

// ── Loading the handler ─────────────────────────────────────────────────────────────────────────────────
let handler: (req: Request) => Promise<Response>;
const g = globalThis as any;
let fetchMock: jest.Mock;
let errorSpy: jest.SpyInstance;
const realFetch = g.fetch;

beforeAll(() => {
  mockClients.make = makeClient;
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
  };
  g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  require('../../supabase/functions/swap-media/index');
});

afterAll(() => {
  delete g.Deno;
  delete g.EdgeRuntime;
  g.fetch = realFetch;
});

beforeEach(() => {
  reset();
  fetchMock = jest.fn();
  g.fetch = fetchMock;
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

const send = async (body: unknown, token: string | null = 'user-session-token', method = 'POST') => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await handler(new Request(`${URL_BASE}/functions/v1/swap-media`, {
    method, headers, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }));
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed, text };
};

const publish = (extra: Record<string, unknown> = {}) => send({ action: 'publish', itemId: ITEM, audience: 'friends', ...extra });

const calm = { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'UNLIKELY', medical: 'VERY_UNLIKELY', spoof: 'UNLIKELY' };
const visionAnswer = (annotation: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ responses: [annotation] }), { status }));
const bigFace = { detectionConfidence: 0.97, boundingPoly: { vertices: [{ x: 2, y: 2 }, { x: 60, y: 2 }, { x: 60, y: 44 }, { x: 2, y: 44 }] } };

const forgedServiceToken = () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'service_role', iss: 'supabase' })}.`;
};

describe('swap-media: requests it refuses before doing anything', () => {
  it('answers the browser preflight and refuses other methods', async () => {
    const pre = await send(null, null, 'OPTIONS');
    expect(pre.status).toBe(200);
    expect((await send(null, 'x', 'GET')).status).toBe(405);
  });

  it('wants a bearer token', async () => {
    const r = await send({ action: 'publish' }, null);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'not_authenticated' });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['not JSON', 'not json'],
    ['JSON null', 'null'],
    ['no action', {}],
    ['an unknown action', { action: 'delete' }],
    ['an action that is not text', { action: 5 }],
  ])('refuses a body that is %s', async (_name, body) => {
    const r = await send(body);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid_request' });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['an extra field naming a photo path', { path: SOURCE }],
    ['an extra field named sourcePath', { sourcePath: SOURCE }],
    ['an extra field named url', { url: 'https://example.test/a.jpg' }],
    ['an item id that is not a uuid', { itemId: 'not-a-uuid' }],
    ['an item id that is not text', { itemId: 7 }],
    ['an audience nobody defined', { audience: 'public' }],
    ['a missing audience', { audience: undefined }],
    ['a note that is not text', { note: 5 }],
    ['a note over 200 characters', { note: 'x'.repeat(201) }],
  ])('refuses a publish with %s', async (_name, extra) => {
    const r = await publish(extra);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid_request' });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.uploads).toHaveLength(0);
  });

  it('accepts a missing note and a null note', async () => {
    expect((await publish()).status).toBe(200);
    expect((await publish({ note: null })).status).toBe(200);
  });

  it('refuses a session the platform cannot vouch for', async () => {
    fake.user = null;
    const r = await publish();
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'not_authenticated' });
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe('swap-media: publishing to friends', () => {
  it('asks the database first, copies the photo with its metadata removed, and creates the listing', async () => {
    const r = await publish({ note: 'Worn twice' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ listingId: LISTING });

    expect(fake.rpcCalls.map(c => c[0])).toEqual(['swap_publish_precheck', 'swap_publish_commit']);
    expect(fake.rpcCalls[0][1]).toEqual({ p_user: USER, p_item: ITEM, p_audience: 'friends', p_note: 'Worn twice' });
    expect(fake.rpcCalls[1][1]).toEqual({
      p_user: USER, p_listing: LISTING, p_item: ITEM, p_audience: 'friends', p_note: 'Worn twice', p_photo_state: 'stripped',
    });

    expect(fake.uploads).toHaveLength(1);
    const up = fake.uploads[0];
    expect(up.bucket).toBe('swap-photos');
    expect(up.path).toBe(`${LISTING}.jpg`);
    expect(up.contentType).toBe('image/jpeg');
    expect(up.upsert).toBe(false);
    for (const secret of ['GPSLATITUDE', 'Exif', 'TRAILING-SECRET']) expect(contains(up.bytes, secret)).toBe(false);
    const expected = stripJpegMetadata(jpegWithGps());
    if (!expected.ok) throw new Error(expected.reason);
    expect(Array.from(up.bytes)).toEqual(Array.from(expected.bytes));
    expect(fetchMock).not.toHaveBeenCalled();                    // friends-only photos never leave Supabase
  });

  it('sends null when there is no note', async () => {
    await publish();
    expect(fake.rpcCalls[0][1].p_note).toBeNull();
    expect(fake.rpcCalls[1][1].p_note).toBeNull();
  });

  it('takes the photo from the path the database named, in the member-owned bucket', async () => {
    fake.rpcResults.swap_publish_precheck = () => ({ data: { listingId: LISTING, sourcePath: `${USER}/other.jpg` } });
    fake.files = { [`wardrobe-images/${USER}/other.jpg`]: jpegWithGps() };
    expect((await publish()).status).toBe(200);
  });

  it('stores a PNG as a PNG: cleaned, named like any listing photo, with its own content type', async () => {
    fake.files = { [`wardrobe-images/${SOURCE}`]: pngWithText() };
    const r = await publish();
    expect(r.status).toBe(200);
    const up = fake.uploads[0];
    expect(up.path).toBe(`${LISTING}.jpg`);
    expect(up.contentType).toBe('image/png');
    expect(contains(up.bytes, 'Elm Street')).toBe(false);
    expect(contains(up.bytes, 'tEXt')).toBe(false);
    expect(Array.from(up.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('tells a PNG by its first bytes, not by what it was called', async () => {
    fake.rpcResults.swap_publish_precheck = () => ({ data: { listingId: LISTING, sourcePath: `${USER}/shot.png` } });
    fake.files = { [`wardrobe-images/${USER}/shot.png`]: jpegWithGps() };
    await publish();
    expect(fake.uploads[0].contentType).toBe('image/jpeg');
  });

  it.each([
    ['a GIF', Uint8Array.from(ascii('GIF89a......'))],
    ['an empty file', new Uint8Array(0)],
    ['a truncated JPEG', jpegWithGps().slice(0, 40)],
    ['a PNG with nothing after its signature', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['text', Uint8Array.from(ascii('<html>not a photo</html>'))],
  ])('refuses %s with "unsupported_image" and stores nothing', async (_name, bytes) => {
    fake.files = { [`wardrobe-images/${SOURCE}`]: bytes };
    const r = await publish();
    expect(r.status).toBe(415);
    expect(r.body).toEqual({ error: 'unsupported_image' });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.rpcCalls.map(c => c[0])).toEqual(['swap_publish_precheck']);
  });

  it('refuses a photo over 5 MB', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big[0] = 0xff; big[1] = 0xd8;
    fake.files = { [`wardrobe-images/${SOURCE}`]: big };
    const r = await publish();
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'photo_too_large' });
    expect(fake.uploads).toHaveLength(0);
  });

  it('reports a photo it cannot download as an incomplete listing', async () => {
    fake.files = {};
    const r = await publish();
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'listing_incomplete', detail: 'photo' });
    expect(fake.uploads).toHaveLength(0);
  });

  it('answers server_error and creates no listing when the copy cannot be stored', async () => {
    fake.uploadError = { message: 'disk' };
    const r = await publish();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'server_error' });
    expect(fake.rpcCalls.map(c => c[0])).toEqual(['swap_publish_precheck']);
  });

  it('deletes up to 25 queued photos after answering', async () => {
    fake.queue = Array.from({ length: 40 }, (_, i) => `old-${i}.jpg`);
    const r = await publish();
    expect(r.status).toBe(200);
    await Promise.all(pending);
    const drained = fake.removals.filter(x => x.bucket === 'swap-photos' && x.paths[0] === 'old-0.jpg');
    expect(drained).toHaveLength(1);
    expect(drained[0].paths).toHaveLength(25);
    expect(fake.queue).toHaveLength(15);
  });
});

describe('swap-media: what the database says', () => {
  it.each([
    ['not_authenticated', 401], ['swaps_disabled', 403], ['swap_terms_required', 403], ['swap_suspended', 403],
    ['community_unavailable', 403], ['community_not_joined', 403], ['account_too_new', 403],
    ['item_not_found', 422], ['listing_incomplete', 422], ['invalid_swap', 422], ['invalid_note', 422], ['text_not_allowed', 422],
    ['listing_held', 403], ['item_reserved', 409], ['swap_rate_limited', 429], ['swap_listing_limit', 429],
  ])('turns "%s" from the precheck into HTTP %i and touches no photo', async (code, status) => {
    fake.rpcResults.swap_publish_precheck = () => ({ error: { message: code, details: 'note', hint: 'phone number' } });
    const r = await publish();
    expect(r.status).toBe(status);
    expect(r.body).toEqual({ error: code, detail: 'note', reason: 'phone number' });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.removals).toHaveLength(0);
  });

  it('turns anything it does not know into a plain server_error, without repeating it', async () => {
    fake.rpcResults.swap_publish_precheck = () => ({ error: { message: 'relation "swap_listings" does not exist (private detail)' } });
    const r = await publish();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'server_error' });
    expect(r.text).not.toContain('swap_listings');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[swap-media] database error');
  });

  it('removes the stored copy when the listing cannot be created, and passes the refusal on', async () => {
    fake.rpcResults.swap_publish_commit = () => ({ error: { message: 'item_reserved' } });
    const r = await publish();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('item_reserved');
    expect(fake.uploads).toHaveLength(1);
    expect(fake.removals).toEqual([{ bucket: 'swap-photos', paths: [`${LISTING}.jpg`] }]);
  });

  it('asks again at commit and so refuses a piece that was held in the meantime', async () => {
    fake.rpcResults.swap_publish_commit = () => ({ error: { message: 'listing_held' } });
    const r = await publish();
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('listing_held');
    expect(fake.removals).toEqual([{ bucket: 'swap-photos', paths: [`${LISTING}.jpg`] }]);
  });
});

describe('swap-media: publishing to the community', () => {
  const community = (extra: Record<string, unknown> = {}) => publish({ audience: 'community', ...extra });

  it('sends the cleaned photo to Google once and marks the listing checked when it passes', async () => {
    visionAnswer({ safeSearchAnnotation: calm });
    const r = await community({ note: 'Clean' });
    expect(r.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeDefined();
    const sent = JSON.parse(init.body);
    expect(sent.requests[0].features).toEqual([{ type: 'SAFE_SEARCH_DETECTION' }, { type: 'FACE_DETECTION', maxResults: 10 }]);
    // What Google sees is the cleaned photo: no location, no trailing bytes.
    const seen = Buffer.from(sent.requests[0].image.content, 'base64');
    expect(Array.from(seen)).toEqual(Array.from(fake.uploads[0].bytes));
    expect(contains(seen, 'GPSLATITUDE')).toBe(false);

    expect(fake.rpcCalls[0][1].p_audience).toBe('community');
    expect(fake.rpcCalls[1][1].p_photo_state).toBe('checked');
  });

  it('checks the PNG the same way', async () => {
    fake.files = { [`wardrobe-images/${SOURCE}`]: pngWithText() };
    visionAnswer({ safeSearchAnnotation: calm, faceAnnotations: [] });
    const r = await community();
    expect(r.status).toBe(200);
    expect(fake.uploads[0].contentType).toBe('image/png');
  });

  it.each([
    ['adult content', { safeSearchAnnotation: { ...calm, adult: 'POSSIBLE' } }, 'unsafe'],
    ['violence', { safeSearchAnnotation: { ...calm, violence: 'LIKELY' } }, 'unsafe'],
    ['a face filling the frame', { safeSearchAnnotation: calm, faceAnnotations: [bigFace] }, 'people'],
  ])('rejects %s with HTTP 422 and keeps the photo out of the bucket', async (_name, annotation, reason) => {
    visionAnswer(annotation);
    const r = await community();
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'photo_rejected', reason });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.rpcCalls.map(c => c[0])).toEqual(['swap_publish_precheck']);
  });

  it.each([
    ['Google reports an error', () => visionAnswer({ error: { code: 3, message: 'bad image' } })],
    ['Google says it could not tell (UNKNOWN)', () => visionAnswer({ safeSearchAnnotation: { ...calm, adult: 'UNKNOWN' } })],
    ['a category is missing', () => visionAnswer({ safeSearchAnnotation: { adult: 'VERY_UNLIKELY' } })],
    ['the face list is not a list', () => visionAnswer({ safeSearchAnnotation: calm, faceAnnotations: {} })],
    ['the answer is empty', () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ responses: [] }), { status: 200 }))],
    ['the answer is not JSON', () => fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))],
    ['Google answers HTTP 500', () => fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))],
    ['Google answers HTTP 403 (key refused)', () => fetchMock.mockResolvedValue(new Response('{}', { status: 403 }))],
    ['the call fails', () => fetchMock.mockRejectedValue(new Error('network down'))],
    ['the call times out', () => fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))],
  ])('fails closed (HTTP 503, nothing stored) when %s', async (_name, arrange) => {
    arrange();
    const r = await community();
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'moderation_unavailable' });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.rpcCalls.map(c => c[0])).toEqual(['swap_publish_precheck']);
  });

  it('fails closed when the Vision key is not set, without calling anything', async () => {
    delete env.GOOGLE_VISION_API_KEY;
    const r = await community();
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'moderation_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.uploads).toHaveLength(0);
  });

  it('does not need the Vision key for friends', async () => {
    delete env.GOOGLE_VISION_API_KEY;
    expect((await publish()).status).toBe(200);
  });

  it('does not leak the Vision key into an answer', async () => {
    fetchMock.mockRejectedValue(new Error(`failed for key=${VISION_KEY}`));
    const r = await community();
    expect(r.text).not.toContain(VISION_KEY);
    for (const call of errorSpy.mock.calls) expect(JSON.stringify(call)).not.toContain(VISION_KEY);
  });
});

describe('swap-media: the sweep', () => {
  const sweep = (token: string | null) => send({ action: 'sweep' }, token);
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

  it('refuses a hand-made token that only claims to be the service role', async () => {
    const r = await sweep(forgedServiceToken());
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'forbidden' });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.removals).toHaveLength(0);
  });

  it('refuses a member session token', async () => {
    const r = await sweep('user-session-token');
    expect(r.status).toBe(403);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('refuses a near miss of the service key', async () => {
    expect((await sweep(`${SERVICE}x`)).status).toBe(403);
    expect((await sweep(SERVICE.slice(0, -1))).status).toBe(403);
    expect((await sweep(SERVICE.toUpperCase())).status).toBe(403);
  });

  it('refuses everything when the service key is not set on the function', async () => {
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await sweep(null)).status).toBe(401);
    expect((await sweep(forgedServiceToken())).status).toBe(403);
    expect((await sweep('undefined')).status).toBe(403);
    expect((await sweep('null')).status).toBe(403);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('runs the upkeep for the service key: janitor, queue, and photos nothing refers to', async () => {
    fake.queue = ['dead-1.jpg', 'dead-2.jpg', 'dead-3.jpg'];
    fake.objects = [
      { name: 'live.jpg', created_at: hoursAgo(5) },
      { name: 'orphan.jpg', created_at: hoursAgo(5) },
      { name: 'fresh-orphan.jpg', created_at: hoursAgo(0.1) },      // may still be mid-publish
    ];
    fake.rpcResults.swap_known_photo_paths = (args: any) => ({ data: (args.p_paths as string[]).filter(p => p === 'live.jpg') });

    const r = await sweep(SERVICE);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, removed: 3, orphans: 1 });

    expect(fake.rpcCalls[0]).toEqual(['swap_janitor', { p_force: true }]);
    expect(fake.queue).toEqual([]);
    expect(fake.removals).toContainEqual({ bucket: 'swap-photos', paths: ['dead-1.jpg', 'dead-2.jpg', 'dead-3.jpg'] });
    expect(fake.removals).toContainEqual({ bucket: 'swap-photos', paths: ['orphan.jpg'] });
    const everythingRemoved = fake.removals.flatMap(x => x.paths);
    expect(everythingRemoved).not.toContain('live.jpg');
    expect(everythingRemoved).not.toContain('fresh-orphan.jpg');
  });

  it.each([
    ['the database returns an error', () => ({ error: { message: 'canceling statement due to statement timeout' } })],
    ['the database returns no list at all', () => ({ data: null })],
  ])('deletes no stored photo when %s, and says the sweep did not finish', async (_name, answer) => {
    fake.objects = [
      { name: 'live-1.jpg', created_at: hoursAgo(120) },
      { name: 'live-2.jpg', created_at: hoursAgo(120) },
    ];
    fake.rpcResults.swap_known_photo_paths = answer as any;
    const r = await sweep(SERVICE);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, error: 'sweep_incomplete', removed: 0, orphans: 0 });
    expect(fake.removals).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith('[swap-media] sweep incomplete');
  });

  it('reaches every page of a large bucket even though removing photos shifts the pages', async () => {
    fake.objects = Array.from({ length: 2500 }, (_, i) => ({ name: `o-${String(i).padStart(4, '0')}.jpg`, created_at: hoursAgo(120) }));
    fake.rpcResults.swap_known_photo_paths = (args: any) => ({ data: (args.p_paths as string[]).filter(p => Number(p.slice(2, 6)) % 3 === 0) });
    const r = await sweep(SERVICE);
    expect(r.status).toBe(200);
    const removed = new Set(fake.removals.flatMap(x => x.paths));
    for (let i = 0; i < 2500; i++) expect(removed.has(`o-${String(i).padStart(4, '0')}.jpg`)).toBe(i % 3 !== 0);
    expect(r.body.orphans).toBe(2500 - Math.ceil(2500 / 3));
  });

  it('does nothing to a bucket with nothing wrong in it', async () => {
    const r = await sweep(SERVICE);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, removed: 0, orphans: 0 });
    expect(fake.removals).toHaveLength(0);
  });

  it('answers server_error with a fixed log line when the upkeep itself breaks', async () => {
    fake.rpcResults.swap_janitor = () => { throw new Error('connection reset (private detail)'); };
    const r = await sweep(SERVICE);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'server_error' });
    expect(r.text).not.toContain('private detail');
    expect(errorSpy).toHaveBeenCalledWith('[swap-media] unexpected error');
  });
});

describe('swap-media: logging', () => {
  it('writes only short fixed lines, never a request, id, path, note, token or key', async () => {
    fake.rpcResults.swap_publish_precheck = () => ({ error: { message: `boom ${USER} ${ITEM} Worn twice ${SOURCE}` } });
    await publish({ note: 'Worn twice' });
    fake.rpcResults.swap_publish_precheck = () => { throw new Error(`explode ${USER} ${SERVICE}`); };
    await publish({ note: 'Worn twice' });
    await send({ action: 'sweep' }, forgedServiceToken());

    expect(errorSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of errorSpy.mock.calls) {
      expect(call).toHaveLength(1);
      expect(call[0]).toMatch(/^\[swap-media\] [a-z ]+$/);
    }
  });
});
