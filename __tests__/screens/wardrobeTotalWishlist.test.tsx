/**
 * Wishlist pieces never appear in the Wardrobe or in its total. Real storage
 * end to end: the rows are shaped the way the database returns them (snake_case,
 * wishlist rows with is_wishlist = true, a price and an empty retailer), run
 * through mapDbToClothingItem and the owned filter, and drawn by the real screen.
 */
import 'react-native';
import React from 'react';
import { FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import { mapDbToClothingItem } from '../../src/services/storage';
import { estimateItemValue, formatMoney, totalValue } from '../../src/utils/itemValue';
import type { ClothingItem } from '../../src/types';

let mockSession: any = null;
let mockRows: any[] = [];

const mockChain: any = {};
mockChain.select = () => mockChain;
mockChain.eq = () => mockChain;
mockChain.order = () => mockChain;
mockChain.range = async () => ({ data: mockRows, error: null });

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession } }) },
    from: () => mockChain,
    storage: {
      from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }),
    },
  },
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

const navigation = { navigate: jest.fn() } as any;
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WardrobeScreen navigation={navigation} />);
  });
  return tree;
};
const strip = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(node => typeof node.type === 'string' && /^Total wardrobe value/.test(node.props.accessibilityLabel ?? ''));
const spoken = (n: number) => `Total wardrobe value ${formatMoney(n).replace('$', '')} dollars`;
/** The pieces the screen hands to its cards, in order. */
const shown = (tree: renderer.ReactTestRenderer): ClothingItem[] =>
  tree.root.findAll(node => !!node.props.item && !!node.props.onDelete).map(node => node.props.item);

// A row as the clothing_items table returns it.
const dbRow = (extra: Record<string, unknown>) => ({
  id: 'row',
  user_id: 'me',
  name: 'Row',
  category: 'tops',
  color: 'black',
  season: ['fall'],
  retailer_image: null,
  user_image: null,
  brand: null,
  is_wishlist: false,
  wear_count: 0,
  last_worn: null,
  cost: null,
  retail_cost: null,
  purchase_date: null,
  occasion: null,
  notes: null,
  tags: [],
  favorite: false,
  retailer: '',
  materials: null,
  date_added: null,
  created_at: '2026-03-01T00:00:00Z',
  ...extra,
});

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await AsyncStorage.clear();
  mockSession = null;
  mockRows = [];
});
afterEach(() => jest.restoreAllMocks());

describe('the Wardrobe, signed in', () => {
  const OWNED = [
    dbRow({ id: 'o1', name: 'Owned Blazer', cost: '120.00', is_wishlist: false }),
    dbRow({ id: 'o2', name: 'Owned Jeans', category: 'bottoms', cost: '60.00', is_wishlist: false }),
    // Written before the column had its default.
    dbRow({ id: 'o3', name: 'Legacy Tee', is_wishlist: null }),
  ];
  const WISHLIST = [
    dbRow({ id: 'w1', name: 'Dream Trench Coat', category: 'outerwear', cost: '862.00', retailer: '', is_wishlist: true }),
    dbRow({ id: 'w2', name: 'Wish Sandals', category: 'shoes', is_wishlist: true }),
  ];

  beforeEach(() => {
    mockSession = { user: { id: 'me' } };
    // The wishlist rows are the newest, so a screen that forgot to filter would put them first.
    mockRows = [...WISHLIST, ...OWNED];
  });

  it('reads the wishlist rows as wishlist items, so the test below is about the filter', () => {
    const mapped = mockRows.map(mapDbToClothingItem);
    expect(mapped.filter(i => i.isWishlist).map(i => i.id)).toEqual(['w1', 'w2']);
    expect(mapped.find(i => i.id === 'w1')).toMatchObject({ isWishlist: true, cost: 862 });
    expect(mapped.find(i => i.id === 'o3')!.isWishlist).toBe(false);
  });

  it('draws only the pieces the user owns', async () => {
    const tree = await mount();
    expect(shown(tree).map(i => i.id).sort()).toEqual(['o1', 'o2', 'o3']);
    expect(shown(tree).every(i => !i.isWishlist)).toBe(true);
    expect(tree.root.findByType(FlatList).props.data).toHaveLength(3);
    expect(text(tree)).toContain('Owned Blazer');
    expect(text(tree)).toContain('Legacy Tee');
    expect(text(tree)).not.toContain('Dream Trench Coat');
    expect(text(tree)).not.toContain('Wish Sandals');
  });

  it('counts the owned pieces only, and adds up their value without the wishlist', async () => {
    const tree = await mount();
    const mapped = mockRows.map(mapDbToClothingItem);
    const owned = mapped.filter(i => !i.isWishlist);

    expect(text(tree)).toMatch(/3\s+items/);
    expect(text(tree)).not.toMatch(/5\s+items/);
    expect(strip(tree).props.accessibilityLabel).toBe(spoken(totalValue(owned)));
    // ...and it is not the total with the $862 coat in it.
    expect(strip(tree).props.accessibilityLabel).not.toBe(spoken(totalValue(mapped)));
    expect(totalValue(mapped)).toBeGreaterThan(totalValue(owned));
  });

  it('shows an empty wardrobe, worth $0, when everything saved is on the wishlist', async () => {
    mockRows = WISHLIST;
    const tree = await mount();
    expect(shown(tree)).toHaveLength(0);
    expect(text(tree)).toContain('Your wardrobe is empty');
    expect(text(tree)).not.toContain('Dream Trench Coat');
    expect(strip(tree).props.accessibilityLabel).toBe(spoken(0));
    expect(text(tree)).toMatch(/0\s+items/);
  });
});

describe('the Wardrobe total, on this device', () => {
  const stored = (extra: Partial<ClothingItem> & { name: string }): ClothingItem => ({
    id: extra.name,
    category: 'tops',
    color: 'black',
    season: ['fall'],
    dateAdded: '2026-01-01T00:00:00Z',
    isWishlist: false,
    ...extra,
  });

  const seed = async (items: ClothingItem[]) => {
    // Marks the store as already set up, so the demo wardrobe is not seeded on top.
    await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true');
    await AsyncStorage.setItem('@smartcloset_items', JSON.stringify(items));
  };

  it('uses a piece\'s own value where it has one, the estimate where it has none, and never counts the wishlist', async () => {
    const unpriced = stored({ name: 'Unpriced Tee', cost: 30 });
    await seed([
      stored({ name: 'Silk Blouse', estimatedValue: 120, valueSource: 'user' }),
      stored({ name: 'Wool Coat', category: 'outerwear', estimatedValue: 80, valueSource: 'estimate' }),
      unpriced,
      // The dearest thing in the store, and the newest, so any leak moves the total a lot.
      stored({ name: 'Dream Trench Coat', category: 'outerwear', isWishlist: true, estimatedValue: 900, cost: 900, dateAdded: '2026-09-01T00:00:00Z' }),
    ]);
    const tree = await mount();

    const expected = 120 + 80 + estimateItemValue(unpriced).value;
    expect(strip(tree).props.accessibilityLabel).toBe(spoken(expected));
    expect(strip(tree).props.accessibilityLabel).not.toBe(spoken(expected + 900));
    expect(shown(tree).map(i => i.name).sort()).toEqual(['Silk Blouse', 'Unpriced Tee', 'Wool Coat']);
    expect(text(tree)).toMatch(/3\s+items/);
    expect(text(tree)).not.toContain('Dream Trench Coat');
  });
});
