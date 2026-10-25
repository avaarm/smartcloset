/**
 * Runs the pro-photo handler itself (Deno code) in Jest, with the Deno globals and the Supabase client replaced
 * by fakes. proPhotoFunction.test.ts pins the source text; this one pins what the function does with a request:
 * what it refuses and how alike every refusal looks, what it asks the database, what it reads, what it takes out
 * of the image and what it never lets through. The real thing (Deno, Storage, the database function) is proved by
 * the lead on a local stack (API script, gate P4).
 */
import { stripJpegMetadata } from '../../supabase/functions/_shared/jpegMetadata';
import { stripPngMetadata } from '../../supabase/functions/_shared/pngMetadata';

const mockClients = { make: (_url: string, _key: string, _options?: unknown): any => null };
jest.mock(
  'https://esm.sh/@supabase/supabase-js@2.45.4',
  () => ({ createClient: (url: string, key: string, options?: unknown) => mockClients.make(url, key, options) }),
  { virtual: true },
);

const URL_BASE = 'https://project.supabase.test';
const ANON = 'anon-key-for-tests';
const SERVICE = 'service-key-for-tests-0123456789';
const TOKEN = 'user-session-token';
const STYLIST = '11111111-1111-4111-8111-111111111111';
const CLIENT = '99999999-9999-4999-8999-999999999999';          // the client's account id: it names the storage folder
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const FILE = 'closet-photo-8c1f.jpg';
const SOURCE = `${CLIENT}/${FILE}`;
const BUCKET = 'wardrobe-images';
const MB5 = 5 * 1024 * 1024;

// ── Image builders (same shapes as jpegMetadata.test.ts and pngMetadata.test.ts) ───────────────────────
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
const contains = (bytes: Uint8Array, text: string) => latin1(bytes).includes(text);

/** Big-endian Exif: Orientation (optional) and a GPS block with a recognisable marker string. */
const exif = (orientation: number | null, withGps: boolean) => {
  const entries: number[][] = [];
  if (orientation !== null) entries.push([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0]);
  if (withGps) entries.push([0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0x40]);
  const ifd = [...u16(entries.length), ...entries.flat(), 0, 0, 0, 0];
  const gps = withGps ? [...ascii('GPSLATITUDE-37.77-LONGITUDE-122.41-Canon EOS 5D')] : [];
  return seg(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ifd, ...gps]);
};
const SOF0 = seg(0xc0, [8, ...u16(48), ...u16(64), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(16)]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0), 0]);
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const APP0 = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9, 9]);
const MPF = seg(0xe2, [...ascii('MPF'), 0, 1, 2, 3]);
const COMMENT = seg(0xfe, ascii('shot at the cafe on Elm Street'));
const IPTC = seg(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('Jane Doe')]);
const jpeg = (parts: number[][], trailing: number[] = []) =>
  Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9, ...trailing]);
const body = [DQT, SOF0, DHT, SOS, SCAN];
const jpegWithGps = () => jpeg([APP0, exif(1, true), COMMENT, IPTC, MPF, ...body], ascii('TRAILING-SECRET'));

/** A valid JPEG of exactly `size` bytes: the entropy-coded data is padded with bytes that are never 0xFF. */
const jpegOfSize = (size: number) => {
  const head = [0xff, 0xd8, ...DQT, ...SOF0, ...DHT, ...SOS];
  const out = new Uint8Array(size);
  out.set(head, 0);
  out.fill(0x11, head.length, size - 2);
  out.set([0xff, 0xd9], size - 2);
  return out;
};

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
  const payload = [...ascii(type), ...data];
  return [...u32(data.length), ...payload, ...u32(crc32(payload) ^ (badCrc ? 1 : 0))];
};
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = chunk('IHDR', [...u32(64), ...u32(48), 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x18, 0x05, 0xa3, 0x60, 0x14, 0x0c, 0x00, 0x00, 0x00, 0x00]);
const IEND = chunk('IEND');
const png = (parts: number[][], trailing: number[] = []) => Uint8Array.from([...SIGNATURE, ...parts.flat(), ...trailing]);
const pngWithText = () =>
  png([
    IHDR,
    chunk('tEXt', [...ascii('Comment'), 0, ...ascii('shot at the cafe on Elm Street')]),
    chunk('eXIf', [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ascii('GPSLATITUDE-37.77')]),
    chunk('tIME', [0x07, 0xea, 10, 13, 17, 30, 5]),
    IDAT,
    IEND,
  ], ascii('TRAILING-SECRET'));

