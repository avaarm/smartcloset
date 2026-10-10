import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import WishlistScreen from '../../src/screens/WishlistScreen';
import { getWishlistClothingItems, deleteClothingItem } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getWishlistClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
  saveClothingItem: jest.fn(),
  updateClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/screens/WishlistSearchModal', () => () => null);
// The screen also reads the saved budget, which asks who is signed in: a guest here.
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}));

// The screen listens for focus on the navigator; keep the callback so a test can return to the screen.
const mockFocus: { current: null | (() => void) } = { current: null };
const mockNavigation = {
  navigate: jest.fn(),
  addListener: jest.fn((_event: string, cb: () => void) => {
    mockFocus.current = cb;
    return jest.fn();
  }),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockGet = getWishlistClothingItems as jest.Mock;
const mockDelete = deleteClothingItem as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

let n = 0;
const wish = (name: string): ClothingItem => ({
  id: `w-${++n}`,
  name,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: true,
});

const deferred = () => {
  let resolve!: (items: ClothingItem[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ClothingItem[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WishlistScreen />);
  });
  return tree;
};

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockReset().mockResolvedValue(undefined);
  mockFocus.current = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('WishlistScreen item count', () => {
  it('says "1 item" for a single wish, "2 items" for two, and "0 items" for none', async () => {
    mockGet.mockResolvedValueOnce([wish('Silk Scarf')]);
    const tree = await mount();
    expect(text(tree)).toContain('1 item');
    expect(text(tree)).not.toContain('1 items');

    mockGet.mockResolvedValueOnce([wish('Silk Scarf'), wish('Wool Coat')]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toContain('2 items');

    mockGet.mockResolvedValueOnce([]);
    await act(async () => mockFocus.current!());
    expect(text(tree)).toContain('0 items');
  });
});

describe('WishlistScreen overlapping reloads', () => {
  const cardFor = (tree: renderer.ReactTestRenderer, name: string) =>
    tree.root.find(node => !!node.props.onDelete && node.props.item?.name === name);

  it('a slow focus reload that lands after the post-delete reload does not put the deleted item back', async () => {
    const keep = wish('Wool Coat');
    const gone = wish('Silk Scarf');
    mockGet.mockResolvedValueOnce([gone, keep]);
    const tree = await mount();
    expect(text(tree)).toContain('Silk Scarf');

    // Coming back to the tab starts a reload that is slow to answer...
    const slowFocus = deferred();
    mockGet.mockReturnValueOnce(slowFocus.promise);
    await act(async () => {
      mockFocus.current!();
    });

    // ...meanwhile the scarf is deleted, and the reload after that answers first.
    const afterDelete = deferred();
    mockGet.mockReturnValueOnce(afterDelete.promise);
    let deleting!: Promise<void>;
    await act(async () => {
      deleting = cardFor(tree, 'Silk Scarf').props.onDelete(gone.id);
    });
    await act(async () => {
      afterDelete.resolve([keep]);
      await deleting;
    });
    expect(text(tree)).not.toContain('Silk Scarf');

    // The slow, older answer still lists the scarf: it must not be shown.
    await act(async () => slowFocus.resolve([gone, keep]));
    expect(text(tree)).not.toContain('Silk Scarf');
    expect(text(tree)).toContain('Wool Coat');
    expect(text(tree)).toContain('1 item');
  });

  it('a slow reload that fails after a newer one succeeded does not turn an empty wishlist into an error', async () => {
    mockGet.mockResolvedValueOnce([wish('Wool Coat')]);
    const tree = await mount();

    const slow = deferred();
    mockGet.mockReturnValueOnce(slow.promise);
    await act(async () => {
      mockFocus.current!();
    });
    // The last wish is removed elsewhere; the newer reload sees an empty wishlist.
    mockGet.mockResolvedValueOnce([]);
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toContain('Your wishlist is empty');

    await act(async () => slow.reject(new Error('offline')));
    expect(text(tree)).toContain('Your wishlist is empty');
    expect(text(tree)).not.toContain("Couldn't load your wishlist");
  });

  it('an older request that settles last does not replace a newer answer', async () => {
    const first = deferred();
    const second = deferred();
    mockGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const tree = await mount();
    await act(async () => {
      mockFocus.current!();
    });

    await act(async () => second.resolve([wish('Wool Coat')]));
    await act(async () => first.resolve([]));
    expect(text(tree)).toContain('Wool Coat');
    expect(text(tree)).not.toContain('Your wishlist is empty');
  });
});
