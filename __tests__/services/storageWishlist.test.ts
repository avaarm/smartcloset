/**
 * Owned vs wishlist in the guest (on-device) store: one list can never hold an
 * item in both views, or in neither, and moving an item between them changes the
 * flag and nothing else.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getClothingItems,
  getOwnedClothingItems,
  getWishlistClothingItems,
  saveClothingItem,
  updateClothingItem,
} from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

const item = (extra: Partial<ClothingItem>): ClothingItem => ({
  id: 'x',
  name: 'x',
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

const seed = async (items: any[]) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true'); // no demo wardrobe on top
  await AsyncStorage.setItem('@smartcloset_items', JSON.stringify(items));
};
const ids = (items: ClothingItem[]) => items.map(i => i.id);

afterEach(() => jest.restoreAllMocks());

describe('guest store: owned and wishlist views', () => {
  // `legacy` was saved before the flag existed; `odd` carries a stray truthy value.
  const legacy: any = item({ id: 'legacy' });
  delete legacy.isWishlist;
  const mixed: any[] = [
    item({ id: 'o1' }),
    item({ id: 'w1', isWishlist: true }),
    legacy,
    item({ id: 'odd', isWishlist: 1 as any }),
    item({ id: 'w2', isWishlist: true }),
  ];

  beforeEach(() => seed(mixed));

  it('splits a mixed list: every item lands in exactly one view', async () => {
    const owned = ids(await getOwnedClothingItems());
    const wishlist = ids(await getWishlistClothingItems());
    expect(owned).toEqual(['o1', 'legacy']);
    expect(wishlist).toEqual(['w1', 'odd', 'w2']);
    expect([...owned, ...wishlist].sort()).toEqual(ids(await getClothingItems({ all: true })).sort());
  });

  it('a saved wishlist item is wishlist-only; a saved owned item is owned-only', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1111).mockReturnValueOnce(2222);
    await saveClothingItem(item({ name: 'Wished Bag', isWishlist: true }));
    await saveClothingItem(item({ name: 'Bought Bag' }));

    expect((await getWishlistClothingItems()).map(i => i.name)).toContain('Wished Bag');
    expect((await getWishlistClothingItems()).map(i => i.name)).not.toContain('Bought Bag');
    expect((await getOwnedClothingItems()).map(i => i.name)).toContain('Bought Bag');
    expect((await getOwnedClothingItems()).map(i => i.name)).not.toContain('Wished Bag');
  });

  it('moving a wishlist item to the wardrobe changes only its flag, in place', async () => {
    const [before] = (await getWishlistClothingItems()).filter(i => i.id === 'w1');
    const withHistory = { ...before, wearCount: 4, lastWorn: '2026-05-05T00:00:00Z' };
    await seed(mixed.map(i => (i.id === 'w1' ? withHistory : i)));

    await updateClothingItem({ ...withHistory, isWishlist: false });

    const all = await getClothingItems({ all: true });
    expect(ids(all)).toEqual(ids(mixed)); // nothing added, removed or reordered
    expect(all.find(i => i.id === 'w1')).toEqual({ ...withHistory, isWishlist: false });
    expect(ids(await getWishlistClothingItems())).toEqual(['odd', 'w2']);
    expect(ids(await getOwnedClothingItems())).toEqual(['o1', 'w1', 'legacy']);
  });
});
