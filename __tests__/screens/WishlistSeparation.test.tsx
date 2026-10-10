/**
 * A mixed guest wardrobe (owned pieces plus wishlist pieces, in the real on-device
 * store) run through every screen that means "my clothes" and the Wishlist itself.
 * Storage is real; only the network-ish neighbours are mocked.
 */
import 'react-native';
import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import HomeScreen from '../../src/screens/HomeScreen';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import WishlistScreen from '../../src/screens/WishlistScreen';
import { StatsScreen } from '../../src/screens/StatsScreen';
import OutfitCalendarScreen from '../../src/screens/OutfitCalendarScreen';
import { getClothingItems, saveClothingItem } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn(async () => []) }));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(async () => {
    throw new Error('no location');
  }),
  getCurrentWeather: jest.fn(),
}));
jest.mock('../../src/screens/StyleQuizScreen', () => ({ STYLE_PREFS_KEY: '@style_prefs' }));
jest.mock('../../src/screens/WishlistSearchModal', () => () => null);

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    useNavigation: () => mockNavigation,
  };
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

const NOW = new Date().toISOString();
const base = (extra: Partial<ClothingItem>): ClothingItem => ({
  id: 'x',
  name: 'x',
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

// The wishlist coat is the newest thing in the store and the dearest, and it has
// been given a wear, so any screen that forgets to filter shows it.
const MIXED = [
  base({ id: 'o1', name: 'Owned Blazer', cost: 100, dateAdded: '2026-02-01T00:00:00Z', lastWorn: NOW, wearCount: 3 }),
  base({ id: 'o2', name: 'Owned Jeans', category: 'bottoms', cost: 50, dateAdded: '2026-03-01T00:00:00Z' }),
  base({ id: 'w1', name: 'Wish Coat', category: 'outerwear', cost: 900, isWishlist: true, dateAdded: '2026-09-01T00:00:00Z', lastWorn: NOW, wearCount: 9 }),
];

const seedGuestStore = async (items: ClothingItem[] = MIXED) => {
  await AsyncStorage.clear();
  // Marks the store as already set up, so the demo wardrobe is not seeded on top.
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true');
  await AsyncStorage.setItem('@smartcloset_items', JSON.stringify(items));
};
const stored = async (): Promise<ClothingItem[]> => JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);

const mount = async (element: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
};
const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await seedGuestStore();
});
afterEach(() => jest.restoreAllMocks());

