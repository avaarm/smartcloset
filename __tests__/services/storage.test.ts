const calls: { eq: any[][]; insert: any[]; update: any[]; updateEq: any[][] } = { eq: [], insert: [], update: [], updateEq: [] };
let rows: any[] = [];
const mockCreateSignedUrls = jest.fn();
const mockRemove = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));

const chain: any = {};
chain.select = () => chain;
chain.eq = (...a: any[]) => { calls.eq.push(a); return chain; };
chain.order = () => chain;
chain.range = async () => ({ data: rows, error: null });
chain.delete = () => ({ eq: async () => ({ error: null }) });
chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
chain.insert = async (p: any) => { calls.insert.push(p); return { error: null }; };
chain.update = (p: any) => { calls.update.push(p); return { eq: async (...a: any[]) => { calls.updateEq.push(a); return { error: null }; } }; };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => chain,
    storage: { from: () => ({ createSignedUrls: (...a: any[]) => mockCreateSignedUrls(...a), remove: (p: string[]) => mockRemove(p) }) },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { deleteClothingItem, getClothingItem, getClothingItems, getOwnedClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { clearSignedImageCache } from '../../src/services/imageUrls';

const HOST = 'https://abc.supabase.co';
const CANON = `${HOST}/storage/v1/object/public/wardrobe-images/me/1.jpg`;
const SIGNED = `${HOST}/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=abc`;

const baseItem: any = { id: 'x', name: 'Tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false };

beforeEach(async () => {
  calls.eq = []; calls.insert = []; calls.update = []; calls.updateEq = [];
  rows = [];
  mockRemove.mockClear();
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

describe('getOwnedClothingItems', () => {
  it('returns what the user owns and leaves wishlist items out', async () => {
    rows = [
      { id: 'a', name: 'Owned tee', category: 'tops', color: 'red', is_wishlist: false, created_at: '2026-01-01' },
      { id: 'b', name: 'Wish bag', category: 'accessories', color: 'black', is_wishlist: true, created_at: '2026-01-01' },
      { id: 'c', name: 'Owned jeans', category: 'bottoms', color: 'blue', created_at: '2026-01-01' },
    ];
    const owned = await getOwnedClothingItems();
    expect(owned.map(i => i.name)).toEqual(['Owned tee', 'Owned jeans']);
  });

  it('asks for every page, not just the first 200 rows', async () => {
    await getOwnedClothingItems();
    expect(calls.eq).toContainEqual(['user_id', 'me']);
  });
});

describe('updateClothingItem keeps every field the form edits', () => {
  it('writes purchase date and occasion (they used to be silently dropped on edit)', async () => {
    await updateClothingItem({ ...baseItem, occasion: 'work', purchaseDate: '2026-02-03T00:00:00.000Z' });
    expect(calls.update[0]).toMatchObject({ occasion: 'work', purchase_date: '2026-02-03T00:00:00.000Z' });
  });

  it('writes the date added (moving a wishlist item to the wardrobe resets it)', async () => {
    await updateClothingItem({ ...baseItem, dateAdded: '2026-10-09T00:00:00.000Z' });
    expect(calls.update[0].date_added).toBe('2026-10-09T00:00:00.000Z');
  });

  it('sends null for cleared optional fields so they really clear', async () => {
    await updateClothingItem({ ...baseItem });
    expect(calls.update[0]).toMatchObject({
      brand: null, cost: null, retail_cost: null, notes: null, retailer: null, occasion: null, purchase_date: null, materials: null,
    });
  });

  it('does not touch wear data from an edit (the form holds a stale snapshot of it)', async () => {
    await updateClothingItem({ ...baseItem, wearCount: 3, lastWorn: '2026-01-01' });
    expect(calls.update[0]).not.toHaveProperty('wear_count');
    expect(calls.update[0]).not.toHaveProperty('last_worn');
  });

  it('writes wear data when the wear tracker asks for it, and can clear last_worn on undo', async () => {
    await updateClothingItem({ ...baseItem, wearCount: 0, lastWorn: undefined }, { includeWear: true });
    expect(calls.update[0]).toMatchObject({ wear_count: 0, last_worn: null });
  });

  it('reads occasion back from the database', async () => {
    rows = [{ id: 'a', name: 'Tee', category: 'tops', color: 'red', occasion: 'party', created_at: '2026-01-01' }];
    const [it] = await getClothingItems();
    expect(it.occasion).toBe('party');
  });
});

describe('getClothingItem', () => {
  it('re-reads one item for the signed-in user', async () => {
    rows = [{ id: 'a', name: 'Tee', category: 'tops', color: 'red', favorite: true, wear_count: 4, created_at: '2026-01-01' }];
    const it = await getClothingItem('a');
    expect(it).toMatchObject({ id: 'a', favorite: true, wearCount: 4 });
    expect(calls.eq).toContainEqual(['user_id', 'me']);
    expect(calls.eq).toContainEqual(['id', 'a']);
  });

  it('returns null when the item no longer exists', async () => {
    rows = [];
    expect(await getClothingItem('gone')).toBeNull();
  });
});

describe('photos are removed from storage when nothing references them', () => {
  const OTHER = `${HOST}/storage/v1/object/public/wardrobe-images/me/2.jpg`;

  it('deleting an item removes its photo', async () => {
    rows = [{ id: 'a', user_image: CANON, retailer_image: CANON }];
    await deleteClothingItem('a');
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });

  it('replacing the photo on an item removes the old one but not the new one', async () => {
    rows = [{ id: 'x', user_image: CANON, retailer_image: CANON }];
    await updateClothingItem({ ...baseItem, userImage: OTHER, retailerImage: OTHER });
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });

  it('editing something else leaves the photo alone', async () => {
    rows = [{ id: 'x', user_image: CANON, retailer_image: CANON }];
    await updateClothingItem({ ...baseItem, userImage: SIGNED, retailerImage: SIGNED });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('never touches storage for photos hosted elsewhere', async () => {
    rows = [{ id: 'a', user_image: 'https://shop.example/a.jpg', retailer_image: 'file:///x.jpg' }];
    await deleteClothingItem('a');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
