import 'react-native';
import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import { getOwnedClothingItems, deleteClothingItem } from '../../src/services/storage';
import { getBodyProfile } from '../../src/services/profileService';
import FilterModal, { FilterOptions } from '../../src/components/FilterModal';
import { Badge } from '../../src/ui';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn() }));

// Run the focus callback on mount like the real hook, and expose it so a test
// can simulate coming back to the screen.
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
const mockProfile = getBodyProfile as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

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

const navigation = { navigate: jest.fn() } as any;

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WardrobeScreen navigation={navigation} />);
  });
  return tree;
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

beforeEach(() => {
  mockGetItems.mockReset();
  mockDelete.mockReset();
  mockProfile.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('WardrobeScreen loading', () => {
  it('shows the wardrobe and reads the body profile once for the whole grid', async () => {
    mockGetItems.mockResolvedValue([item('Blue Shirt'), item('Red Skirt'), item('Grey Coat')]);
    const tree = await mount();
    const t = text(tree);
    expect(t).toContain('Blue Shirt');
    expect(t).toContain('Grey Coat');
    expect(t).toMatch(/3\s+items/);
    expect(mockProfile).toHaveBeenCalledTimes(1);
  });

  it('a failed first load shows a retryable error, not "Your wardrobe is empty"', async () => {
    mockGetItems.mockRejectedValueOnce(new Error('offline'));
    const tree = await mount();
    let t = text(tree);
    expect(t).toContain("Couldn't load your wardrobe");
    expect(t).not.toContain('Your wardrobe is empty');
    expect(t).not.toMatch(/\d+\s+of\s+\d+\s+items/); // no misleading count

    mockGetItems.mockResolvedValueOnce([item('Blue Shirt')]);
    const retry = tree.root.find(n => n.props.accessibilityLabel === 'Try again to load your wardrobe' && !!n.props.onPress);
    await act(async () => {
      await retry.props.onPress();
    });
    t = text(tree);
    expect(t).toContain('Blue Shirt');
    expect(t).not.toContain("Couldn't load your wardrobe");
  });

  it('shows the empty state only when the load succeeded with no items', async () => {
    mockGetItems.mockResolvedValue([]);
    const tree = await mount();
    expect(text(tree)).toContain('Your wardrobe is empty');
    // still pull-to-refreshable
    expect(tree.root.findAllByType(RefreshControl)).toHaveLength(1);
  });

  it('keeps the grid on screen while refocusing, and picks up changes when the refresh lands', async () => {
    mockGetItems.mockResolvedValueOnce([item('Blue Shirt')]);
    const tree = await mount();

    let finish!: (items: ClothingItem[]) => void;
    mockGetItems.mockReturnValueOnce(new Promise<ClothingItem[]>(res => (finish = res)));
    await act(async () => {
      mockFocus.current!();
    });
    // mid-refresh: no spinner, grid still there
    expect(text(tree)).toContain('Blue Shirt');
    expect(text(tree)).not.toContain('Loading wardrobe');

    await act(async () => finish([item('Blue Shirt'), item('New Hat')]));
    expect(text(tree)).toContain('New Hat');
  });

  it('a failed refresh keeps the items and shows a non-blocking banner that can retry', async () => {
    mockGetItems.mockResolvedValueOnce([item('Blue Shirt')]);
    const tree = await mount();

    mockGetItems.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    let t = text(tree);
    expect(t).toContain('Blue Shirt');
    expect(t).toContain("Couldn't refresh your wardrobe");
    expect(t).not.toContain('Your wardrobe is empty');

    mockGetItems.mockResolvedValueOnce([item('Blue Shirt'), item('New Hat')]);
    const retry = tree.root.find(n => n.props.accessibilityLabel === 'Try again to load your wardrobe' && !!n.props.onPress);
    await act(async () => {
      await retry.props.onPress();
    });
    t = text(tree);
    expect(t).toContain('New Hat');
    expect(t).not.toContain("Couldn't refresh your wardrobe");
  });

  it('removes a deleted item without refetching, and reports a failed delete', async () => {
    mockGetItems.mockResolvedValue([item('Blue Shirt'), item('Red Skirt')]);
    const tree = await mount();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const cardFor = (name: string) =>
      tree.root.find(n => !!n.props.onDelete && n.props.item?.name === name);

    mockDelete.mockResolvedValueOnce(undefined);
    await act(async () => {
      await cardFor('Blue Shirt').props.onDelete(cardFor('Blue Shirt').props.item.id);
    });
    expect(text(tree)).not.toContain('Blue Shirt');
    expect(text(tree)).toContain('Red Skirt');
    expect(mockGetItems).toHaveBeenCalledTimes(1);

    mockDelete.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await cardFor('Red Skirt').props.onDelete(cardFor('Red Skirt').props.item.id);
    });
    expect(alertSpy).toHaveBeenCalledWith('Could not delete item', expect.any(String));
    expect(text(tree)).toContain('Red Skirt');
  });
});

