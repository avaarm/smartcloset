/**
 * Wishlist and wardrobe kept apart, proved with rows shaped like the ones in the
 * owner's database (numeric columns as strings, blank retailer, a legacy NULL
 * flag) and with items saved the way the wishlist search saves them on a guest's
 * phone. Storage is real end to end; only Supabase's transport is stubbed.
 */
import 'react-native';
import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import WishlistScreen from '../../src/screens/WishlistScreen';
import {
  getClothingItems,
  getOwnedClothingItems,
  getWishlistClothingItems,
  mapDbToClothingItem,
  saveClothingItem,
} from '../../src/services/storage';
import { wishlistTotals } from '../../src/services/wishlistBudget';

let mockSession: { user: { id: string } } | null = null;
let mockRows: any[] = [];

const mockChain: any = {};
mockChain.select = () => mockChain;
mockChain.eq = () => mockChain;
mockChain.order = () => mockChain;
mockChain.range = async () => ({ data: mockRows, error: null });
mockChain.maybeSingle = async () => ({ data: null, error: null });
// Applies the update to the stored row, as the database would.
mockChain.update = (payload: any) => ({
  eq: async (_column: string, id: string) => {
    mockRows = mockRows.map(r => (r.id === id ? { ...r, ...payload } : r));
    return { error: null };
  },
});

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession }, error: null }) },
    from: () => mockChain,
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: [], error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  },
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/screens/WishlistSearchModal', () => () => null);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
}));

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WishlistScreen />);
  });
  return tree;
};
const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

// A clothing_items row as the database returns it: every column present, numerics
// as strings, nothing the app did not write left out.
let rowNumber = 0;
const dbRow = (extra: Record<string, any>) => ({
  id: `00000000-0000-4000-8000-${String(++rowNumber).padStart(12, '0')}`,
  user_id: 'me',
  name: 'Item',
  category: 'tops',
  brand: null,
  color: '',
  season: [],
  occasion: null,
  cost: null,
  retail_cost: null,
  purchase_date: null,
  notes: null,
  tags: [],
  favorite: false,
  is_wishlist: false,
  retailer: null,
  user_image: null,
  retailer_image: null,
  wear_count: 0,
  last_worn: null,
  materials: null,
  date_added: '2026-10-01T12:00:00+00:00',
  created_at: '2026-10-01T12:00:00+00:00',
  updated_at: '2026-10-01T12:00:00+00:00',
  ...extra,
});

const seedRows = () => [
  // The owner's wishlist: a priced boot with a blank retailer, and a bag saved from a shop's site.
  dbRow({ name: 'Bottega Veneta Cassette Boots', category: 'shoes', is_wishlist: true, cost: '862.00', retailer: '' }),
  dbRow({ name: 'Padded Cassette Bag', category: 'bags', is_wishlist: true, retailer: 'bottegaveneta.com' }),
  dbRow({ name: 'Wool Trousers', category: 'bottoms', is_wishlist: true, retail_cost: '240.00' }),
  // Owned: one with a similar name to a wish, one from before the flag had a default, one free.
  dbRow({ name: 'Brown Knee-High Boots', category: 'shoes', is_wishlist: false, cost: '120.00' }),
  dbRow({ name: 'White Tee', is_wishlist: null, cost: '25.00' }),
  dbRow({ name: 'Linen Shirt', is_wishlist: false, cost: '0.00' }),
];

const WISH_NAMES = ['Bottega Veneta Cassette Boots', 'Padded Cassette Bag', 'Wool Trousers'];
const OWNED_NAMES = ['Brown Knee-High Boots', 'White Tee', 'Linen Shirt'];

