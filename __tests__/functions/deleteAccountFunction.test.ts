/**
 * Runs the delete-account handler (Deno code) in Jest with the Deno globals and the Supabase client replaced
 * by fakes: the account goes first, then the closet photos, then the swap-photos copies queued by the
 * deletion, and a failure in one cleanup never stops the next or undoes the deletion. Real Storage is proved
 * by hand at gate G3.
 */
import fs from 'fs';
import path from 'path';

const mockClients = { make: (_key: string): any => null };
jest.mock(
  'https://esm.sh/@supabase/supabase-js@2.45.4',
  () => ({ createClient: (_url: string, key: string) => mockClients.make(key) }),
  { virtual: true },
);

const ANON = 'anon-key-for-tests';
const SERVICE = 'service-key-for-tests-0123456789';
const USER = '11111111-1111-4111-8111-111111111111';

const fake = {
  user: null as any,
  deleteError: null as any,
  events: [] as string[],
  wardrobe: [] as string[],
  queue: [] as string[],
  listError: null as any,
  queueError: null as any,
  failRemoveIn: null as string | null,
  removals: [] as Array<{ bucket: string; paths: string[] }>,
  listPrefixes: [] as string[],
};
const env: Record<string, string | undefined> = {};

const reset = () => {
  fake.user = { id: USER };
  fake.deleteError = null;
  fake.events = [];
  fake.wardrobe = [];
  fake.queue = [];
  fake.listError = null;
  fake.queueError = null;
  fake.failRemoveIn = null;
  fake.removals = [];
  fake.listPrefixes = [];
  env.SUPABASE_URL = 'https://project.supabase.test';
  env.SUPABASE_ANON_KEY = ANON;
  env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
};

const makeClient = (key: string) => {
  if (key === ANON) {
    return {
      auth: { getUser: async () => (fake.user ? { data: { user: fake.user }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }) },
      rpc: async (name: string) => {
        fake.events.push(`rpc:${name}`);
        return { error: fake.deleteError };
      },
    };
  }
  return {
    from: (table: string) => {
      if (table !== 'swap_photo_gc') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          order: () => ({
            limit: async (n: number) => (fake.queueError
              ? { data: null, error: fake.queueError }
              : { data: fake.queue.slice(0, n).map(p => ({ path: p })), error: null }),
          }),
        }),
        delete: () => ({
          in: async (_col: string, paths: string[]) => {
            fake.events.push('queue:delete');
            fake.queue = fake.queue.filter(p => !paths.includes(p));
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          fake.listPrefixes.push(prefix);
          if (fake.listError) return { data: null, error: fake.listError };
          return { data: fake.wardrobe.map(name => ({ id: `id-${name}`, name })), error: null };
        },
        remove: async (paths: string[]) => {
          fake.events.push(`remove:${bucket}`);
          fake.removals.push({ bucket, paths });
          if (fake.failRemoveIn === bucket) return { data: null, error: { message: 'storage down' } };
          if (bucket === 'wardrobe-images') {
            const names = paths.map(p => p.slice(USER.length + 1));
            fake.wardrobe = fake.wardrobe.filter(n => !names.includes(n));
          }
          return { data: paths.map(name => ({ name })), error: null };
        },
      }),
    },
  };
};

let handler: (req: Request) => Promise<Response>;
const g = globalThis as any;
let errorSpy: jest.SpyInstance;

beforeAll(() => {
  mockClients.make = makeClient;
  g.Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
  };
  require('../../supabase/functions/delete-account/index');
});

afterAll(() => {
  delete g.Deno;
});