describe('Home with owned and wishlist items together', () => {
  it('counts them apart, totals only what is owned, and lists only owned items as recently added', async () => {
    const t = text(await mount(<HomeScreen />));
    expect(t).toMatch(/2\s+Items/);
    expect(t).toMatch(/1\s+Wishlist/);
    expect(t).toMatch(/\$\s*150/); // 100 + 50; the 900 coat is not part of WardrobeWorth
    expect(t).toMatch(/Across\s+2\s+item/);
    expect(t).toContain('Owned Jeans');
    expect(t).toContain('Owned Blazer');
    expect(t).not.toContain('Wish Coat');
  });

  it('keeps the strip full of owned items when the newest ten things are all wishlist', async () => {
    const wishes = Array.from({ length: 10 }, (_, i) =>
      base({ id: `w${i}`, name: `Wish ${i}`, isWishlist: true, dateAdded: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    await seedGuestStore([...MIXED.slice(0, 2), ...wishes]);
    const t = text(await mount(<HomeScreen />));
    expect(t).toContain('Owned Blazer');
    expect(t).toContain('Owned Jeans');
    expect(t).not.toMatch(/Wish \d/);
    expect(t).toMatch(/10\s+Wishlist/);
  });

  it('with only wishlist items the closet reads as empty', async () => {
    await seedGuestStore([MIXED[2]]);
    const t = text(await mount(<HomeScreen />));
    expect(t).toContain('Your wardrobe is empty');
    expect(t).not.toContain('Wish Coat');
    expect(t).toMatch(/0\s+Items/);
    expect(t).toMatch(/1\s+Wishlist/);
  });
});

describe('Wardrobe and Wishlist with owned and wishlist items together', () => {
  it('the wardrobe shows only owned items; the wishlist shows only wishlist items', async () => {
    const wardrobeTree = await mount(<WardrobeScreen navigation={mockNavigation as any} />);
    const wardrobe = text(wardrobeTree);
    expect(wardrobe).toContain('Owned Blazer');
    expect(wardrobe).toContain('Owned Jeans');
    expect(wardrobe).not.toContain('Wish Coat');
    expect(wardrobe).toMatch(/2\s+items/);
    expect(wardrobe).not.toMatch(/\bof\b\s+\d+\s+items/); // no filter, so no "N of M"
    // "Move to wardrobe" is a wishlist-only button.
    expect(pressable(wardrobeTree, 'Move Owned Blazer to your wardrobe')).toBeUndefined();

    const wishlist = text(await mount(<WishlistScreen />));
    expect(wishlist).toContain('Wish Coat');
    expect(wishlist).not.toContain('Owned Blazer');
    expect(wishlist).not.toContain('Owned Jeans');
    // The wishlist total is the coat alone; the 150 of owned pieces is not part of it.
    expect(wishlist).toMatch(/Wishlist total\s+\$900\b/);
    expect(wishlist).not.toContain('$1,050');
  });

  it('the wardrobe search never reaches into the wishlist', async () => {
    const tree = await mount(<WardrobeScreen navigation={mockNavigation as any} />);
    const input = tree.root.findAll(n => n.props.accessibilityLabel === 'Search wardrobe' && !!n.props.onChangeText)[0];
    await act(async () => input.props.onChangeText('coat'));
    expect(text(tree)).not.toContain('Wish Coat');
    expect(text(tree)).toContain('No matches');
  });

  it('moving a wishlist item to the wardrobe flips it in place: same id, same place, wear history intact, added now', async () => {
    // Wished for long ago, so only a reset date can put it first in the wardrobe.
    await seedGuestStore([
      MIXED[0],
      MIXED[1],
      { ...MIXED[2], dateAdded: '2025-01-01T00:00:00Z' },
    ]);
    const before = await stored();
    const startedAt = Date.now();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<WishlistScreen />);

    await act(async () => pressable(tree, 'Move Wish Coat to your wardrobe').props.onPress());
    expect(alert.mock.calls[0][0]).toBe('Move to Wardrobe');
    const confirm = (alert.mock.calls[0][2] as any[]).find(b => b.text === 'Move');
    await act(async () => {
      await confirm.onPress();
    });

    const after = await stored();
    expect(after.map(i => i.id)).toEqual(before.map(i => i.id));
    const moved = after.find(i => i.id === 'w1')!;
    expect(moved).toMatchObject({ isWishlist: false, wearCount: 9, name: 'Wish Coat', lastWorn: NOW });
    // The wish date is not the date you got it: it counts as added now.
    expect(Date.parse(moved.dateAdded!)).toBeGreaterThanOrEqual(startedAt);
    expect(text(tree)).not.toContain('Wish Coat'); // gone from the wishlist...
    expect(text(tree)).toMatch(/Wishlist total\s+\$0\b/); // ...and from its total
    const wardrobe = text(await mount(<WardrobeScreen navigation={mockNavigation as any} />));
    expect(wardrobe).toContain('Wish Coat'); // ...and now owned
    expect(wardrobe).toMatch(/3\s+items/);
    expect(wardrobe.indexOf('Wish Coat')).toBeLessThan(wardrobe.indexOf('Owned Jeans')); // newest first
  });

  it('asks first: nothing moves until the move is confirmed', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<WishlistScreen />);
    await act(async () => pressable(tree, 'Move Wish Coat to your wardrobe').props.onPress());
    expect((await stored()).find(i => i.id === 'w1')!.isWishlist).toBe(true);
    expect(text(tree)).toContain('Wish Coat');
  });

  it('an item saved the way the wishlist search saves it lands on the wishlist only', async () => {
    await saveClothingItem(base({ id: 'ignored', name: 'Searched Bag', category: 'bags' as any, isWishlist: true }));
    const wardrobe = text(await mount(<WardrobeScreen navigation={mockNavigation as any} />));
    expect(wardrobe).not.toContain('Searched Bag');
    const wishlist = text(await mount(<WishlistScreen />));
    expect(wishlist).toContain('Searched Bag');
    expect((await getClothingItems({ all: true })).filter(i => i.isWishlist).map(i => i.name).sort()).toEqual([
      'Searched Bag',
      'Wish Coat',
    ]);
  });
});

describe('the add buttons', () => {
  it('the wishlist + offers a manual add that opens the form as a wishlist item', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<WishlistScreen />);
    await act(async () => pressable(tree, 'Add to wishlist').props.onPress());
    const manual = (alert.mock.calls[0][2] as any[]).find(b => b.text === 'Add manually');
    manual.onPress();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', { isWishlist: true });
  });

  it('the wardrobe + opens the form with no wishlist flag', async () => {
    const tree = await mount(<WardrobeScreen navigation={mockNavigation as any} />);
    await act(async () => pressable(tree, 'Add clothing item').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing');
  });

  it('editing a wishlist item hands the form the item as editItem, carrying its wishlist flag', async () => {
    const tree = await mount(<WishlistScreen />);
    await act(async () => pressable(tree, 'Edit Wish Coat').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: 'w1', isWishlist: true }),
    });
  });

  it('editing an owned item from the wardrobe uses the same param, with the flag off', async () => {
    const tree = await mount(<WardrobeScreen navigation={mockNavigation as any} />);
    await act(async () => pressable(tree, 'Edit Owned Blazer').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: 'o1', isWishlist: false }),
    });
  });
});

describe('Stats and Calendar with owned and wishlist items together', () => {
  it('stats count the wishlist apart and never rank or total a wishlist item', async () => {
    const t = text(await mount(<StatsScreen />));
    expect(t).toMatch(/2\s+Total Items/);
    expect(t).toMatch(/\$150\.00\s+Total Value/);
    expect(t).toMatch(/1\s+Wishlist/);
    expect(t).toContain('Owned Blazer'); // most worn
    expect(t).not.toContain('Wish Coat'); // worn 9 times, but not owned
    expect(t).toMatch(/You have\s+1\s+items that haven't been worn yet\./); // Owned Jeans only
  });

  it('the calendar lists only owned items as worn', async () => {
    const t = text(await mount(<OutfitCalendarScreen />));
    expect(t).toContain('Owned Blazer');
    expect(t).not.toContain('Wish Coat');
  });
});
