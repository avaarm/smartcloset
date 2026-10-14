/**
 * The swap card proven inside a rendered ItemDetailsScreen, the way the item screen's own tests render it:
 * navigation mocked minimally, the storage service mocked, and supabase NOT mocked, so a guest path that
 * made a network call would show up as a fetch.
 *
 * The screen does not carry the card until the integration pass edits it. This test puts the card where that
 * pass puts it (before the Details section, with the three callbacks of the swap design 7.7) in memory, from
 * the screen's real source, and renders the result. If the screen already has the card, it is rendered as it is.
 */
import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockNavigate = jest.fn();
let mockItem: any;

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));

import * as swapService from '../../src/services/swapService';
import { SwapError } from '../../src/services/swapErrors';
import RealItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import type { ClothingItem } from '../../src/types';
import type { MySwapListing } from '../../src/types/swap';

const SCREEN = path.resolve(__dirname, '../../src/screens/ItemDetailsScreen.tsx');

/** The edit pass B makes (swap design 7.7, pass_b_item.diff), applied to the screen's source in memory. */
const withSwapCard = (source: string): string => {
  if (source.includes('SwapListingCard')) return source;
  const importAfter = /^import .* from '@react-navigation\/native';$/m;
  const detailsAnchor = '{/* Details Section */}';
  if (!importAfter.test(source) || !source.includes(detailsAnchor)) {
    throw new Error('ItemDetailsScreen changed shape: update the landmarks in this test');
  }
  return source
    .replace(importAfter, line => `${line}\nimport SwapListingCard from '../components/SwapListingCard';`)
    .replace(
      detailsAnchor,
      `{!item.isWishlist && (
            <SwapListingCard
              item={item}
              onEditPiece={handleEdit}
              onOpenSwaps={() => (navigation as any).navigate('Home', { screen: 'MySwaps' })}
              onSignIn={() => (navigation as any).navigate('Home', { screen: 'SignIn' })}
            />
          )}

          ${detailsAnchor}`,
    );
};

const loadScreen = (): React.ComponentType => {
  const { transformSync } = require('@babel/core');
  const { code } = transformSync(withSwapCard(fs.readFileSync(SCREEN, 'utf8')), {
    filename: SCREEN,
    babelrc: false,
    configFile: false,
    presets: ['module:@react-native/babel-preset'],
  });
  const mod: any = { exports: {} };
  // Relative imports resolve from the screen's own folder, through Jest, so the mocks above apply.
  const localRequire = (id: string) => (id.startsWith('.') ? require(path.resolve(path.dirname(SCREEN), id)) : require(id));
  // The screen's own compiled code, run with Jest's require so the mocks above apply to its imports.
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports.default;
};

const PHOTO = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/1700000000000.jpg';

const makeItem = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Linen Shirt',
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  userImage: PHOTO,
  ...over,
});

const listing = (over: Partial<MySwapListing> = {}): MySwapListing => ({
  id: 'l1',
  itemId: 'item-1',
  audience: 'friends',
  status: 'active',
  name: 'Linen Shirt',
  photoPath: 'l1.jpg',
  listedAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-11-30T00:00:00Z',
  openOffers: 0,
  inAcceptedSwap: false,
  stale: false,
  ...over,
});

const mount = async (Screen: React.ComponentType, item: ClothingItem) => {
  mockItem = item;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Screen />);
  });
  const texts = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, texts, press };
};

let consoleError: jest.SpyInstance;
let fetchSpy: jest.Mock;
const realFetch = (global as any).fetch;
beforeEach(() => {
  mockNavigate.mockReset();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  fetchSpy = jest.fn(async () => {
    throw new Error('a network call was made');
  });
  (global as any).fetch = fetchSpy;
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  (global as any).fetch = realFetch;
  jest.restoreAllMocks();
});

describe('SwapListingCard inside ItemDetailsScreen', () => {
  it('puts the card in the screen at all (the landmarks still exist)', () => {
    expect(withSwapCard(fs.readFileSync(SCREEN, 'utf8'))).toContain('<SwapListingCard');
  });

  it('as a guest: shows "Sign in to swap", goes to sign-in from it, and makes no network call', async () => {
    const Screen = loadScreen();
    const { texts, press, tree } = await mount(Screen, makeItem());
    expect(texts()).toContain('Swap');
    expect(texts()).toContain('Sign in to swap');
    await press('Sign in to swap');
    expect(mockNavigate).toHaveBeenCalledWith('Home', { screen: 'SignIn' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('adds no text field to the screen', async () => {
    const withCard = await mount(loadScreen(), makeItem());
    const without = await mount(RealItemDetailsScreen as React.ComponentType, makeItem());
    expect(withCard.tree.root.findAllByType(TextInput)).toHaveLength(without.tree.root.findAllByType(TextInput).length);
    expect(withCard.tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('keeps the other sections of the screen', async () => {
    const { texts } = await mount(loadScreen(), makeItem());
    expect(texts()).toContain('Value');
    expect(texts()).toContain('Details');
  });

  it('signed in: shows how the piece stands and links to My swaps through the Home stack', async () => {
    jest.spyOn(swapService, 'listMySwapListings').mockResolvedValue([listing({ inAcceptedSwap: true })]);
    const { texts, press, tree } = await mount(loadScreen(), makeItem());
    expect(texts()).toContain('Locked into a swap. Deleting this piece cancels the swap.');
    await press('See swap');
    expect(mockNavigate).toHaveBeenCalledWith('Home', { screen: 'MySwaps' });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('signed in, not yet open: "Open to swap" is there, and a missing photo sends the member to the piece editor', async () => {
    jest.spyOn(swapService, 'listMySwapListings').mockResolvedValue([]);
    const item = makeItem({ userImage: undefined });
    const { texts, press } = await mount(loadScreen(), item);
    expect(texts()).toContain('Add a photo of the piece first');
    await press('Add a photo');
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing', { editItem: expect.objectContaining({ id: 'item-1' }) });
  });

  it.each([
    ['swaps being switched off', new SwapError('swaps_disabled')],
    ['a server without swap functions', { message: 'Could not find the function', code: 'PGRST202' }],
  ])('shows no card for %s', async (_n, failure) => {
    jest.spyOn(swapService, 'listMySwapListings').mockRejectedValue(failure);
    const { texts } = await mount(loadScreen(), makeItem());
    expect(texts()).not.toContain('Swap');
    expect(texts()).not.toContain('Sign in to swap');
    expect(texts()).toContain('Details');
  });

  it('shows no card for a wishlist piece, and reads nothing', async () => {
    const spy = jest.spyOn(swapService, 'listMySwapListings').mockResolvedValue([]);
    const { texts } = await mount(loadScreen(), makeItem({ isWishlist: true }));
    expect(texts()).not.toContain('Swap');
    expect(spy).not.toHaveBeenCalled();
  });
});
