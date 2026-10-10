/** Owned vs wishlist for a signed-in user: the same split as the guest store, from cloud rows. */
const calls: { insert: any[]; update: any[] } = { insert: [], update: [] };
let rows: any[] = [];

const chain: any = {};
chain.select = () => chain;
chain.eq = () => chain;
chain.order = () => chain;
chain.range = async () => ({ data: rows, error: null });
chain.maybeSingle = async () => ({ data: null, error: null });
chain.insert = async (p: any) => { calls.insert.push(p); return { error: null }; };
chain.update = (p: any) => { calls.update.push(p); return { eq: async () => ({ error: null }) }; };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => chain,
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
  },
}));

import {
  getOwnedClothingItems,
  getWishlistClothingItems,
  saveClothingItem,
  updateClothingItem,
} from '../../src/services/storage';

const row = (id: string, is_wishlist: boolean | null) => ({
  id, name: id, category: 'tops', color: 'red', is_wishlist, created_at: '2026-01-01',
});
const item: any = { id: 'x', name: 'Tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01' };

beforeEach(() => {
  calls.insert = [];
  calls.update = [];
  // `null` is a row written before the column had its default.
  rows = [row('o1', false), row('w1', true), row('legacy', null), row('w2', true)];
});

describe('signed-in owned and wishlist views', () => {
  it('splits the same rows into complementary lists', async () => {
    expect((await getOwnedClothingItems()).map(i => i.id)).toEqual(['o1', 'legacy']);
    expect((await getWishlistClothingItems()).map(i => i.id)).toEqual(['w1', 'w2']);
  });

  it('saves a wishlist item with the flag set, and an owned item with it cleared', async () => {
    await saveClothingItem({ ...item, isWishlist: true });
    await saveClothingItem({ ...item, isWishlist: false });
    await saveClothingItem(item); // flag absent: owned, never wishlist by accident
    expect(calls.insert.map(p => p.is_wishlist)).toEqual([true, false, false]);
  });

  it('moving to the wardrobe is an update of the same row that clears the flag', async () => {
    await updateClothingItem({ ...item, isWishlist: false });
    expect(calls.update[0].is_wishlist).toBe(false);
    expect(calls.insert).toHaveLength(0);
  });
});
