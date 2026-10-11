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

// Each wish is priced differently, as a wishlist really is. Used is the cost column (resale),
// New is the retail_cost column (full retail).
//   Cassette Boots  Used 862 only        Padded Bag  no price       Wool Trousers  New 240 only
//   Intrecciato Tote  New 4,000 and Used 3,000
const seedRows = () => [
  // The owner's wishlist: a boot with a Used price and a blank retailer, a bag saved from a shop's site
  // with no price yet, trousers with only a New price, and a tote priced both ways.
  dbRow({ name: 'Bottega Veneta Cassette Boots', category: 'shoes', is_wishlist: true, cost: '862.00', retailer: '' }),
  dbRow({ name: 'Padded Cassette Bag', category: 'bags', is_wishlist: true, retailer: 'bottegaveneta.com' }),
  dbRow({ name: 'Wool Trousers', category: 'bottoms', is_wishlist: true, retail_cost: '240.00' }),
  dbRow({ name: 'Intrecciato Tote', category: 'bags', is_wishlist: true, cost: '3000.00', retail_cost: '4000.00' }),
  // Owned: one with a similar name to a wish (and a retail price of its own), one from before the
  // flag had a default, one free. None of their prices may reach either wishlist total.
  dbRow({ name: 'Brown Knee-High Boots', category: 'shoes', is_wishlist: false, cost: '120.00', retail_cost: '300.00' }),
  dbRow({ name: 'White Tee', is_wishlist: null, cost: '25.00' }),
  dbRow({ name: 'Linen Shirt', is_wishlist: false, cost: '0.00' }),
];

const WISH_NAMES = ['Bottega Veneta Cassette Boots', 'Padded Cassette Bag', 'Wool Trousers', 'Intrecciato Tote'];
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
  it('keeps the wishlist flag, both numeric prices (cost = Used, retail_cost = New) and the blank retailer', () => {
    const [boots, bag, trousers, tote, ownedBoots, tee, shirt] = seedRows().map(mapDbToClothingItem);
    expect(boots).toMatchObject({ isWishlist: true, category: 'shoes', cost: 862, retailCost: undefined, retailer: '' });
    expect(bag).toMatchObject({ isWishlist: true, retailer: 'bottegaveneta.com', cost: undefined, retailCost: undefined });
    expect(trousers).toMatchObject({ isWishlist: true, cost: undefined, retailCost: 240 });
    expect(tote).toMatchObject({ isWishlist: true, cost: 3000, retailCost: 4000 });
    expect(ownedBoots).toMatchObject({ isWishlist: false, cost: 120, retailCost: 300 });
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

  it('the wishlist totals add the wishlist prices only, never an owned item', async () => {
    mockSession = { user: { id: 'me' } };
    mockRows = seedRows();
    const wishlist = await getWishlistClothingItems();
    // New: 240 (trousers) + 4,000 (tote) = 4,240. The boots and the bag have no New price.
    // Used: 862 (boots) + 3,000 (tote) = 3,862. The bag and the trousers have no Used price.
    // The owned 120 (retail 300) and 25 stay out of both.
    expect(wishlistTotals(wishlist)).toEqual({
      newTotal: 4240,
      usedTotal: 3862,
      withoutNew: 2,
      withoutUsed: 2,
      unpriced: 1,
    });
  });
});