// ── The fake platform ───────────────────────────────────────────────────────────────────────────────────
type Download = { bucket: string; path: string };

const fake = {
  sessions: {} as Record<string, { id: string } | undefined>,
  getUserCalls: [] as string[],
  getUserError: null as any,
  clients: [] as Array<{ kind: 'user' | 'admin'; url: string; key: string; options?: any }>,
  events: [] as string[],
  rpcCalls: [] as Array<[string, any]>,
  rpcResult: null as null | ((args: any) => { data?: any; error?: any }),
  files: {} as Record<string, Uint8Array>,
  downloads: [] as Download[],
  downloadImpl: null as null | ((bucket: string, path: string) => { data: any; error: any }),
  strayStorageCalls: [] as string[],
  tableCalls: [] as string[],
};
const env: Record<string, string | undefined> = {};

const reset = () => {
  fake.sessions = { [TOKEN]: { id: STYLIST } };
  fake.getUserCalls = [];
  fake.getUserError = null;
  fake.clients = [];
  fake.events = [];
  fake.rpcCalls = [];
  fake.rpcResult = () => ({ data: SOURCE });
  fake.files = { [`${BUCKET}/${SOURCE}`]: jpegWithGps() };
  fake.downloads = [];
  fake.downloadImpl = null;
  fake.strayStorageCalls = [];
  fake.tableCalls = [];
  for (const k of Object.keys(env)) delete env[k];
  env.SUPABASE_URL = URL_BASE;
  env.SUPABASE_ANON_KEY = ANON;
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
};

const blobOf = (bytes: Uint8Array) => ({
  size: bytes.byteLength,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

const stray = (name: string) => async () => {
  fake.strayStorageCalls.push(name);
  return { data: null, error: { message: 'unexpected' } };
};

const makeClient = (url: string, key: string, options?: any) => {
  if (key === ANON) {
    fake.clients.push({ kind: 'user', url, key, options });
    return {
      auth: {
        getUser: async (token: string) => {
          fake.events.push('getUser');
          fake.getUserCalls.push(token);
          if (fake.getUserError) throw fake.getUserError;
          const user = fake.sessions[token];
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } };
        },
      },
    };
  }
  fake.clients.push({ kind: 'admin', url, key, options });
  return {
    rpc: async (name: string, args: any) => {
      fake.events.push(`rpc:${name}`);
      fake.rpcCalls.push([name, args]);
      if (name !== 'pro_photo_source' || !fake.rpcResult) throw new Error(`unexpected rpc ${name}`);
      const r = fake.rpcResult(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (table: string) => {
      fake.tableCalls.push(table);
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          fake.events.push('download');
          fake.downloads.push({ bucket, path });
          if (fake.downloadImpl) return fake.downloadImpl(bucket, path);
          const bytes = fake.files[`${bucket}/${path}`];
          if (!bytes) return { data: null, error: { message: `Object not found: ${path}` } };
          return { data: blobOf(bytes), error: null };
        },
        upload: stray('upload'),
        remove: stray('remove'),
        list: stray('list'),
        move: stray('move'),
        copy: stray('copy'),
        update: stray('update'),
        createSignedUrl: stray('createSignedUrl'),
        createSignedUrls: stray('createSignedUrls'),
        createSignedUploadUrl: stray('createSignedUploadUrl'),
        getPublicUrl: () => { fake.strayStorageCalls.push('getPublicUrl'); return { data: { publicUrl: 'https://x.test/' } }; },
      }),
    },
  };
};

// ── Loading the handler ─────────────────────────────────────────────────────────────────────────────────
let handler: (req: Request) => Promise<Response>;
const g = globalThis as any;
let fetchMock: jest.Mock;
let spies: Record<'error' | 'log' | 'warn' | 'info', jest.SpyInstance>;
const realFetch = g.fetch;

beforeAll(() => {
  mockClients.make = makeClient;
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
  };
  require('../../supabase/functions/pro-photo/index');
});

afterAll(() => {
  delete g.Deno;
  g.fetch = realFetch;
});

beforeEach(() => {
  reset();
  fetchMock = jest.fn();
  g.fetch = fetchMock;
  spies = {
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    info: jest.spyOn(console, 'info').mockImplementation(() => {}),
  };
});

afterEach(() => {
  for (const s of Object.values(spies)) s.mockRestore();
});

