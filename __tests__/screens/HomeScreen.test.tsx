import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HomeScreen from '../../src/screens/HomeScreen';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';
import { getBodyProfile } from '../../src/services/profileService';
import { Skeleton } from '../../src/ui';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn() }));
jest.mock('../../src/services/authService', () => ({ signOut: jest.fn() }));
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(async () => {
    throw new Error('no location');
  }),
  getCurrentWeather: jest.fn(),
}));
jest.mock('../../src/screens/StyleQuizScreen', () => ({ STYLE_PREFS_KEY: '@style_prefs' }));

const mockFocus: { current: null | (() => void) } = { current: null };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

const mockItems = getClothingItems as jest.Mock;
const mockOutfits = getSavedOutfits as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

let n = 0;
const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `Item ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});
const three = () => [item(), item(), item({ isWishlist: true })];
const outfit = (i: number) => ({ id: `o${i}`, name: `Outfit ${i}`, items: [], createdAt: '2026-01-01' });

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<HomeScreen />);
  });
  return tree;
};
const retry = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(n => /^Try again to load your/.test(n.props.accessibilityLabel ?? '') && !!n.props.onPress);

beforeEach(() => {
  mockItems.mockReset();
  mockOutfits.mockReset();
  (getBodyProfile as jest.Mock).mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('HomeScreen load states', () => {
  it('shows real stats when everything loads', async () => {
    mockItems.mockResolvedValue(three());
    mockOutfits.mockResolvedValue([outfit(1), outfit(2)]);
    const t = text(await mount());
    expect(t).toMatch(/2\s+Items/);
    expect(t).toMatch(/2\s+Outfits/);
    expect(t).toMatch(/1\s+Wishlist/);
    expect(t).not.toContain("Couldn't");
  });

  it('a failed outfits load does not zero the items stat and says so', async () => {
    mockItems.mockResolvedValue(three());
    mockOutfits.mockRejectedValue(new Error('offline'));
    const t = text(await mount());
    expect(t).toMatch(/2\s+Items/);
    expect(t).toMatch(/–\s+Outfits/);
    expect(t).toContain("Couldn't load your outfits");
    expect(t).not.toContain('Your wardrobe is empty');
  });

  it('a failed wardrobe load shows a banner and dashes, never an empty wardrobe or zeros', async () => {
    mockItems.mockRejectedValue(new Error('offline'));
    mockOutfits.mockResolvedValue([outfit(1)]);
    const tree = await mount();
    const t = text(tree);
    expect(t).toContain("Couldn't load your wardrobe");
    expect(t).not.toContain('Your wardrobe is empty');
    expect(t).toMatch(/–\s+Items/);
    expect(t).toMatch(/1\s+Outfits/);
    expect(t).not.toContain('Recently added');

    mockItems.mockResolvedValue(three());
    await act(async () => {
      await retry(tree).props.onPress();
    });
    const after = text(tree);
    expect(after).not.toContain("Couldn't");
    expect(after).toMatch(/2\s+Items/);
    expect(after).toContain('Recently added');
  });

  it('says both when both fail', async () => {
    mockItems.mockRejectedValue(new Error('offline'));
    mockOutfits.mockRejectedValue(new Error('offline'));
    expect(text(await mount())).toContain("Couldn't load your wardrobe and outfits");
  });

  it('really empty wardrobe still shows the empty state', async () => {
    mockItems.mockResolvedValue([]);
    mockOutfits.mockResolvedValue([]);
    const t = text(await mount());
    expect(t).toContain('Your wardrobe is empty');
    expect(t).not.toContain("Couldn't");
  });

  it('lists owned items as recently added, newest first, and never a wishlist item', async () => {
    mockItems.mockResolvedValue([
      item({ name: 'Old Tee', dateAdded: '2026-01-01T00:00:00Z' }),
      item({ name: 'Wished Coat', isWishlist: true, dateAdded: '2026-09-01T00:00:00Z' }),
      item({ name: 'New Jeans', dateAdded: '2026-03-01T00:00:00Z' }),
    ]);
    mockOutfits.mockResolvedValue([]);
    const t = text(await mount());
    expect(t).not.toContain('Wished Coat');
    expect(t.indexOf('New Jeans')).toBeGreaterThan(-1);
    expect(t.indexOf('New Jeans')).toBeLessThan(t.indexOf('Old Tee'));
  });

  it('a failed refresh on refocus keeps the earlier numbers and offers a refresh retry', async () => {
    mockItems.mockResolvedValueOnce(three());
    mockOutfits.mockResolvedValueOnce([outfit(1), outfit(2)]);
    const tree = await mount();

    mockItems.mockRejectedValueOnce(new Error('offline'));
    mockOutfits.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      mockFocus.current!();
    });
    const t = text(tree);
    expect(t).toContain("Couldn't refresh your wardrobe and outfits");
    expect(t).toMatch(/2\s+Items/);
    expect(t).toMatch(/2\s+Outfits/);
    expect(t).toContain('Recently added');
  });

  it('shows the loading skeleton only for the very first load, not on refocus', async () => {
    let firstLoad!: (v: ClothingItem[]) => void;
    mockItems.mockReturnValueOnce(new Promise<ClothingItem[]>(res => (firstLoad = res)));
    mockOutfits.mockResolvedValue([]);
    const tree = await mount();
    expect(tree.root.findAllByType(Skeleton).length).toBeGreaterThan(0);
    expect(text(tree)).not.toMatch(/0\s+Items/); // dashes, not a fake zero, while loading

    await act(async () => firstLoad(three()));
    expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);

    let refresh!: (v: ClothingItem[]) => void;
    mockItems.mockReturnValueOnce(new Promise<ClothingItem[]>(res => (refresh = res)));
    await act(async () => {
      mockFocus.current!();
    });
    expect(tree.root.findAllByType(Skeleton)).toHaveLength(0);
    expect(text(tree)).toMatch(/2\s+Items/);
    await act(async () => refresh(three()));
  });
});

describe('HomeScreen wardrobe worth', () => {
  const worth = (tree: renderer.ReactTestRenderer) =>
    tree.root.find(n => /^WardrobeWorth: /.test(n.props.accessibilityLabel ?? '') && !!n.props.onPress).props
      .accessibilityLabel as string;

  it('adds up what the owned items are worth now, not what they cost', async () => {
    mockItems.mockResolvedValue([
      item({ cost: 100 }),
      item({ cost: 10, estimatedValue: 250, valueSource: 'user' }),
    ]);
    mockOutfits.mockResolvedValue([]);
    const tree = await mount();
    expect(text(tree)).toContain('$350');
    expect(worth(tree)).toBe('WardrobeWorth: $350, view insights');
  });

  it('leaves the wishlist out, whatever it is priced at', async () => {
    mockItems.mockResolvedValue([
      item({ estimatedValue: 80, valueSource: 'user' }),
      item({ isWishlist: true, cost: 862, retailer: '', estimatedValue: 900, valueSource: 'user' }),
    ]);
    mockOutfits.mockResolvedValue([]);
    const tree = await mount();
    expect(worth(tree)).toBe('WardrobeWorth: $80, view insights');
    for (const wrong of ['$862', '$900', '$942', '$980']) expect(text(tree)).not.toContain(wrong);
  });

  it('estimates items that have no value or price yet, so a wardrobe of legacy items is not worth $0', async () => {
    mockItems.mockResolvedValue([item({ category: 'tops' }), item({ category: 'bags', brand: 'Gucci' })]);
    mockOutfits.mockResolvedValue([]);
    expect(worth(await mount())).toBe('WardrobeWorth: $755, view insights');
  });

  it('shows thousands in full', async () => {
    mockItems.mockResolvedValue([item({ estimatedValue: 12345, valueSource: 'user' })]);
    mockOutfits.mockResolvedValue([]);
    const tree = await mount();
    expect(text(tree)).toContain('$12,345');
  });

  it('keeps its label', async () => {
    mockItems.mockResolvedValue(three());
    mockOutfits.mockResolvedValue([]);
    expect(text(await mount())).toContain('WardrobeWorth');
  });
});
