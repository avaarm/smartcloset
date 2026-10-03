const calls: { eq: any[][]; insert: any[]; update: any[]; updateEq: any[][] } = { eq: [], insert: [], update: [], updateEq: [] };
let rows: any[] = [];
const mockCreateSignedUrls = jest.fn();

const chain: any = {};
chain.select = () => chain;
chain.eq = (...a: any[]) => { calls.eq.push(a); return chain; };
chain.order = () => chain;
chain.range = async () => ({ data: rows, error: null });
chain.insert = async (p: any) => { calls.insert.push(p); return { error: null }; };
chain.update = (p: any) => { calls.update.push(p); return { eq: async (...a: any[]) => { calls.updateEq.push(a); return { error: null }; } }; };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => chain,
    storage: { from: () => ({ createSignedUrls: (...a: any[]) => mockCreateSignedUrls(...a) }) },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { getClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { clearSignedImageCache } from '../../src/services/imageUrls';

const HOST = 'https://abc.supabase.co';
const CANON = `${HOST}/storage/v1/object/public/wardrobe-images/me/1.jpg`;
const SIGNED = `${HOST}/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=abc`;

const baseItem: any = { id: 'x', name: 'Tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false };

beforeEach(async () => {
  calls.eq = []; calls.insert = []; calls.update = []; calls.updateEq = [];
  rows = [];
  mockCreateSignedUrls.mockReset().mockImplementation(async (paths: string[]) => ({
    data: paths.map(p => ({ path: p, signedUrl: `${HOST}/storage/v1/object/sign/wardrobe-images/${p}?token=fresh`, error: null })),
    error: null,
  }));
  await clearSignedImageCache();
});

describe('getClothingItems', () => {
  it('only ever asks for the signed-in user\'s own rows (friends\' rows are visible to RLS but must never be listed)', async () => {
    await getClothingItems();
    expect(calls.eq).toContainEqual(['user_id', 'me']);
    calls.eq = [];
    await getClothingItems({ all: true });
    expect(calls.eq).toContainEqual(['user_id', 'me']);
  });

  it('returns photos as fresh signed links', async () => {
    rows = [{ id: 'a', name: 'Tee', category: 'tops', color: 'red', user_image: CANON, created_at: '2026-01-01' }];
    const [it] = await getClothingItems();
    expect(it.userImage).toContain('/object/sign/wardrobe-images/me/1.jpg?token=fresh');
  });

  it('leaves external and local image URLs alone and does not call the signer for them', async () => {
    rows = [{ id: 'a', name: 'Tee', category: 'tops', color: 'red', retailer_image: 'https://shop.example/a.jpg', user_image: 'file:///x.jpg', created_at: '2026-01-01' }];
    const [it] = await getClothingItems();
    expect(it.retailerImage).toBe('https://shop.example/a.jpg');
    expect(it.userImage).toBe('file:///x.jpg');
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });
});

describe('writing items never stores an expiring signed link', () => {
  it('saveClothingItem converts a signed link back to the stable stored form', async () => {
    await saveClothingItem({ ...baseItem, userImage: SIGNED, retailerImage: 'https://shop.example/a.jpg' });
    expect(calls.insert[0].user_image).toBe(CANON);
    expect(calls.insert[0].retailer_image).toBe('https://shop.example/a.jpg');
    expect(calls.insert[0].user_id).toBe('me');
  });

  it('updateClothingItem converts a signed link back too (edit flow passes back what it loaded)', async () => {
    await updateClothingItem({ ...baseItem, userImage: SIGNED });
    expect(calls.update[0].user_image).toBe(CANON);
    expect(calls.updateEq[0]).toEqual(['id', 'x']);
  });

  it('a load -> edit -> save round trip stores exactly what was stored before', async () => {
    rows = [{ id: 'a', name: 'Tee', category: 'tops', color: 'red', user_image: CANON, created_at: '2026-01-01' }];
    const [loaded] = await getClothingItems();
    expect(loaded.userImage).not.toBe(CANON); // displayed signed
    await updateClothingItem({ ...loaded, name: 'Renamed' });
    expect(calls.update[0].user_image).toBe(CANON); // stored canonical
  });
});