const ok = `c=${CONNECTION}&i=${ITEM}`;
type Options = { token?: string | null; authorization?: string; method?: string; headers?: Record<string, string> };

const call = async (query: string = ok, { token = TOKEN, authorization, method = 'GET', headers = {} }: Options = {}) => {
  const h: Record<string, string> = { ...headers };
  if (authorization !== undefined) h.Authorization = authorization;
  else if (token !== null) h.Authorization = `Bearer ${token}`;
  const res = await handler(new Request(`${URL_BASE}/functions/v1/pro-photo${query ? `?${query}` : ''}`, { method, headers: h }));
  const bytes = new Uint8Array(await res.arrayBuffer());
  const headerList = Array.from(res.headers.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  return { status: res.status, bytes, headers: res.headers, headerList, text: latin1(bytes) };
};

/** Everything a stylist can see of an answer, as one comparable value. */
const look = (r: { status: number; headerList: Array<[string, string]>; text: string }) =>
  JSON.stringify({ status: r.status, headers: r.headerList, body: r.text });

const expectedJpeg = (input: Uint8Array) => {
  const r = stripJpegMetadata(input);
  if (!r.ok) throw new Error(r.reason);
  return Array.from(r.bytes);
};

const refusedBy = async (arrange: () => void, query: string = ok) => {
  reset();
  arrange();
  return call(query);
};

describe('pro-photo: requests it turns away before asking anyone', () => {
  it('answers the browser preflight with no body and asks nobody', async () => {
    const r = await call('', { method: 'OPTIONS', token: null });
    expect(r.status).toBe(200);
    expect(r.bytes).toHaveLength(0);
    expect(r.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
    expect(fake.clients).toHaveLength(0);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])('refuses %s with 405 and asks nobody', async method => {
    const r = await call(ok, { method });
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('GET, OPTIONS');
    expect(r.bytes).toHaveLength(0);
    expect(fake.clients).toHaveLength(0);
  });

  it.each([
    ['no Authorization header', { token: null }],
    ['an empty bearer token', { authorization: 'Bearer ' }],
    ['a bare "Bearer"', { authorization: 'Bearer' }],
    ['a blank header', { authorization: '' }],
    ['another scheme', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['a token with a space in it', { authorization: `Bearer ${TOKEN} extra` }],
    ['a token with no scheme', { authorization: TOKEN }],
  ])('answers 401 and asks nobody when there is %s', async (_name, options) => {
    const r = await call(ok, options as Options);
    expect(r.status).toBe(401);
    expect(r.bytes).toHaveLength(0);
    expect(fake.clients).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['no parameters at all', ''],
    ['no connection', `i=${ITEM}`],
    ['no piece', `c=${CONNECTION}`],
    ['empty values', 'c=&i='],
    ['a connection that is not a uuid', `c=not-a-uuid&i=${ITEM}`],
    ['a piece that is not a uuid', `c=${CONNECTION}&i=7`],
    ['a path where the piece should be', `c=${CONNECTION}&i=${SOURCE}`],
    ['a path traversal', `c=../../${CLIENT}&i=${ITEM}`],
    ['a uuid with a character added', `c=${CONNECTION}0&i=${ITEM}`],
    ['a uuid with a character missing', `c=${CONNECTION.slice(1)}&i=${ITEM}`],
    ['a uuid with a file extension', `c=${CONNECTION}&i=${ITEM}.jpg`],
    ['a uuid with a trailing newline', `c=${CONNECTION}&i=${ITEM}%0A`],
    ['a uuid with a leading space', `c=%20${CONNECTION}&i=${ITEM}`],
    ['a uuid with a NUL', `c=${CONNECTION}&i=${ITEM}%00`],
    ['a uuid in braces', `c={${CONNECTION}}&i=${ITEM}`],
    ['a uuid as a urn', `c=urn:uuid:${CONNECTION}&i=${ITEM}`],
    ['a uuid without its dashes', `c=${CONNECTION.replace(/-/g, '')}&i=${ITEM}`],
    ['a uuid with a non-hex digit', `c=${CONNECTION.replace(/^2/, 'g')}&i=${ITEM}`],
    ['SQL in a value', `c=${CONNECTION}&i=${encodeURIComponent("' or '1'='1")}`],
    ['the connection given twice', `c=${CONNECTION}&c=${CONNECTION}&i=${ITEM}`],
    ['the piece given twice', `c=${CONNECTION}&i=${ITEM}&i=${ITEM}`],
    ['two different pieces', `c=${CONNECTION}&i=${ITEM}&i=${CONNECTION}`],
    ['parameter names in capitals', `C=${CONNECTION}&I=${ITEM}`],
    ['long names instead of c and i', `connection=${CONNECTION}&item=${ITEM}`],
  ])('answers a bare 404 and asks nobody for %s', async (_name, query) => {
    const r = await call(query);
    expect(r.status).toBe(404);
    expect(r.bytes).toHaveLength(0);
    expect(fake.clients).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.downloads).toHaveLength(0);
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('turns a malformed id away before it checks the token, so junk costs no call to the auth service', async () => {
    const r = await call('c=x&i=y', { token: 'a-token-nobody-issued' });
    expect(r.status).toBe(404);
    expect(fake.getUserCalls).toHaveLength(0);
  });
});

describe('pro-photo: who is asking', () => {
  it('reads the user from the token with the anon key, and nowhere else', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(fake.getUserCalls).toEqual([TOKEN]);
    const [user, admin] = fake.clients;
    expect(user).toEqual({
      kind: 'user', url: URL_BASE, key: ANON, options: { global: { headers: { Authorization: `Bearer ${TOKEN}` } } },
    });
    expect(admin).toEqual({ kind: 'admin', url: URL_BASE, key: SERVICE, options: undefined });
    expect(fake.clients).toHaveLength(2);
  });

  it('accepts the scheme in any case, and passes the token on in the one canonical form', async () => {
    const r = await call(ok, { authorization: `bearer   ${TOKEN}` });
    expect(r.status).toBe(200);
    expect(fake.getUserCalls).toEqual([TOKEN]);
    expect(fake.clients[0].options).toEqual({ global: { headers: { Authorization: `Bearer ${TOKEN}` } } });
  });

  it('answers 401 and goes no further for a session the platform cannot vouch for', async () => {
    const r = await call(ok, { token: 'signed-out-session' });
    expect(r.status).toBe(401);
    expect(r.bytes).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.downloads).toHaveLength(0);
    expect(fake.clients.map(c => c.kind)).toEqual(['user']);
  });

  it('does not accept the service key as a person', async () => {
    const r = await call(ok, { token: SERVICE });
    expect(r.status).toBe(401);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('gives the database the id of the person the token names, whatever else the request says', async () => {
    const OTHER = '55555555-5555-4555-8555-555555555555';
    fake.sessions['other-session'] = { id: OTHER };
    const r = await call(
      `${ok}&p_uid=${CLIENT}&u=${CLIENT}&uid=${CLIENT}&user=${CLIENT}&user_id=${CLIENT}`,
      { token: 'other-session', headers: { 'x-user-id': CLIENT, 'x-forwarded-user': CLIENT, apikey: SERVICE } },
    );
    expect(r.status).toBe(200);
    expect(fake.rpcCalls).toEqual([['pro_photo_source', { p_uid: OTHER, p_connection: CONNECTION, p_item: ITEM }]]);
  });

  it('answers 500 with a fixed line, and says nothing of it, when the auth service breaks', async () => {
    fake.getUserError = new Error(`down for ${TOKEN} ${STYLIST}`);
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.bytes).toHaveLength(0);
    expect(spies.error.mock.calls).toEqual([['[pro-photo] unexpected error']]);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])('answers 500 and calls nothing when %s is not set', async name => {
    delete env[name];
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.bytes).toHaveLength(0);
    expect(fake.clients).toHaveLength(0);
    expect(spies.error.mock.calls).toEqual([['[pro-photo] not configured']]);
  });
});

describe('pro-photo: the database decides', () => {
  it('asks once, before any photo, with exactly the arguments the SQL function declares', async () => {
    await call();
    expect(fake.rpcCalls).toEqual([['pro_photo_source', { p_uid: STYLIST, p_connection: CONNECTION, p_item: ITEM }]]);
    expect(fake.events).toEqual(['getUser', 'rpc:pro_photo_source', 'download']);
  });

  it('sends the ids in lower case, however the app wrote them', async () => {
    const r = await call(`c=${CONNECTION.toUpperCase()}&i=${ITEM.toUpperCase()}`);
    expect(r.status).toBe(200);
    expect(fake.rpcCalls[0][1]).toEqual({ p_uid: STYLIST, p_connection: CONNECTION, p_item: ITEM });
  });

  it('takes the photo from the path the database named and from nothing in the request', async () => {
    const decoy = `${STYLIST}/decoy.jpg`;
    fake.files[`${BUCKET}/${decoy}`] = jpeg([APP0, ...body]);
    const query = `${ok}&path=${encodeURIComponent(decoy)}&name=${encodeURIComponent(decoy)}&file=decoy.jpg&url=https://x.test/a.jpg&bucket=swap-photos`;
    const r = await call(query);
    expect(r.status).toBe(200);
    expect(fake.downloads).toEqual([{ bucket: BUCKET, path: SOURCE }]);
    expect(Array.from(r.bytes)).toEqual(expectedJpeg(jpegWithGps()));
  });

  it('follows the database when the piece changes, and downloads the path it gives', async () => {
    const other = `${CLIENT}/second-photo.jpg`;
    fake.files[`${BUCKET}/${other}`] = jpeg([APP0, ...body]);
    fake.rpcResult = args => ({ data: args.p_item === ITEM ? SOURCE : other });
    await call();
    await call(`c=${CONNECTION}&i=44444444-4444-4444-8444-444444444444`);
    expect(fake.downloads.map(d => d.path)).toEqual([SOURCE, other]);
  });

  describe('every refusal is the same answer', () => {
    const REASONS: Array<[string, () => void, string?]> = [
      ['no grant, a piece outside it, a wishlist piece, no photo, a stranger (null)', () => { fake.rpcResult = () => ({ data: null }); }],
      ['an empty answer', () => { fake.rpcResult = () => ({}); }],
      ['an empty string', () => { fake.rpcResult = () => ({ data: '' }); }],
      ['a number', () => { fake.rpcResult = () => ({ data: 7 }); }],
      ['an object', () => { fake.rpcResult = () => ({ data: { path: SOURCE } }); }],
      ['a path with no account folder', () => { fake.rpcResult = () => ({ data: FILE }); }],
      ['a path whose folder is not an account id', () => { fake.rpcResult = () => ({ data: `someone/${FILE}` }); }],
      ['a path that climbs out of the folder', () => { fake.rpcResult = () => ({ data: `${CLIENT}/../${STYLIST}/${FILE}` }); }],
      ['a path to a hidden file', () => { fake.rpcResult = () => ({ data: `${CLIENT}/.${FILE}` }); }],
      ['a path with a second level', () => { fake.rpcResult = () => ({ data: `${CLIENT}/a/${FILE}` }); }],
      ['a path with a space', () => { fake.rpcResult = () => ({ data: `${CLIENT}/my photo.jpg` }); }],
      ['a path with a newline', () => { fake.rpcResult = () => ({ data: `${SOURCE}\n` }); }],
      ['a folder with nothing in it', () => { fake.rpcResult = () => ({ data: `${CLIENT}/` }); }],
      ['the photo is gone from storage', () => { fake.files = {}; }],
      ['storage cannot answer', () => { fake.downloadImpl = () => ({ data: null, error: { message: `storage down for ${SOURCE}` } }); }],
      ['storage answers with nothing', () => { fake.downloadImpl = () => ({ data: null, error: null }); }],
      ...['pro_unavailable', 'pro_disabled', 'pro_suspended', 'closet_not_shared', 'connection_ended',
        'pro_terms_required', 'adult_required', 'stylist_profile_required', 'not_authenticated'].map(
        (code): [string, () => void] => [`the database raising ${code}`, () => { fake.rpcResult = () => ({ error: { message: code, details: 'x', hint: 'y' } }); }],
      ),
    ];

    it.each(REASONS)('%s', async (_name, arrange) => {
      const r = await refusedBy(arrange);
      expect(r.status).toBe(404);
      expect(r.bytes).toHaveLength(0);
      expect(r.headers.get('content-type')).toBeNull();
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      expect(fake.tableCalls).toHaveLength(0);
    });

    it('looks the same to the stylist whatever the reason: status, every header, and body', async () => {
      const seen = new Set<string>();
      for (const [, arrange] of REASONS) seen.add(look(await refusedBy(arrange)));
      seen.add(look(await refusedBy(() => {}, 'c=nope&i=nope')));
      seen.add(look(await refusedBy(() => {}, `i=${ITEM}`)));
      expect(Array.from(seen)).toHaveLength(1);
    });

    it('downloads nothing when the database refuses, and nothing when the path is not one it would give', async () => {
      for (const [name, arrange] of REASONS) {
        if (name.startsWith('the photo is gone') || name.startsWith('storage')) continue;
        const r = await refusedBy(arrange);
        expect(r.status).toBe(404);
        expect(fake.downloads).toHaveLength(0);
      }
    });

    it('stays silent about a refusal: nothing is logged', async () => {
      for (const [name, arrange] of REASONS) {
        if (name.startsWith('the photo is gone') || name.startsWith('storage')) continue;
        await refusedBy(arrange);
      }
      expect(spies.error).not.toHaveBeenCalled();
    });
  });

  it('answers 429 and downloads nothing when the stylist is over the photo limit', async () => {
    fake.rpcResult = () => ({ error: { message: 'pro_rate_limited', details: 'photo_day', code: '54000' } });
    const r = await call();
    expect(r.status).toBe(429);
    expect(r.bytes).toHaveLength(0);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.downloads).toHaveLength(0);
    expect(r.text).not.toContain('photo_day');
    expect(spies.error).not.toHaveBeenCalled();
  });

  it('answers 500 with a fixed line, and repeats nothing, for a database error it does not know', async () => {
    fake.rpcResult = () => ({ error: { message: `relation "pro_grants" does not exist for ${STYLIST} ${SOURCE}`, details: CLIENT } });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.bytes).toHaveLength(0);
    expect(fake.downloads).toHaveLength(0);
    expect(spies.error.mock.calls).toEqual([['[pro-photo] database error']]);
  });

  it('answers 500 with a fixed line when the call itself throws', async () => {
    fake.rpcResult = () => { throw new Error(`connection reset ${SERVICE} ${SOURCE}`); };
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.bytes).toHaveLength(0);
    expect(spies.error.mock.calls).toEqual([['[pro-photo] unexpected error']]);
  });
});

