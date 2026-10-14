import 'react-native';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockParams: any = {};
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockSettings = jest.fn();
const mockGetListing = jest.fn();
const mockBrowse = jest.fn();
const mockMine = jest.fn();
const mockPropose = jest.fn();
const mockAccept = jest.fn();
const mockReport = jest.fn();
const mockBlock = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  getSwapListing: (...a: any[]) => mockGetListing(...a),
  browseSwapListings: (...a: any[]) => mockBrowse(...a),
  listMySwapListings: (...a: any[]) => mockMine(...a),
  proposeSwap: (...a: any[]) => mockPropose(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
  reportSwapContent: (...a: any[]) => mockReport(...a),
  blockSwapMember: (...a: any[]) => mockBlock(...a),
}));
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`])),
  forgetSwapPhoto: jest.fn(),
}));
// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
// The board's access notice stays real; only the "rack changed" flag is replaced so the call can be seen.
jest.mock('../../src/screens/SwapBoardScreen', () => ({
  ...jest.requireActual('../../src/screens/SwapBoardScreen'),
  markSwapRackDirty: jest.fn(),
}));

import SwapListingScreen from '../../src/screens/SwapListingScreen';
import { markSwapRackDirty } from '../../src/screens/SwapBoardScreen';
import { SWAP_NO_MONEY_LINE, SWAP_PAUSED_MESSAGE, SWAP_TERMS_VERSION } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { MySwapListing, SwapListing, SwapSettings } from '../../src/types/swap';

const settings = (over: Partial<SwapSettings> = {}): SwapSettings => ({
  swapsEnabled: true,
  termsAccepted: true,
  termsCurrent: true,
  currentTermsVersion: SWAP_TERMS_VERSION,
  communityAvailable: false,
  communityJoined: false,
  alias: null,
  adultConfirmed: false,
  suspended: false,
  needsYou: 0,
  ...over,
});

const listing = (id: string, over: Partial<SwapListing> = {}): SwapListing => ({
  id,
  ownerLabel: 'Bea',
  ownerKind: 'friend',
  audience: 'friends',
  name: `Piece ${id}`,
  category: 'tops',
  brand: 'Everlane',
  size: 'S',
  condition: 'like_new',
  color: 'white',
  materials: [{ name: 'linen', percentage: 100 }],
  careInstructions: ['Machine wash cold', 'Line dry'],
  originCountry: 'Portugal',
  season: ['spring', 'summer'],
  note: 'Worn twice, a little too big for me.',
  photoPath: `${id}.jpg`,
  listedAt: '2026-10-01T00:00:00Z',
  mine: false,
  ...over,
});

const mine = (id: string, over: Partial<MySwapListing> = {}): MySwapListing => ({
  id,
  itemId: `item-${id}`,
  audience: 'friends',
  status: 'active',
  name: `Mine ${id}`,
  size: 'M',
  condition: 'good',
  photoPath: `${id}.jpg`,
  listedAt: '2026-10-01T00:00:00Z',
  expiresAt: '2099-01-01T00:00:00Z',
  openOffers: 0,
  inAcceptedSwap: false,
  stale: false,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const mounted: renderer.ReactTestRenderer[] = [];

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapListingScreen />);
  });
  mounted.push(tree);
  await settle();
  const text = () => flatten(tree.toJSON());
  const find = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false });
  const has = (label: string) => find(label).length > 0;
  const pressable = (label: string) => {
    const nodes = find(label);
    if (nodes.length !== 1) throw new Error(`Expected one "${label}", found ${nodes.length}`);
    return nodes[0];
  };
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      await node.props.onPress();
    });
    await settle();
  };
  const reroute = async () => {
    await act(async () => {
      tree.update(<SwapListingScreen />);
    });
    await settle();
  };
  return { tree, text, has, pressable, press, reroute };
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = { listingId: 'l1' };
  [mockNavigate, mockGoBack, mockSettings, mockGetListing, mockBrowse, mockMine, mockPropose, mockAccept, mockReport, mockBlock]
    .forEach(m => m.mockReset());
  (markSwapRackDirty as jest.Mock).mockClear();
  mockSettings.mockResolvedValue(settings());
  mockGetListing.mockResolvedValue(listing('l1'));
  mockBrowse.mockResolvedValue({ items: [], nextCursor: null });
  mockMine.mockResolvedValue([mine('m1'), mine('m2')]);
  mockPropose.mockResolvedValue('swap-1');
  mockAccept.mockResolvedValue(undefined);
  mockReport.mockResolvedValue(undefined);
  mockBlock.mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('SwapListingScreen: the piece', () => {
  it('shows a large photo, the name, who is offering it, the facts and the note', async () => {
    const { text, tree } = await render();
    expect(mockGetListing).toHaveBeenCalledWith('l1');
    expect(tree.root.findAllByType(Image)[0].props.source).toEqual({ uri: 'https://signed/l1.jpg' });
    expect(text()).toContain('Piece l1');
    expect(text()).toContain('Bea · Friend');
    expect(text()).toContain('Brand');
    expect(text()).toContain('Everlane');
    expect(text()).toContain('Size');
    expect(text()).toContain('Condition');
    expect(text()).toContain('Like new');
    expect(text()).toContain('Colour');
    expect(text()).toContain('White');
    expect(text()).toContain('100% linen');
    expect(text()).toContain('Machine wash cold, Line dry');
    expect(text()).toContain('Portugal');
    expect(text()).toContain('Spring, Summer');
    expect(text()).toContain('Note from Bea');
    expect(text()).toContain('Worn twice, a little too big for me.');
  });

  it('leaves out facts and a note that are not there', async () => {
    mockGetListing.mockResolvedValue(
      listing('l1', {
        brand: undefined, size: undefined, condition: undefined, color: undefined, materials: undefined,
        careInstructions: undefined, originCountry: undefined, season: undefined, note: undefined,
      }),
    );
    const { text } = await render();
    expect(text()).toContain('Piece l1');
    for (const word of ['Brand', 'Size', 'Condition', 'Colour', 'Materials', 'Care', 'Made in', 'Season', 'Note from']) {
      expect(text()).not.toContain(word);
    }
  });

  it('labels a stranger as a member', async () => {
    mockGetListing.mockResolvedValue(listing('l1', { ownerLabel: 'Velvet Otter', ownerKind: 'member', audience: 'community' }));
    const { text } = await render();
    expect(text()).toContain('Velvet Otter · Member');
  });

  it('shows a skeleton while the piece loads', async () => {
    const gate = deferred<SwapListing>();
    mockGetListing.mockReturnValue(gate.promise);
    const { text, has, tree } = await render();
    expect(text()).not.toContain('Piece l1');
    expect(tree.root.findAll(n => n.type === ('Skeleton' as any)).length).toBeGreaterThan(0);
    expect(has('Offer a swap')).toBe(false);
    await act(async () => {
      gate.resolve(listing('l1'));
    });
    expect(text()).toContain('Piece l1');
  });

  it('goes back from the header', async () => {
    const { press } = await render();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('loads another piece when the route changes, and drops a slow answer for the old one', async () => {
    const slow = deferred<SwapListing>();
    mockGetListing.mockReturnValueOnce(slow.promise);
    const { text, reroute } = await render();
    mockParams = { listingId: 'l2' };
    mockGetListing.mockResolvedValueOnce(listing('l2'));
    await reroute();
    expect(mockGetListing).toHaveBeenLastCalledWith('l2');
    expect(text()).toContain('Piece l2');
    await act(async () => {
      slow.resolve(listing('l1'));
    });
    expect(text()).toContain('Piece l2');
    expect(text()).not.toContain('Piece l1');
  });
});

describe('SwapListingScreen: offering', () => {
  it('offers a swap on someone else’s piece, and opens the thread after sending', async () => {
    const { press, text, has } = await render();
    expect(text()).not.toContain('This is your piece');
    await press('Offer a swap');
    expect(text()).toContain('You’re asking for Piece l1 from Bea.');
    expect(text()).toContain(SWAP_NO_MONEY_LINE);

    await press('Offer Mine m1');
    await press('Send offer');
    expect(mockPropose).toHaveBeenCalledWith(
      expect.objectContaining({ requestListingIds: ['l1'], offerListingIds: ['m1'], clientRef: expect.any(String) }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('SwapThread', { swapId: 'swap-1' });
    expect(has('Send offer')).toBe(false);
  });

  it('does not open the offer sheet, or read the member’s pieces, until Offer a swap is tapped', async () => {
    await render();
    expect(mockMine).not.toHaveBeenCalled();
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('sends a member with nothing open to My pieces', async () => {
    mockMine.mockResolvedValue([]);
    const { press, text } = await render();
    await press('Offer a swap');
    expect(text()).toContain('You don’t have any pieces open to swap yet.');
    await press('Open a piece');
    expect(mockNavigate).toHaveBeenCalledWith('MySwaps', { segment: 'pieces' });
  });

  it('shows "This is your piece" instead of the offer for the member’s own listing', async () => {
    mockGetListing.mockResolvedValue(listing('l1', { mine: true, ownerLabel: 'Me', ownerKind: 'friend' }));
    const { text, has, press } = await render();
    expect(text()).toContain('This is your piece');
    expect(has('Offer a swap')).toBe(false);
    expect(has('Report or block Me')).toBe(false);
    await press('See in My swaps');
    expect(mockNavigate).toHaveBeenCalledWith('MySwaps', { segment: 'pieces' });
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(mockMine).not.toHaveBeenCalled();
  });
});

describe('SwapListingScreen: more from the same person', () => {
  it('shows their other pieces, up to ten, without this one', async () => {
    const others = Array.from({ length: 12 }, (_v, i) => listing(`o${i}`));
    mockBrowse.mockResolvedValue({ items: [listing('l1'), ...others], nextCursor: null });
    const { text, has } = await render();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    expect(mockBrowse).toHaveBeenCalledWith(expect.objectContaining({ scope: 'friends', sameOwnerAs: 'l1' }));
    expect(text()).toContain('More from Bea');
    expect(has('Open Piece o0')).toBe(true);
    expect(has('Open Piece o9')).toBe(true);
    expect(has('Open Piece o10')).toBe(false);
    expect(has('Open Piece l1')).toBe(false);
  });

  it('opens one of them', async () => {
    mockBrowse.mockResolvedValue({ items: [listing('o1')], nextCursor: null });
    const { press } = await render();
    await press('Open Piece o1');
    expect(mockNavigate).toHaveBeenCalledWith('SwapListing', { listingId: 'o1' });
  });

  it('reads the community rack for a stranger’s piece', async () => {
    mockGetListing.mockResolvedValue(listing('l1', { ownerLabel: 'Velvet Otter', ownerKind: 'member', audience: 'community' }));
    await render();
    expect(mockBrowse).toHaveBeenCalledWith(expect.objectContaining({ scope: 'community', sameOwnerAs: 'l1' }));
  });

  it('shows nothing, and says nothing, when there are no other pieces or they cannot be read', async () => {
    const empty = await render();
    expect(empty.text()).not.toContain('More from');

    mockBrowse.mockRejectedValue(new SwapError('swap_rate_limited', 'x', 'browse_day'));
    const failed = await render();
    expect(failed.text()).toContain('Piece l1');
    expect(failed.text()).not.toContain('More from');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('SwapListingScreen: report and block', () => {
  it('opens report and block from the header, and reports the listing', async () => {
    const { press, text } = await render();
    await press('Report or block Bea');
    expect(text()).toContain('Report');
    expect(text()).toContain('Block');
    await press('Report');
    await press('Not as described');
    await press('Submit report');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ refType: 'listing', refId: 'l1', reason: 'not_as_described' }));
  });

  it('goes back after a block, because the piece is gone', async () => {
    const { press } = await render();
    await press('Report or block Bea');
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith('listing', 'l1');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('tells the board its rack changed before going back, so the blocked member’s cards go', async () => {
    const dirty = markSwapRackDirty as jest.Mock;
    const { press } = await render();
    await press('Report or block Bea');
    expect(dirty).not.toHaveBeenCalled();
    await press('Block');
    await press('Block');
    expect(dirty).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(dirty.mock.invocationCallOrder[0]).toBeLessThan(mockGoBack.mock.invocationCallOrder[0]);
  });

  it('does not mark the rack changed when the block fails', async () => {
    mockBlock.mockRejectedValue(new SwapError('offline'));
    const { press } = await render();
    await press('Report or block Bea');
    await press('Block');
    await press('Block');
    expect(markSwapRackDirty).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('reports one of the other pieces by its own id', async () => {
    mockBrowse.mockResolvedValue({ items: [listing('o1', { ownerLabel: 'Bea' })], nextCursor: null });
    const { tree, press } = await render();
    const menus = tree.root.findAll(n => n.props.accessibilityLabel === 'Report or block Bea' && typeof n.props.onPress === 'function', { deep: false });
    expect(menus).toHaveLength(2);
    await act(async () => {
      menus[1].props.onPress();
    });
    await press('Report');
    await press('Spam or unwanted messages');
    await press('Submit report');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ refId: 'o1' }));
  });
});

describe('SwapListingScreen: when the piece or the member’s access is not available', () => {
  it('says "No longer available" with a way back when the piece is gone', async () => {
    mockGetListing.mockRejectedValue(new SwapError('swap_unavailable'));
    const { text, press, has } = await render();
    expect(text()).toContain('No longer available');
    expect(has('Offer a swap')).toBe(false);
    await press('Back to the swap board');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('shows a retry when the piece cannot be loaded, and loads it on Try again', async () => {
    mockGetListing.mockRejectedValueOnce(new SwapError('offline')).mockResolvedValue(listing('l1'));
    const { text, press, has } = await render();
    expect(text()).toContain('Couldn’t load this piece');
    expect(text()).not.toContain('No longer available');
    await press('Try again to load your piece');
    expect(text()).toContain('Piece l1');
    expect(has('Offer a swap')).toBe(true);
  });

  it('asks a guest to sign in and reads nothing', async () => {
    mockSettings.mockRejectedValue(new SwapError('not_authenticated'));
    const { text, press } = await render();
    expect(text()).toContain('Sign in to swap');
    await press('Sign in');
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    expect(mockGetListing).not.toHaveBeenCalled();
  });

  it('says swaps are paused and reads nothing', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    const { text, has } = await render();
    expect(text()).toContain('Swaps are paused');
    expect(text()).toContain(SWAP_PAUSED_MESSAGE);
    expect(has('Offer a swap')).toBe(false);
    expect(mockGetListing).not.toHaveBeenCalled();
  });

  it('opens the terms when they are not accepted, and shows the piece after agreeing', async () => {
    mockSettings
      .mockResolvedValueOnce(settings({ termsCurrent: false, termsAccepted: false }))
      .mockResolvedValue(settings());
    const { text, press } = await render();
    expect(text()).toContain('I agree');
    expect(mockGetListing).not.toHaveBeenCalled();
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Piece l1');
  });

  it('asks access again when the server says the member may no longer swap', async () => {
    mockGetListing.mockRejectedValueOnce(new SwapError('swaps_disabled'));
    mockSettings.mockResolvedValueOnce(settings()).mockResolvedValue(settings({ swapsEnabled: false }));
    const { text } = await render();
    expect(text()).toContain('Swaps are paused');
  });

  it('never logs an error for a failed load', async () => {
    mockGetListing.mockRejectedValue(new Error('boom'));
    const { text } = await render();
    expect(text()).not.toContain('boom');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