beforeEach(() => {
  reset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

const call = async (token: string | null = 'user-session-token', method = 'POST') => {
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await handler(new Request('https://project.supabase.test/functions/v1/delete-account', { method, headers }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

describe('delete-account', () => {
  it('answers the preflight and refuses other methods', async () => {
    expect((await call(null, 'OPTIONS')).status).toBe(200);
    expect((await call('x', 'GET')).status).toBe(405);
  });

  it('refuses a request with no token or a token the platform rejects, and touches nothing', async () => {
    expect((await call(null)).status).toBe(401);
    fake.user = null;
    expect((await call()).status).toBe(401);
    expect(fake.events).toEqual([]);
  });

  it('deletes the account before any photo, then the closet photos, then the queued swap photos', async () => {
    fake.wardrobe = ['a.jpg', 'b.jpg', 'c.png'];
    fake.queue = ['l1.jpg', 'l2.jpg'];
    const r = await call();
    expect(r).toEqual({ status: 200, body: { ok: true, photosRemoved: 5 } });

    expect(fake.events[0]).toBe('rpc:delete_user_account');
    expect(fake.events.indexOf('remove:wardrobe-images')).toBeLessThan(fake.events.indexOf('remove:swap-photos'));
    expect(fake.listPrefixes.every(p => p === USER)).toBe(true);
    expect(fake.removals).toEqual([
      { bucket: 'wardrobe-images', paths: [`${USER}/a.jpg`, `${USER}/b.jpg`, `${USER}/c.png`] },
      { bucket: 'swap-photos', paths: ['l1.jpg', 'l2.jpg'] },
    ]);
    expect(fake.queue).toEqual([]);
  });

  it('stops before touching any photo if the account could not be deleted', async () => {
    fake.deleteError = { message: 'constraint (private detail)' };
    fake.wardrobe = ['a.jpg'];
    fake.queue = ['l1.jpg'];
    const r = await call();
    expect(r).toEqual({ status: 500, body: { error: 'could not delete account' } });
    expect(fake.removals).toEqual([]);
    expect(fake.queue).toEqual(['l1.jpg']);
  });

  it('reports nothing as incomplete when there was nothing to remove', async () => {
    const r = await call();
    expect(r).toEqual({ status: 200, body: { ok: true, photosRemoved: 0 } });
  });

  it('empties a long queue in rounds', async () => {
    fake.queue = Array.from({ length: 450 }, (_, i) => `l${i}.jpg`);
    const r = await call();
    expect(r.body).toEqual({ ok: true, photosRemoved: 450 });
    expect(fake.queue).toEqual([]);
    expect(fake.removals.map(x => x.paths.length)).toEqual([200, 200, 50]);
  });

  it('still removes the swap photos when the closet cleanup fails, and says it was incomplete', async () => {
    fake.listError = { message: 'list failed' };
    fake.queue = ['l1.jpg'];
    const r = await call();
    expect(r).toEqual({ status: 200, body: { ok: true, photosRemoved: 1, photosIncomplete: true } });
    expect(fake.removals).toEqual([{ bucket: 'swap-photos', paths: ['l1.jpg'] }]);
    expect(errorSpy).toHaveBeenCalledWith('[delete-account] photo cleanup incomplete:', 'list failed');
  });

  it('keeps the queue and says it was incomplete when the swap bucket cannot be emptied', async () => {
    fake.wardrobe = ['a.jpg'];
    fake.queue = ['l1.jpg', 'l2.jpg'];
    fake.failRemoveIn = 'swap-photos';
    const r = await call();
    expect(r).toEqual({ status: 200, body: { ok: true, photosRemoved: 1, photosIncomplete: true } });
    expect(fake.queue).toEqual(['l1.jpg', 'l2.jpg']);           // the sweep will try again
    expect(fake.events).not.toContain('queue:delete');
  });

  it('says it was incomplete when the queue cannot be read (for example before the swap migrations)', async () => {
    fake.wardrobe = ['a.jpg'];
    fake.queueError = { message: 'relation does not exist' };
    const r = await call();
    expect(r).toEqual({ status: 200, body: { ok: true, photosRemoved: 1, photosIncomplete: true } });
  });
});

describe('supabase config and function source', () => {
  const root = path.join(__dirname, '..', '..', 'supabase');
  const toml = fs.readFileSync(path.join(root, 'config.toml'), 'utf8');
  const deleteSource = fs.readFileSync(path.join(root, 'functions', 'delete-account', 'index.ts'), 'utf8');

  it('turns JWT verification on for swap-media, as a second layer behind its own sweep check', () => {
    expect(toml).toMatch(/\[functions\.swap-media\]\s*\nverify_jwt = true/);
  });

  it('turns JWT verification on for every function in the folder', () => {
    const functions = fs.readdirSync(path.join(root, 'functions'), { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      .map(d => d.name);
    expect(functions).toEqual(expect.arrayContaining(['ai-proxy', 'delete-account', 'swap-media']));
    for (const name of functions) {
      expect(toml).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s*\\nverify_jwt = true`));
    }
  });

  it('logs only fixed text and an error message in delete-account, never a path or an id', () => {
    const logs = deleteSource.match(/console\.error\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l).not.toMatch(/user\.id|paths|names|queued/);
  });
});