beforeEach(async () => {
  await AsyncStorage.clear();
  // Marks the guest store as set up, so the demo wardrobe is not seeded on top.
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true');
  mockSession = null;
  mockRows = [];
  rowNumber = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('database rows as the app reads them', () => {
  it('keeps the wishlist flag, the numeric price and the blank retailer', () => {
    const [boots, bag, trousers, ownedBoots, tee, shirt] = seedRows().map(mapDbToClothingItem);
    expect(boots).toMatchObject({ isWishlist: true, category: 'shoes', cost: 862, retailer: '' });
    expect(bag).toMatchObject({ isWishlist: true, retailer: 'bottegaveneta.com', cost: undefined });
    expect(trousers).toMatchObject({ isWishlist: true, cost: undefined, retailCost: 240 });
    expect(ownedBoots).toMatchObject({ isWishlist: false, cost: 120 });
    expect(tee.isWishlist).toBe(false); // NULL in the table reads as owned
    expect(shirt).toMatchObject({ isWishlist: false, cost: 0 });
  });

  it('puts every row in exactly one of the owned and wishlist lists, signed in', async () => {
    mockSession = { user: { id: 'me' } };
    mockRows = seedRows();

    const owned = await getOwnedClothingItems();
    const wishlist = await getWishlistClothingItems();

    expect(owned.map(i => i.name)).toEqual(OWNED_NAMES);
    expect(wishlist.map(i => i.name)).toEqual(WISH_NAMES);
    expect(owned.some(i => i.isWishlist)).toBe(false);
    expect(wishlist.every(i => i.isWishlist)).toBe(true);
    const everything = await getClothingItems({ all: true });
    expect([...owned, ...wishlist].map(i => i.id).sort()).toEqual(everything.map(i => i.id).sort());
    expect(owned.filter(o => wishlist.some(w => w.id === o.id))).toEqual([]);
  });

  it('the wishlist total adds the wishlist prices only, never an owned item', async () => {
    mockSession = { user: { id: 'me' } };
    mockRows = seedRows();
    const wishlist = await getWishlistClothingItems();
    // 862 listed + 240 retail-only + the bag with no price; the owned 120 + 25 stay out.
    expect(wishlistTotals(wishlist)).toEqual({ total: 1102, unpriced: 1 });
  });
});

describe('the Wishlist screen on those rows, signed in', () => {
  beforeEach(() => {
    mockSession = { user: { id: 'me' } };
    mockRows = seedRows();
  });

  it('lists the three wishes, none of the owned pieces, and totals only the wishes', async () => {
    const t = text(await mount());
    for (const name of WISH_NAMES) expect(t).toContain(name);
    for (const name of OWNED_NAMES) expect(t).not.toContain(name);
    expect(t).toMatch(/Wishlist total\s+\$1,102\s+1 without a price/);
    expect(t).toContain('3 items');
  });

  it('moving a wish to the wardrobe takes it off the wishlist and out of the total, and into the owned list', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount();

    await act(async () => pressable(tree, 'Move Bottega Veneta Cassette Boots to your wardrobe').props.onPress());
    const confirm = (alert.mock.calls[0][2] as any[]).find(b => b.text === 'Move');
    await act(async () => {
      await confirm.onPress();
    });

    const t = text(tree);
    expect(t).not.toContain('Bottega Veneta Cassette Boots');
    expect(t).toMatch(/Wishlist total\s+\$240\s+1 without a price/);
    expect(t).toContain('2 items');
    expect((await getOwnedClothingItems()).map(i => i.name)).toContain('Bottega Veneta Cassette Boots');
    expect((await getWishlistClothingItems()).map(i => i.name)).not.toContain('Bottega Veneta Cassette Boots');
  });
});

describe('a guest: the on-device store', () => {
  // The payload the wishlist search saves for a result (WishlistSearchModal), and an owned piece.
  const searchResult = (extra: Record<string, any> = {}) =>
    ({
      id: 'wish_1760000000000_ab12cd',
      name: 'Cassette Padded Boots',
      category: 'shoes',
      retailerImage: 'https://cdn.example.com/boots.jpg',
      color: '',
      season: [],
      brand: 'Bottega Veneta',
      retailer: 'bottegaveneta.com',
      dateAdded: '2026-10-09T10:00:00.000Z',
      isWishlist: true,
      wearCount: 0,
      cost: 862,
      notes: 'Found via search. Source: https://www.bottegaveneta.com/p/1',
      tags: [],
      favorite: false,
      ...extra,
    }) as any;
  const owned = (extra: Record<string, any> = {}) =>
    ({
      ...searchResult(),
      id: 'ignored',
      name: 'Brown Knee-High Boots',
      brand: '',
      retailer: '',
      isWishlist: false,
      cost: 120,
      notes: undefined,
      ...extra,
    }) as any;

  // saveLocalItem stamps the id from the clock, so give each save its own tick.
  const save = async (item: any, clock: number) => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(clock);
    await saveClothingItem(item);
  };

  it('keeps a searched wish out of the owned list, and the owned piece out of the wishlist', async () => {
    await save(owned(), 1111);
    await save(searchResult(), 2222);
    await save(searchResult({ name: 'Padded Tote', category: 'bags', cost: undefined, retailer: '' }), 3333);

    const ownedList = await getOwnedClothingItems();
    const wishList = await getWishlistClothingItems();
    expect(ownedList.map(i => i.name)).toEqual(['Brown Knee-High Boots']);
    expect(wishList.map(i => i.name)).toEqual(['Cassette Padded Boots', 'Padded Tote']);
    expect(ownedList.some(i => i.isWishlist)).toBe(false);
  });

  it('the screen shows the wishes and totals only their prices', async () => {
    await save(owned(), 1111);
    await save(searchResult(), 2222);
    await save(searchResult({ name: 'Padded Tote', category: 'bags', cost: undefined, retailer: '' }), 3333);

    const t = text(await mount());
    expect(t).toContain('Cassette Padded Boots');
    expect(t).toContain('Padded Tote');
    expect(t).not.toContain('Brown Knee-High Boots');
    expect(t).toMatch(/Wishlist total\s+\$862\s+1 without a price/); // not 982: the owned 120 is not in it
  });

  it('with only owned items the wishlist is empty and totals $0', async () => {
    await save(owned(), 1111);
    const t = text(await mount());
    expect(t).toContain('Your wishlist is empty');
    expect(t).toMatch(/Wishlist total\s+\$0/);
    expect(t).not.toContain('Brown Knee-High Boots');
  });
});