describe('pro-photo: the photo it sends', () => {
  it('sends a JPEG cleaned of location, camera, comments, IPTC, multi-picture data and trailing bytes', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    for (const secret of ['GPSLATITUDE', 'LONGITUDE', 'Canon', 'Exif', 'Elm Street', 'Jane Doe', 'Photoshop', 'MPF', 'TRAILING-SECRET']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(Array.from(r.bytes)).toEqual(expectedJpeg(jpegWithGps()));
    expect(Array.from(r.bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(r.bytes.slice(-2))).toEqual([0xff, 0xd9]);
  });

  it('keeps the rotation of a rotated photo and nothing else of its Exif', async () => {
    fake.files[`${BUCKET}/${SOURCE}`] = jpeg([APP0, exif(6, true), ...body]);
    const r = await call();
    expect(r.status).toBe(200);
    const cleaned = stripJpegMetadata(r.bytes);
    if (!cleaned.ok) throw new Error(cleaned.reason);
    expect(cleaned.orientation).toBe(6);
    expect(contains(r.bytes, 'GPSLATITUDE')).toBe(false);
    expect(contains(r.bytes, 'Canon')).toBe(false);
  });

  it('keeps the colour profile, so colours look the same', async () => {
    fake.files[`${BUCKET}/${SOURCE}`] = jpeg([APP0, ICC, exif(1, true), ...body]);
    const r = await call();
    expect(contains(r.bytes, 'ICC_PROFILE')).toBe(true);
    expect(contains(r.bytes, 'GPSLATITUDE')).toBe(false);
  });

  it('sends a PNG cleaned of text, Exif, time and trailing bytes, as a PNG', async () => {
    fake.files[`${BUCKET}/${SOURCE}`] = pngWithText();
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    for (const secret of ['Elm Street', 'GPSLATITUDE', 'tEXt', 'eXIf', 'tIME', 'TRAILING-SECRET']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(Array.from(r.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const expected = stripPngMetadata(pngWithText());
    if (!expected.ok) throw new Error(expected.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(expected.bytes));
  });

  it('tells a PNG from a JPEG by its first bytes: the app stores a PNG under a .jpg name', async () => {
    fake.files[`${BUCKET}/${SOURCE}`] = pngWithText();
    expect(SOURCE.endsWith('.jpg')).toBe(true);
    expect((await call()).headers.get('content-type')).toBe('image/png');
  });

  it('tells a JPEG by its first bytes even when the name says PNG', async () => {
    const named = `${CLIENT}/shot.png`;
    fake.rpcResult = () => ({ data: named });
    fake.files = { [`${BUCKET}/${named}`]: jpegWithGps() };
    const r = await call();
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(contains(r.bytes, 'GPSLATITUDE')).toBe(false);
  });

  it('is the same cleaned photo every time', async () => {
    const first = await call();
    const second = await call();
    expect(Array.from(second.bytes)).toEqual(Array.from(first.bytes));
  });

  describe('the size limit', () => {
    it('serves a photo of exactly 5 MB', async () => {
      fake.files[`${BUCKET}/${SOURCE}`] = jpegOfSize(MB5);
      const r = await call();
      expect(r.status).toBe(200);
      expect(r.bytes.length).toBeGreaterThan(MB5 - 200);
    });

    it('refuses one byte more with 413, sends nothing of it, and logs a fixed line', async () => {
      fake.files[`${BUCKET}/${SOURCE}`] = jpegOfSize(MB5 + 1);
      const r = await call();
      expect(r.status).toBe(413);
      expect(r.bytes).toHaveLength(0);
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      expect(spies.error.mock.calls).toEqual([['[pro-photo] photo too large']]);
    });

    it('refuses by the size storage reports, without reading the object', async () => {
      const arrayBuffer = jest.fn(async () => new ArrayBuffer(8));
      fake.downloadImpl = () => ({ data: { size: MB5 + 1, arrayBuffer }, error: null });
      const r = await call();
      expect(r.status).toBe(413);
      expect(arrayBuffer).not.toHaveBeenCalled();
    });

    it('refuses by what it read when storage reports no size', async () => {
      const big = jpegOfSize(MB5 + 1);
      fake.downloadImpl = () => ({ data: { arrayBuffer: async () => big.buffer }, error: null });
      expect((await call()).status).toBe(413);
    });
  });

  describe('what is not a clean PNG or JPEG', () => {
    it.each([
      ['a GIF', Uint8Array.from(ascii('GIF89a......'))],
      ['a WebP', Uint8Array.from([...ascii('RIFF'), 24, 0, 0, 0, ...ascii('WEBPVP8 '), 0, 0, 0, 0])],
      ['a HEIC', Uint8Array.from([0, 0, 0, 24, ...ascii('ftypheic'), 0, 0, 0, 0, ...ascii('mif1heic')])],
      ['an SVG', Uint8Array.from(ascii('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))],
      ['an HTML page', Uint8Array.from(ascii('<html><script>alert(1)</script></html>'))],
      ['text', Uint8Array.from(ascii('not a photo'))],
      ['an empty file', new Uint8Array(0)],
      ['a truncated JPEG', jpegWithGps().slice(0, 40)],
      ['a JPEG with no picture in it', jpeg([APP0, DQT])],
      ['a PNG with nothing after its signature', Uint8Array.from(SIGNATURE)],
      ['a PNG with a corrupt picture', png([IHDR, chunk('IDAT', [1, 2, 3], true), IEND])],
      ['a PNG with a critical chunk nobody knows', png([IHDR, chunk('XYZW', [1]), IDAT, IEND])],
    ])('answers 415 for %s and sends none of its bytes', async (_name, bytes) => {
      fake.files[`${BUCKET}/${SOURCE}`] = bytes;
      const r = await call();
      expect(r.status).toBe(415);
      expect(r.bytes).toHaveLength(0);
      expect(r.headers.get('content-type')).toBeNull();
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      expect(spies.error.mock.calls).toEqual([['[pro-photo] unsupported image']]);
    });
  });
});

describe('pro-photo: the answer', () => {
  it('carries a type, no-store, nosniff and the preflight headers, and nothing else', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headerList.map(([name]) => name)).toEqual([
      'access-control-allow-headers',
      'access-control-allow-methods',
      'access-control-allow-origin',
      'cache-control',
      'content-type',
      'x-content-type-options',
    ]);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('puts the same no-store and nosniff on a refusal, an error and a limit', async () => {
    const answers = [
      await call('c=x&i=y'),
      await call(ok, { token: 'nobody' }),
      await refusedBy(() => { fake.rpcResult = () => ({ data: null }); }),
      await refusedBy(() => { fake.rpcResult = () => ({ error: { message: 'pro_rate_limited' } }); }),
      await refusedBy(() => { fake.rpcResult = () => ({ error: { message: 'boom' } }); }),
      await refusedBy(() => { fake.files = { [`${BUCKET}/${SOURCE}`]: Uint8Array.from(ascii('GIF89a')) }; }),
      await call(ok, { method: 'POST' }),
    ];
    expect(answers.map(a => a.status)).toEqual([404, 401, 404, 429, 500, 415, 405]);
    for (const a of answers) {
      expect(a.headers.get('cache-control')).toBe('private, no-store');
      expect(a.headers.get('x-content-type-options')).toBe('nosniff');
      expect(a.bytes).toHaveLength(0);
    }
  });

  it('has no file name, no validator, no cookie and no header that names the object', async () => {
    const r = await call();
    for (const name of ['content-disposition', 'etag', 'last-modified', 'content-location', 'location', 'set-cookie', 'link', 'x-path', 'x-object', 'x-file-name']) {
      expect(r.headers.get(name)).toBeNull();
    }
  });

  it('never contains the client account id, the path, the file name, the ids it was asked about, or a key', async () => {
    const answers = [
      await call(),
      await call(`${ok}&path=${SOURCE}`),
      await refusedBy(() => { fake.files = {}; }),
      await refusedBy(() => { fake.rpcResult = () => ({ error: { message: `boom ${CLIENT} ${SOURCE}`, details: CLIENT, hint: SOURCE } }); }),
      await refusedBy(() => { fake.rpcResult = () => ({ error: { message: 'pro_rate_limited', details: CLIENT } }); }),
      await refusedBy(() => { fake.files = { [`${BUCKET}/${SOURCE}`]: Uint8Array.from(ascii('GIF89a')) }; }),
    ];
    for (const a of answers) {
      const everything = JSON.stringify(a.headerList) + a.text;
      for (const secret of [CLIENT, SOURCE, FILE, 'closet-photo', CONNECTION, ITEM, STYLIST, SERVICE, ANON, TOKEN, BUCKET]) {
        expect(everything).not.toContain(secret);
      }
    }
  });

  it('does not put the client account id into the photo, even if the stored file held it', async () => {
    const tagged = jpeg([APP0, seg(0xfe, ascii(`owner ${CLIENT}`)), seg(0xe1, [...ascii('Exif'), 0, 0, ...ascii(CLIENT)]), ...body], ascii(SOURCE));
    fake.files[`${BUCKET}/${SOURCE}`] = tagged;
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(CLIENT);
    expect(r.text).not.toContain(FILE);
  });
});

describe('pro-photo: what it never does', () => {
  it('reads one object and touches nothing else: no write, no signed link, no table, no outside call', async () => {
    await call();
    await call(ok, { token: 'nobody' });
    await refusedBy(() => { fake.files = { [`${BUCKET}/${SOURCE}`]: pngWithText() }; });
    expect(fake.strayStorageCalls).toEqual([]);
    expect(fake.tableCalls).toEqual([]);
    expect(fake.downloads.every(d => d.bucket === BUCKET && d.path === SOURCE)).toBe(true);
    expect(fake.rpcCalls.every(([name]) => name === 'pro_photo_source')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the service key for the database and storage only, and never for the identity check', async () => {
    await call();
    const kinds = fake.clients.map(c => [c.kind, c.key]);
    expect(kinds).toEqual([['user', ANON], ['admin', SERVICE]]);
    expect(fake.getUserCalls).toEqual([TOKEN]);
  });

  it('writes only short fixed lines, never an id, a path, a token or a key, whatever fails', async () => {
    const failures: Array<() => void> = [
      () => { fake.rpcResult = () => ({ error: { message: `boom ${STYLIST} ${ITEM} ${SOURCE} ${TOKEN}` } }); },
      () => { fake.rpcResult = () => { throw new Error(`explode ${CLIENT} ${SERVICE}`); }; },
      () => { fake.getUserError = new Error(`auth down ${TOKEN}`); },
      () => { fake.files = {}; },
      () => { fake.downloadImpl = () => ({ data: null, error: { message: `storage said ${SOURCE}` } }); },
      () => { fake.files = { [`${BUCKET}/${SOURCE}`]: jpegOfSize(MB5 + 1) }; },
      () => { fake.files = { [`${BUCKET}/${SOURCE}`]: Uint8Array.from(ascii('GIF89a')) }; },
      () => { delete env.SUPABASE_SERVICE_ROLE_KEY; },
    ];
    for (const arrange of failures) await refusedBy(arrange);
    await call(ok, { token: 'nobody' });

    expect(spies.error.mock.calls.length).toBeGreaterThanOrEqual(failures.length - 1);
    for (const callArgs of spies.error.mock.calls) {
      expect(callArgs).toHaveLength(1);
      expect(callArgs[0]).toMatch(/^\[pro-photo\] [a-z ]+$/);
    }
    for (const level of ['log', 'warn', 'info'] as const) expect(spies[level]).not.toHaveBeenCalled();
  });
});
