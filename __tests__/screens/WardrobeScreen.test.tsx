import 'react-native';
import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import { getOwnedClothingItems, deleteClothingItem } from '../../src/services/storage';
import { getBodyProfile } from '../../src/services/profileService';
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
    expect(t).toMatch(/3\s+of\s+3\s+items/);
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
