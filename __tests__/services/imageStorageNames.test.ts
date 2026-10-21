/**
 * Several photos of one item are copied and uploaded together, so two can start in the same millisecond. Each
 * must still get a name of its own (the bucket refuses a name that exists), and the name must stay one the
 * swap code accepts for a closet photo (letters, digits, dot, underscore, hyphen under the owner's folder).
 */
const uploads: string[] = [];
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    storage: {
      from: () => ({
        upload: async (name: string) => { uploads.push(name); return { error: null }; },
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map(p => ({ path: p, signedUrl: `https://abc.supabase.co/storage/v1/object/sign/wardrobe-images/${p}?token=t`, error: null })),
          error: null,
        }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/wardrobe-images/${p}` } }),
      }),
    },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import RNFS from 'react-native-fs';
import { copyImageToPermanentStorage } from '../../src/services/imageStorage';
import { storagePathFromUrl } from '../../src/services/imageUrls';

beforeEach(() => {
  uploads.length = 0;
  jest.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
});
afterEach(() => jest.restoreAllMocks());

describe('copyImageToPermanentStorage names', () => {
  it('gives photos copied in the same millisecond different files in the bucket and on the phone', async () => {
    const urls = await Promise.all(
      ['file:///var/tmp/a.jpg', 'file:///var/tmp/b.jpg', 'file:///var/tmp/c.jpg'].map(u => copyImageToPermanentStorage(u)),
    );
    expect(new Set(uploads).size).toBe(3);
    expect(new Set(urls).size).toBe(3);
    const written = (RNFS.writeFile as jest.Mock).mock.calls.map(c => c[0]);
    expect(new Set(written).size).toBe(written.length);
  });

  it('keeps names the swap code accepts, under the owner folder', async () => {
    await copyImageToPermanentStorage('file:///var/tmp/a.jpg');
    expect(uploads[0]).toMatch(/^me\/[A-Za-z0-9._-]+\.jpg$/);
    expect(storagePathFromUrl(`https://abc.supabase.co/storage/v1/object/public/wardrobe-images/${uploads[0]}`)).toBe(uploads[0]);
  });
});