describe('the Wishlist screen on those rows, signed in', () => {
  beforeEach(() => {
    mockSession = { user: { id: 'me' } };
    mockRows = seedRows();
  });

  it('lists the four wishes, none of the owned pieces, and totals only the wishes, New and Used', async () => {
    const t = text(await mount());
    for (const name of WISH_NAMES) expect(t).toContain(name);
    for (const name of OWNED_NAMES) expect(t).not.toContain(name);
    expect(t).toMatch(/New total\s+\$4,240\s+2 without a new price/);
    expect(t).toMatch(/Used total\s+\$3,862\s+2 without a used price/);
    // Not the totals with the owned prices leaked in: 4,240 + 300 retail, 3,862 + 120 + 25 paid.
    expect(t).not.toContain('$4,540');
    expect(t).not.toContain('$4,007');
    expect(t).not.toContain('$3,982');
    expect(t).toContain('4 items');
  });

  it('draws each card\'s price line from its own two columns', async () => {
    const tree = await mount();
    expect(pressable(tree, 'Edit prices of Bottega Veneta Cassette Boots: Used $862')).toBeDefined();
    expect(pressable(tree, 'Add prices for Padded Cassette Bag')).toBeDefined();
    expect(pressable(tree, 'Edit prices of Wool Trousers: New $240')).toBeDefined();
    expect(pressable(tree, 'Edit prices of Intrecciato Tote: New $4,000  ·  Used $3,000')).toBeDefined();
  });

  it('shows the budget row and no comparison of it with the totals', async () => {
    await AsyncStorage.setItem('@smartcloset_wishlist_budget:u:me', '3000');
    const tree = await mount();
    const t = text(tree);
    expect(t).toMatch(/Budget\s+\$3,000/);
    expect(t).not.toMatch(/under budget|over budget|on budget/i);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(t).toMatch(/New total\s+\$4,240/); // well past the budget, and shown as it is
  });

  const moveToWardrobe = async (tree: renderer.ReactTestRenderer, name: string) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await act(async () => pressable(tree, `Move ${name} to your wardrobe`).props.onPress());
    const confirm = (alert.mock.calls[alert.mock.calls.length - 1][2] as any[]).find(b => b.text === 'Move');
    await act(async () => {
      await confirm.onPress();
    });
  };

  it('moving a wish with only a Used price to the wardrobe takes it out of the Used total alone', async () => {
    const tree = await mount();
    await moveToWardrobe(tree, 'Bottega Veneta Cassette Boots');

    const t = text(tree);
    expect(t).not.toContain('Bottega Veneta Cassette Boots');
    // New is untouched (the boots had no New price, so one fewer item lacks it); Used drops by 862.
    expect(t).toMatch(/New total\s+\$4,240\s+1 without a new price/);
    expect(t).toMatch(/Used total\s+\$3,000\s+2 without a used price/);
    expect(t).toContain('3 items');
    expect((await getOwnedClothingItems()).map(i => i.name)).toContain('Bottega Veneta Cassette Boots');
    expect((await getWishlistClothingItems()).map(i => i.name)).not.toContain('Bottega Veneta Cassette Boots');
  });

  it('moving a wish priced both ways takes it out of both totals, and keeps both prices on the owned item', async () => {
    const tree = await mount();
    await moveToWardrobe(tree, 'Intrecciato Tote');

    const t = text(tree);
    expect(t).not.toContain('Intrecciato Tote');
    expect(t).toMatch(/New total\s+\$240\s+2 without a new price/);
    expect(t).toMatch(/Used total\s+\$862\s+2 without a used price/);
    const owned = (await getOwnedClothingItems()).find(i => i.name === 'Intrecciato Tote');
    expect(owned).toMatchObject({ isWishlist: false, cost: 3000, retailCost: 4000 });
  });

  it('moving every wish out leaves an empty wishlist with both totals at $0 and no hints', async () => {
    const tree = await mount();
    for (const name of WISH_NAMES) await moveToWardrobe(tree, name);
    const t = text(tree);
    expect(t).toContain('Your wishlist is empty');
    expect(t).toMatch(/New total\s+\$0\b/);
    expect(t).toMatch(/Used total\s+\$0\b/);
    expect(t).not.toContain('without a');
    expect((await getOwnedClothingItems()).map(i => i.name)).toEqual(expect.arrayContaining(WISH_NAMES));
  });
});

describe('a guest: the on-device store', () => {
  // A wish as it sits in the on-device store after the wishlist search added it (New price from the
  // brand's own site, Used price from a resale listing), and an owned piece with prices of its own.
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
      retailCost: 1450,
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
      retailCost: 200,
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
    await save(searchResult({ name: 'Padded Tote', category: 'bags', cost: undefined, retailCost: undefined, retailer: '' }), 3333);

    const ownedList = await getOwnedClothingItems();
    const wishList = await getWishlistClothingItems();
    expect(ownedList.map(i => i.name)).toEqual(['Brown Knee-High Boots']);
    expect(wishList.map(i => i.name)).toEqual(['Cassette Padded Boots', 'Padded Tote']);
    expect(ownedList.some(i => i.isWishlist)).toBe(false);
  });

  it('the screen shows the wishes and totals only their prices, New and Used', async () => {
    await save(owned(), 1111);
    await save(searchResult(), 2222);
    await save(searchResult({ name: 'Padded Tote', category: 'bags', cost: undefined, retailCost: undefined, retailer: '' }), 3333);

    const t = text(await mount());
    expect(t).toContain('Cassette Padded Boots');
    expect(t).toContain('Padded Tote');
    expect(t).not.toContain('Brown Knee-High Boots');
    expect(t).toMatch(/New total\s+\$1,450\s+1 without a new price/); // not 1,650: the owned 200 is not in it
    expect(t).toMatch(/Used total\s+\$862\s+1 without a used price/); // not 982: the owned 120 is not in it
    expect(t).not.toContain('$1,650');
    expect(t).not.toContain('$982');
  });

  it('a wish saved with only a cost (the way earlier versions kept a search price) reads as a Used price', async () => {
    await save(searchResult({ retailCost: undefined }), 2222);
    const tree = await mount();
    const t = text(tree);
    expect(t).toMatch(/New total\s+\$0\s+1 without a new price/);
    expect(t).toMatch(/Used total\s+\$862\b/);
    expect(pressable(tree, 'Edit prices of Cassette Padded Boots: Used $862')).toBeDefined();
  });

  it('works for a signed-out guest with no budget saved: the row says Not set, with no bar', async () => {
    await save(searchResult(), 2222);
    const tree = await mount();
    expect(text(tree)).toMatch(/Budget\s+Not set/);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(pressable(tree, 'Budget not set. Set a budget')).toBeDefined();
  });

  it('with only owned items the wishlist is empty and both totals are $0, with no hints', async () => {
    await save(owned(), 1111);
    const t = text(await mount());
    expect(t).toContain('Your wishlist is empty');
    expect(t).toMatch(/New total\s+\$0/);
    expect(t).toMatch(/Used total\s+\$0/);
    expect(t).not.toContain('without a');
    expect(t).not.toContain('Brown Knee-High Boots');
  });
});