const NO_FILTERS: FilterOptions = { categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' };
const applyFilters = async (tree: renderer.ReactTestRenderer, filters: Partial<FilterOptions>) => {
  await act(async () => {
    tree.root.findByType(FilterModal).props.onApplyFilters({ ...NO_FILTERS, ...filters });
  });
};
const search = async (tree: renderer.ReactTestRenderer, query: string) => {
  const input = tree.root.find(n => n.props.accessibilityLabel === 'Search wardrobe' && !!n.props.onChangeText);
  await act(async () => input.props.onChangeText(query));
};

describe('WardrobeScreen item count', () => {
  it('says "1 item" for a single piece, never "1 of 1 items"', async () => {
    mockGetItems.mockResolvedValue([item('Blue Shirt')]);
    const t = text(await mount());
    expect(t).toContain('1 item');
    expect(t).not.toContain('1 items');
    expect(t).not.toMatch(/\bof\b/);
  });

  it('says "N of M items" only while a filter or a search is narrowing the list', async () => {
    mockGetItems.mockResolvedValue([
      item('Tee A'),
      item('Tee B'),
      item('Jeans', { category: 'bottoms' }),
    ]);
    const tree = await mount();
    expect(text(tree)).toMatch(/3\s+items/);
    expect(text(tree)).not.toMatch(/\bof\b/);

    await applyFilters(tree, { categories: ['tops'] });
    expect(text(tree)).toMatch(/2\s+of\s+3\s+items/);

    await applyFilters(tree, {});
    expect(text(tree)).toMatch(/3\s+items/);
    expect(text(tree)).not.toMatch(/\bof\b/);

    await search(tree, 'jeans');
    expect(text(tree)).toMatch(/1\s+of\s+3\s+items/);

    await search(tree, '   ');
    expect(text(tree)).toMatch(/3\s+items/);
    expect(text(tree)).not.toMatch(/\bof\b/);
  });

  it('keeps the noun singular for a total of one while a search hides it', async () => {
    mockGetItems.mockResolvedValue([item('Blue Shirt')]);
    const tree = await mount();
    await search(tree, 'zzz');
    expect(text(tree)).toMatch(/0\s+of\s+1\s+item(?!s)/);
  });
});

describe('WardrobeScreen season filter', () => {
  const shown = (tree: renderer.ReactTestRenderer) =>
    ['Spring Tee', 'Winter Coat', 'Legacy All', 'No Season', 'Missing Season', 'Autumn Knit'].filter(name =>
      text(tree).includes(name),
    );
  const season = (name: string, seasons: unknown) => item(name, { season: seasons as any });

  beforeEach(() => {
    mockGetItems.mockResolvedValue([
      season('Spring Tee', ['spring']),
      season('Winter Coat', ['winter']),
      season('Legacy All', ['all']),
      season('No Season', []),
      season('Missing Season', undefined),
      season('Autumn Knit', ['Autumn']),
    ]);
  });

  it('a spring filter shows the spring piece, a legacy "all" piece and pieces with no season', async () => {
    const tree = await mount();
    await applyFilters(tree, { seasons: ['spring'] });
    expect(shown(tree)).toEqual(['Spring Tee', 'Legacy All', 'No Season', 'Missing Season']);
  });

  it('a winter filter still hides the spring piece', async () => {
    const tree = await mount();
    await applyFilters(tree, { seasons: ['winter'] });
    expect(shown(tree)).toEqual(['Winter Coat', 'Legacy All', 'No Season', 'Missing Season']);
  });

  it('reads an old "Autumn" as fall', async () => {
    const tree = await mount();
    await applyFilters(tree, { seasons: ['fall'] });
    expect(shown(tree)).toEqual(['Legacy All', 'No Season', 'Missing Season', 'Autumn Knit']);
  });

  it('matches any one of several chosen seasons', async () => {
    const tree = await mount();
    await applyFilters(tree, { seasons: ['spring', 'winter'] });
    expect(shown(tree)).toEqual(['Spring Tee', 'Winter Coat', 'Legacy All', 'No Season', 'Missing Season']);
  });
});

describe('WardrobeScreen active filter badges', () => {
  it('name each category and season the way the pickers do, not by their stored ids', async () => {
    mockGetItems.mockResolvedValue([item('Tee A')]);
    const tree = await mount();
    await applyFilters(tree, { categories: ['shoes', 'bags', 'activewear'], seasons: ['spring', 'fall'] });
    expect(tree.root.findAllByType(Badge).map(b => b.props.label)).toEqual([
      'Shoes',
      'Bags',
      'Activewear',
      'Spring',
      'Fall',
    ]);
  });
});
