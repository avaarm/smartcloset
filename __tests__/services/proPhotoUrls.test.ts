const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: (...a: any[]) => mockGetSession(...a) } },
}));
// Read when used, not when the mock is built (imports run before this file's own constants).
const mockEnv = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
jest.mock('../../src/config/env', () => ({
  env: {
    get SUPABASE_URL() { return mockEnv.SUPABASE_URL; },
    get SUPABASE_ANON_KEY() { return mockEnv.SUPABASE_ANON_KEY; },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearProPhotoCache, proPhotoSource, PRO_PHOTO_FUNCTION } from '../../src/services/proPhotoUrls';
import { PRO_PHOTO_TTL_SECONDS } from '../../src/config/proRules';

const CONN = '3f2a6c1e-8b1d-4c53-9e0a-1d2f3a4b5c6d';
const ITEM = '9b7e5d21-0c4a-4f68-8a31-6e2d1c0b9a87';

const session = (token: string | null) => mockGetSession.mockResolvedValue({ data: { session: token ? { access_token: token, user: { id: 'me' } } : null } });

beforeEach(() => {
  jest.useRealTimers();
  mockGetSession.mockReset();
  mockEnv.SUPABASE_URL = 'https://proj.supabase.co';
  mockEnv.SUPABASE_ANON_KEY = 'anon-key';
  clearProPhotoCache();
  (AsyncStorage.setItem as jest.Mock).mockClear?.();
  session('token-1');
});

describe('proPhotoSource', () => {
  it('builds the request for the pro-photo function: the address, the two ids and the person’s own token', async () => {
    expect(await proPhotoSource(CONN, ITEM)).toEqual({
      uri: `https://proj.supabase.co/functions/v1/pro-photo?c=${CONN}&i=${ITEM}`,
      headers: { Authorization: 'Bearer token-1', apikey: 'anon-key' },
    });
    expect(PRO_PHOTO_FUNCTION).toBe('pro-photo');
  });

  it('copes with a trailing slash on the project address', async () => {
    mockEnv.SUPABASE_URL = 'https://proj.supabase.co//';
    expect((await proPhotoSource(CONN, ITEM))?.uri).toBe(`https://proj.supabase.co/functions/v1/pro-photo?c=${CONN}&i=${ITEM}`);
  });

  it('is null for a guest, and for a session read that fails', async () => {
    session(null);
    expect(await proPhotoSource(CONN, ITEM)).toBeNull();
    mockGetSession.mockRejectedValue(new Error('storage unavailable'));
    expect(await proPhotoSource(CONN, ITEM)).toBeNull();
  });

  it('is null for an id that is not a uuid, without asking for the session (the function answers a bare 404 to those)', async () => {
    for (const [c, i] of [['x', ITEM], [CONN, 'x'], ['', ''], [`${CONN}&i=other`, ITEM], [CONN, `${ITEM}/../..`], [`${CONN}`, `${ITEM}\n`]]) {
      expect(await proPhotoSource(c, i)).toBeNull();
    }
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('is null when this build has no server address', async () => {
    mockEnv.SUPABASE_URL = '';
    expect(await proPhotoSource(CONN, ITEM)).toBeNull();
  });

  it('carries no storage path, no account id and no signed link', async () => {
    const s = (await proPhotoSource(CONN, ITEM))!;
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/wardrobe-images|storage\/v1|\/object\/|createSignedUrl|[?&]token=/);
    // Nothing in the address but the function, the connection and the piece.
    expect(s.uri.replace(/^https:\/\/proj\.supabase\.co\/functions\/v1\/pro-photo\?c=[0-9a-f-]{36}&i=[0-9a-f-]{36}$/, '')).toBe('');
  });

  it('writes nothing to the device', async () => {
    await proPhotoSource(CONN, ITEM);
    await proPhotoSource(CONN, ITEM);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
  });

  it('hands an image view the same source again for the same piece, so a re-render does not refetch', async () => {
    const a = await proPhotoSource(CONN, ITEM);
    const b = await proPhotoSource(CONN, ITEM);
    expect(b).toBe(a);
    expect(await proPhotoSource(CONN, CONN)).not.toBe(a);
  });

  it('builds a new request when the token changes, and when the memo has aged out', async () => {
    const a = await proPhotoSource(CONN, ITEM);
    session('token-2');
    const b = await proPhotoSource(CONN, ITEM);
    expect(b).not.toBe(a);
    expect(b?.headers.Authorization).toBe('Bearer token-2');

    jest.useFakeTimers({ now: new Date('2026-10-23T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    clearProPhotoCache();
    const c = await proPhotoSource(CONN, ITEM);
    jest.setSystemTime(new Date('2026-10-23T10:00:00Z').getTime() + (PRO_PHOTO_TTL_SECONDS - 1) * 1000);
    expect(await proPhotoSource(CONN, ITEM)).toBe(c);
    jest.setSystemTime(new Date('2026-10-23T10:00:00Z').getTime() + (PRO_PHOTO_TTL_SECONDS + 1) * 1000);
    expect(await proPhotoSource(CONN, ITEM)).not.toBe(c);
  });

  it('forgets everything on sign-out', async () => {
    const a = await proPhotoSource(CONN, ITEM);
    clearProPhotoCache();
    expect(await proPhotoSource(CONN, ITEM)).not.toBe(a);
    session(null);
    expect(await proPhotoSource(CONN, ITEM)).toBeNull();
  });

  it('keeps the memo small', async () => {
    const first = await proPhotoSource(CONN, ITEM);
    for (let n = 0; n < 600; n++) {
      const id = `00000000-0000-4000-8000-${`${n}`.padStart(12, '0')}`;
      await proPhotoSource(CONN, id);
    }
    expect(await proPhotoSource(CONN, ITEM)).not.toBe(first);   // the oldest entry was dropped
  });
});

describe('importing the module', () => {
  it('reads no session and touches no storage', () => {
    mockGetSession.mockClear();
    jest.isolateModules(() => {
      require('../../src/services/proPhotoUrls');
    });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
});
