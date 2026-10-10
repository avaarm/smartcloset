/**
 * The "Total value" line under the Wardrobe title: one line, always the whole
 * wardrobe, kept current as items are added, edited and deleted.
 */
import 'react-native';
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import WardrobeTotalStrip, { TOTAL_STRIP_HEIGHT } from '../../src/components/WardrobeTotalStrip';
import FilterModal, { FilterOptions } from '../../src/components/FilterModal';
import { getOwnedClothingItems, deleteClothingItem } from '../../src/services/storage';
import { getBodyProfile } from '../../src/services/profileService';
import { estimateItemValue, formatMoney } from '../../src/utils/itemValue';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn() }));

const mockFocus: { current: null | (() => void) } = { current: null };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

const mockGetItems = getOwnedClothingItems as jest.Mock;
const mockDelete = deleteClothingItem as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

let n = 0;
const item = (name: string, extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `id-${++n}`,
  name,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});
const priced = (name: string, estimatedValue: number, extra: Partial<ClothingItem> = {}) =>
  item(name, { estimatedValue, valueSource: 'user', ...extra });

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
const stripText = (tree: renderer.ReactTestRenderer) => flatten(strip(tree).children);
const style = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) as any;

beforeEach(() => {
  mockGetItems.mockReset();
  mockDelete.mockReset();
  (getBodyProfile as jest.Mock).mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('WardrobeTotalStrip', () => {
  const render = (total: number, count: number) => renderer.create(<WardrobeTotalStrip total={total} count={count} />);
  const label = (tree: renderer.ReactTestRenderer) =>
    tree.root.find(node => typeof node.type === 'string' && node.props.accessible === true).props.accessibilityLabel;

  it('reads "Total value", the amount and the count of items', () => {
    const tree = render(12345, 46);
    expect(flatten(tree.toJSON())).toBe('Total value $12,345 46 items');
  });

  it('is one element for VoiceOver, spoken as whole dollars', () => {
    const tree = render(12345, 46);
    const host = tree.root.find(node => typeof node.type === 'string' && node.props.accessible === true);
    expect(host.props.accessibilityLabel).toBe('Total wardrobe value 12,345 dollars');
    expect(host.props.accessibilityRole).toBe('summary');
  });

  it.each([
    [0, 'Total wardrobe value 0 dollars', '$0'],
    [999, 'Total wardrobe value 999 dollars', '$999'],
    [1000, 'Total wardrobe value 1,000 dollars', '$1,000'],
    [1234567.6, 'Total wardrobe value 1,234,568 dollars', '$1,234,568'],
    [NaN, 'Total wardrobe value 0 dollars', '$0'],
  ])('shows %p as %s', (total, spoken, shown) => {
    const tree = render(total, 3);
    expect(label(tree)).toBe(spoken);
    expect(flatten(tree.toJSON())).toContain(shown);
  });

  it('keeps the noun singular for one item', () => {
    expect(flatten(render(40, 1).toJSON())).toContain('1 item');
    expect(flatten(render(40, 1).toJSON())).not.toContain('1 items');
    expect(flatten(render(0, 0).toJSON())).toContain('0 items');
  });

  it('is one line about 36pt tall, with every piece of text held to a single line', () => {
    const tree = render(12345, 46);
    const host = tree.root.find(node => typeof node.type === 'string' && node.props.accessible === true);
    expect(TOTAL_STRIP_HEIGHT).toBe(36);
    expect(style(host)).toMatchObject({ height: TOTAL_STRIP_HEIGHT, flexDirection: 'row', alignItems: 'center' });
    const texts = tree.root.findAllByType(RNText);
    expect(texts.length).toBe(3);
    for (const t of texts) expect(t.props.numberOfLines).toBe(1);
  });
});

describe('the Wardrobe total', () => {
  it('adds up the pieces: a value of their own where they have one, the estimate where they do not', async () => {
    const unpriced = item('Unpriced Tee', { cost: 30 });
    mockGetItems.mockResolvedValue([priced('Silk Blouse', 120), priced('Wool Coat', 80), unpriced]);
    const tree = await mount();

    const expected = 120 + 80 + estimateItemValue(unpriced).value;
    expect(expected).toBeGreaterThan(200); // the unpriced piece counts for something
    expect(strip(tree).props.accessibilityLabel).toBe(
      `Total wardrobe value ${formatMoney(expected).replace('$', '')} dollars`,
    );
    expect(stripText(tree)).toContain(formatMoney(expected));
    expect(stripText(tree)).toContain('3 items');
  });

  it('shows $0 and 0 items for an empty wardrobe', async () => {
    mockGetItems.mockResolvedValue([]);
    const tree = await mount();
    expect(stripText(tree)).toBe('Total value $0 0 items');
    expect(text(tree)).toContain('Your wardrobe is empty');
  });

  it('sits under the title and count and above the search', async () => {
    mockGetItems.mockResolvedValue([priced('Silk Blouse', 120)]);
    const tree = await mount();
    const order = tree.root.findAll(() => true);
    const indexOf = (match: (node: renderer.ReactTestInstance) => boolean) => order.findIndex(match);

    const title = indexOf(node => node.props.children === 'My Wardrobe');
    const count = indexOf(node => node.props.children === '1 item');
    const total = indexOf(node => /^Total wardrobe value/.test(node.props.accessibilityLabel ?? ''));
    const search = indexOf(node => node.props.accessibilityLabel === 'Search wardrobe');
    expect(title).toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThan(title);
    expect(total).toBeGreaterThan(count);
    expect(search).toBeGreaterThan(total);
  });

  describe('while the list is narrowed', () => {
    const NO_FILTERS: FilterOptions = { categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' };
    const narrowBy = async (tree: renderer.ReactTestRenderer, filters: Partial<FilterOptions>) => {
      await act(async () => {
        tree.root.findByType(FilterModal).props.onApplyFilters({ ...NO_FILTERS, ...filters });
      });
    };
    const search = async (tree: renderer.ReactTestRenderer, query: string) => {
      const input = tree.root.find(node => node.props.accessibilityLabel === 'Search wardrobe' && !!node.props.onChangeText);
      await act(async () => input.props.onChangeText(query));
    };

    beforeEach(() => {
      mockGetItems.mockResolvedValue([
        priced('Silk Blouse', 120),
        priced('Cotton Tee', 30),
        priced('Denim Jeans', 70, { category: 'bottoms' }),
      ]);
    });

    it('still shows the total of the whole wardrobe when a search narrows it, with the count of the match separate', async () => {
      const tree = await mount();
      await search(tree, 'jeans');
      expect(text(tree)).toMatch(/1\s+of\s+3\s+items/);
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 220 dollars');
      expect(stripText(tree)).toBe('Total value $220 3 items');
      expect(text(tree)).not.toContain('Silk Blouse');
    });

    it('still shows the total of the whole wardrobe when a filter narrows it', async () => {
      const tree = await mount();
      await narrowBy(tree, { categories: ['bottoms'] });
      expect(text(tree)).toMatch(/1\s+of\s+3\s+items/);
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 220 dollars');
    });

    it('still shows the total when nothing matches', async () => {
      const tree = await mount();
      await search(tree, 'zzz');
      expect(text(tree)).toMatch(/0\s+of\s+3\s+items/);
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 220 dollars');
    });

    it('keeps the "N of M items" header rule: the plain count when nothing is narrowing', async () => {
      const tree = await mount();
      expect(text(tree)).toMatch(/3\s+items/);
      expect(text(tree)).not.toMatch(/\bof\b/);
    });
  });

  describe('as the wardrobe changes', () => {
    it('drops a deleted piece from the total without a refetch', async () => {
      const coat = priced('Wool Coat', 80);
      mockGetItems.mockResolvedValue([priced('Silk Blouse', 120), coat]);
      const tree = await mount();
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 200 dollars');

      mockDelete.mockResolvedValueOnce(undefined);
      const card = tree.root.find(node => !!node.props.onDelete && node.props.item?.name === 'Wool Coat');
      await act(async () => {
        await card.props.onDelete(coat.id);
      });
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 120 dollars');
      expect(stripText(tree)).toContain('1 item');
      expect(mockGetItems).toHaveBeenCalledTimes(1);
    });

    it('keeps the total when a delete fails', async () => {
      const coat = priced('Wool Coat', 80);
      mockGetItems.mockResolvedValue([priced('Silk Blouse', 120), coat]);
      const tree = await mount();
      mockDelete.mockRejectedValueOnce(new Error('offline'));
      const card = tree.root.find(node => !!node.props.onDelete && node.props.item?.name === 'Wool Coat');
      await act(async () => {
        await card.props.onDelete(coat.id);
      });
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 200 dollars');
    });

    it('picks up an added piece and an edited value when the screen is returned to', async () => {
      const blouse = priced('Silk Blouse', 120);
      mockGetItems.mockResolvedValueOnce([blouse]);
      const tree = await mount();
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 120 dollars');

      // Back from the Add screen: the blouse was re-valued at 150 and a new coat was added at 80.
      mockGetItems.mockResolvedValueOnce([{ ...blouse, estimatedValue: 150 }, priced('Wool Coat', 80)]);
      await act(async () => {
        mockFocus.current!();
      });
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 230 dollars');
      expect(stripText(tree)).toContain('2 items');
    });

    it('keeps the old total on screen while a refresh is in flight, and after one fails', async () => {
      mockGetItems.mockResolvedValueOnce([priced('Silk Blouse', 120)]);
      const tree = await mount();

      let finish!: (items: ClothingItem[]) => void;
      mockGetItems.mockReturnValueOnce(new Promise<ClothingItem[]>(res => (finish = res)));
      await act(async () => {
        mockFocus.current!();
      });
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 120 dollars');
      await act(async () => finish([priced('Silk Blouse', 120), priced('Wool Coat', 80)]));
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 200 dollars');

      mockGetItems.mockRejectedValueOnce(new Error('offline'));
      await act(async () => {
        mockFocus.current!();
      });
      expect(text(tree)).toContain("Couldn't refresh your wardrobe");
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 200 dollars');
    });
  });

  describe('before there is a wardrobe to add up', () => {
    it('shows no total while loading', async () => {
      mockGetItems.mockReturnValue(new Promise(() => {}));
      const tree = await mount();
      expect(text(tree)).toContain('Loading wardrobe');
      expect(text(tree)).not.toContain('Total value');
    });

    it('shows no total, rather than $0, when the first load failed; it appears after a retry', async () => {
      mockGetItems.mockRejectedValueOnce(new Error('offline'));
      const tree = await mount();
      expect(text(tree)).toContain("Couldn't load your wardrobe");
      expect(text(tree)).not.toContain('Total value');

      mockGetItems.mockResolvedValueOnce([priced('Silk Blouse', 120)]);
      const retry = tree.root.find(node => node.props.accessibilityLabel === 'Try again to load your wardrobe' && !!node.props.onPress);
      await act(async () => {
        await retry.props.onPress();
      });
      expect(strip(tree).props.accessibilityLabel).toBe('Total wardrobe value 120 dollars');
    });
  });
});
