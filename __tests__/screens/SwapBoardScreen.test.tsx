import 'react-native';
import React from 'react';
import { FlatList, InputAccessoryView, Linking, RefreshControl, ScrollView, Share, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockParams: any = {};
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockFocusCallbacks = new Set<() => void>();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => {
      mockFocusCallbacks.add(cb);
      useEffect(cb, [cb]);
    },
  };
});

const mockSettings = jest.fn();
const mockBrowse = jest.fn();
const mockAccept = jest.fn();
const mockJoin = jest.fn();
const mockBlocks = jest.fn();
const mockReport = jest.fn();
const mockBlock = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  browseSwapListings: (...a: any[]) => mockBrowse(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
  joinSwapCommunity: (...a: any[]) => mockJoin(...a),
  listSwapBlocks: (...a: any[]) => mockBlocks(...a),
  unblockSwapMember: jest.fn(),
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

import SwapBoardScreen, { markSwapRackDirty } from '../../src/screens/SwapBoardScreen';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import {
  SWAP_COMMUNITY_SCAN_NOTICE,
  SWAP_PAUSED_MESSAGE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS_VERSION,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { SwapListing, SwapSettings } from '../../src/types/swap';

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
  ownerLabel: 'Ann',
  ownerKind: 'friend',
  audience: 'friends',
  name: `Piece ${id}`,
  category: 'tops',
  brand: 'Zara',
  size: 'M',
  condition: 'good',
  photoPath: `${id}.jpg`,
  listedAt: `2026-10-0${(Number(id.replace(/\D/g, '')) % 9) + 1}T00:00:00Z`,
  mine: false,
  ...over,
});

const page = (items: SwapListing[], nextCursor: { ts: string; id: string } | null = null) => ({ items, nextCursor });

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
    tree = renderer.create(<SwapBoardScreen />);
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
  const searchField = () => tree.root.findAllByType(TextInput)[0];
  const list = () => tree.root.findByType(FlatList);
  const endReached = async () => {
    await act(async () => {
      list().props.onEndReached({ distanceFromEnd: 0 });
    });
    await settle();
  };
  const refreshList = async () => {
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    await settle();
  };
  const lastQuery = () => mockBrowse.mock.calls[mockBrowse.mock.calls.length - 1][0];
  return { tree, text, has, pressable, press, searchField, list, endReached, refreshList, lastQuery };
};

let errorSpy: jest.SpyInstance;
let openUrl: jest.SpyInstance;
let shareSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = {};
  mockFocusCallbacks.clear();
  [mockNavigate, mockGoBack, mockSettings, mockBrowse, mockAccept, mockJoin, mockBlocks, mockReport, mockBlock].forEach(m => m.mockReset());
  mockSettings.mockResolvedValue(settings());
  mockBrowse.mockResolvedValue(page([listing('1'), listing('2')]));
  mockAccept.mockResolvedValue(undefined);
  mockJoin.mockResolvedValue(undefined);
  mockBlocks.mockResolvedValue([]);
  mockReport.mockResolvedValue(undefined);
  mockBlock.mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('SwapBoardScreen: who may swap (every access state)', () => {
  it('shows a skeleton while the member’s access is still loading, and asks for no pieces yet', async () => {
    const gate = deferred<SwapSettings>();
    mockSettings.mockReturnValue(gate.promise);
    const { tree, text } = await render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(text()).not.toContain('Swaps are paused');
  });

  it('asks a guest to sign in, and sends them to SignIn', async () => {
    mockSettings.mockRejectedValue(new SwapError('not_authenticated'));
    const { text, press, has } = await render();
    expect(text()).toContain('Sign in to swap');
    expect(has('My swaps')).toBe(false);
    expect(has('Swap menu')).toBe(false);
    await press('Sign in');
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('says swaps are paused when the server switch is off', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    const { text } = await render();
    expect(text()).toContain('Swaps are paused');
    expect(text()).toContain(SWAP_PAUSED_MESSAGE);
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('says swaps are not available yet when the server has no swap functions', async () => {
    mockSettings.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    const { text } = await render();
    expect(text()).toContain('Swaps aren’t available yet in this version');
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('tells a suspended member plainly, offers Email support, and keeps their history reachable', async () => {
    mockSettings.mockResolvedValue(settings({ suspended: true }));
    const { tree, text, press, has } = await render();
    expect(text()).toContain('Swapping is paused on your account');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(has('My swaps')).toBe(true);
    await press('Email support');
    expect(openUrl).toHaveBeenCalledWith(SUPPORT_MAILTO);
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('asks for an update when the server’s terms are newer than this build, and records nothing', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false, currentTermsVersion: '2099-01' }));
    const { text, has } = await render();
    expect(text()).toContain(SWAP_UPDATE_REQUIRED_MESSAGE);
    expect(text()).not.toContain('I agree');
    expect(has('Read the terms')).toBe(false);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('says swaps are being updated when this build is ahead of the server', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false, currentTermsVersion: '2020-01' }));
    const { text } = await render();
    expect(text()).toContain(SWAP_SERVER_BEHIND_MESSAGE);
    expect(text()).not.toContain('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('opens the terms by itself when they are not accepted, with an empty state behind', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false }));
    const { text } = await render();
    expect(text()).toContain('Swap terms');
    expect(text()).toContain('I agree');
    expect(text()).toContain('Read the swap terms to get started');
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('records agreement from the sheet, then opens the board', async () => {
    mockSettings
      .mockResolvedValueOnce(settings({ termsCurrent: false, termsAccepted: false }))
      .mockResolvedValue(settings());
    const { press, has, text } = await render();
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept.mock.calls[0]).toEqual([]);
    expect(has('Open Piece 1')).toBe(true);
    expect(text()).not.toContain('Read the swap terms to get started');
  });

  it('lets the member close the terms and open them again from the empty state', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false }));
    const { press, text } = await render();
    await press('Not now');
    expect(text()).not.toContain('I agree');
    expect(text()).toContain('Read the swap terms to get started');
    await press('Read the terms');
    expect(text()).toContain('I agree');
  });

  it('shows a retry when the member’s access cannot be read (offline)', async () => {
    mockSettings.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(settings());
    const { text, press, has } = await render();
    expect(text()).toContain('Couldn\'t load your swaps');
    await press('Try again to load your swaps');
    expect(has('Open Piece 1')).toBe(true);
  });

  it('asks access again when the server says the member may no longer swap', async () => {
    mockBrowse.mockRejectedValueOnce(new SwapError('swaps_disabled'));
    mockSettings.mockResolvedValueOnce(settings()).mockResolvedValue(settings({ swapsEnabled: false }));
    const { text } = await render();
    expect(text()).toContain('Swaps are paused');
  });
});

describe('SwapBoardScreen: the rack', () => {
  it('shows a skeleton while the first page loads, then the pieces', async () => {
    const gate = deferred<ReturnType<typeof page>>();
    mockBrowse.mockReturnValue(gate.promise);
    const { has, text, tree, searchField } = await render();
    expect(text()).not.toContain('Piece 1');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading swaps').length).toBeGreaterThan(0);
    expect(searchField()).toBeTruthy();

    await act(async () => {
      gate.resolve(page([listing('1'), listing('2')]));
    });
    expect(has('Open Piece 1')).toBe(true);
    expect(has('Open Piece 2')).toBe(true);
    expect(text()).toContain('Zara, M');
    expect(text()).toContain('Ann · Friend');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading swaps')).toHaveLength(0);
  });

  it('asks the friends rack for the first 30, with no cursor and no filters', async () => {
    await render();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    expect(mockBrowse).toHaveBeenCalledWith({
      scope: 'friends',
      category: undefined,
      conditions: undefined,
      q: undefined,
      friendId: undefined,
      cursor: null,
      limit: 30,
    });
  });

  it('opens a piece from its card', async () => {
    const { press } = await render();
    await press('Open Piece 2');
    expect(mockNavigate).toHaveBeenCalledWith('SwapListing', { listingId: '2' });
  });

  it('goes back from the header', async () => {
    const { press } = await render();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('SwapBoardScreen: the grid and its menus', () => {
  const several = () => [
    listing('1', { ownerLabel: 'Ann' }),
    listing('2', { ownerLabel: 'Bea' }),
  ];

  it('opens report and block for the member behind a card, and reloads the rack after a block', async () => {
    mockBrowse.mockResolvedValue(page(several()));
    const { press, text, has } = await render();
    expect(mockBrowse).toHaveBeenCalledTimes(1);

    await press('Report or block Bea');
    expect(text()).toContain('Report');
    expect(text()).toContain('Block');
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith('listing', '2');
    expect(mockBrowse).toHaveBeenCalledTimes(2);
    expect(has('Open Piece 1')).toBe(true);
  });

  it('reports a listing with its id and the owner’s label on the sheet', async () => {
    mockBrowse.mockResolvedValue(page(several()));
    const { press, text } = await render();
    await press('Report or block Ann');
    expect(text()).toContain('Ann');
    await press('Report');
    await press('Not as described');
    await press('Submit report');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ refType: 'listing', refId: '1', reason: 'not_as_described' }));
  });

  it('opens My swaps from the header, with a dot only when something needs the member', async () => {
    const quiet = await render();
    expect(quiet.pressable('My swaps').props.accessibilityValue).toEqual({ text: 'Nothing waiting' });
    await quiet.press('My swaps');
    expect(mockNavigate).toHaveBeenCalledWith('MySwaps');

    mockSettings.mockResolvedValue(settings({ needsYou: 2 }));
    const busy = await render();
    expect(busy.pressable('My swaps').props.accessibilityValue).toEqual({ text: '2 need you' });
  });

  it('has a menu with the guidelines, the blocked swap members and Email support', async () => {
    const { press, text, has } = await render();
    expect(has('Swap guidelines')).toBe(false);
    await press('Swap menu');
    expect(has('Swap guidelines')).toBe(true);
    expect(has('Blocked swap members')).toBe(true);
    expect(has('Email support')).toBe(true);

    await press('Swap guidelines');
    expect(text()).toContain('Swap guidelines');
    expect(text()).toContain('Swapping safely');
    expect(has('Blocked swap members')).toBe(false);
  });

  it('opens the blocked swap members from the menu', async () => {
    mockBlocks.mockResolvedValue([{ ref: 'r1', label: 'Velvet Otter', blockedAt: '2026-10-01' }]);
    const { press, text } = await render();
    await press('Swap menu');
    await press('Blocked swap members');
    expect(mockBlocks).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Velvet Otter');
  });

  it('emails support from the menu', async () => {
    const { press } = await render();
    await press('Swap menu');
    await press('Email support');
    expect(openUrl).toHaveBeenCalledWith(SUPPORT_MAILTO);
  });

  it('closes the menu from its backdrop or by tapping the button again', async () => {
    const { press, has } = await render();
    await press('Swap menu');
    await press('Close menu');
    expect(has('Swap guidelines')).toBe(false);
    await press('Swap menu');
    await press('Swap menu');
    expect(has('Swap guidelines')).toBe(false);
  });
});

describe('SwapBoardScreen: empty boards', () => {
  it('invites a member with no friend pieces to open one, find friends or invite someone', async () => {
    mockBrowse.mockResolvedValue(page([]));
    const { text, press } = await render();
    expect(text()).toContain('Nothing open to swap yet');
    expect(text()).toContain('When a friend opens a piece to swap, it shows up here. Open one of yours to get things started.');

    await press('Open a piece');
    expect(mockNavigate).toHaveBeenLastCalledWith('MySwaps', { segment: 'pieces' });
    await press('Find friends');
    expect(mockNavigate).toHaveBeenLastCalledWith('Friends');
  });

  it('shares a plain invitation with no account data', async () => {
    mockBrowse.mockResolvedValue(page([]));
    const { press } = await render();
    await press('Invite a friend');
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const shared = shareSpy.mock.calls[0][0] as { message: string };
    expect(Object.keys(shared)).toEqual(['message']);
    expect(shared.message).toMatch(/SmartCloset/);
    expect(shared.message).not.toMatch(/@|https?:|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('stays quiet if the share sheet fails', async () => {
    mockBrowse.mockResolvedValue(page([]));
    shareSpy.mockRejectedValue(new Error('no share'));
    const { press } = await render();
    await press('Invite a friend');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('says the community is quiet, and offers to open a piece', async () => {
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true, alias: 'Velvet Otter' }));
    mockBrowse.mockImplementation(async (q: any) => (q.scope === 'community' ? page([]) : page([listing('1')])));
    const { press, text } = await render();
    await press('Community');
    expect(text()).toContain('Quiet in here');
    expect(text()).toContain('Be the first to open a piece for the community.');
    await press('Open a piece');
    expect(mockNavigate).toHaveBeenLastCalledWith('MySwaps', { segment: 'pieces' });
  });

  it('names the friend when a friend has nothing open', async () => {
    mockParams = { friendId: 'f1', friendName: 'Bea' };
    mockBrowse.mockResolvedValue(page([]));
    const { text, has } = await render();
    expect(text()).toContain('Nothing open to swap yet');
    expect(text()).toContain('Bea hasn’t opened a piece to swap yet.');
    expect(has('Invite a friend')).toBe(false);
  });
});

describe('SwapBoardScreen: Friends and Community', () => {
  it('has no segment unless the server offers the community', async () => {
    const { has } = await render();
    expect(has('Friends')).toBe(false);
    expect(has('Community')).toBe(false);
  });

  it('shows the segment when the community is available, starting on Friends', async () => {
    mockSettings.mockResolvedValue(settings({ communityAvailable: true }));
    const { pressable } = await render();
    expect(pressable('Friends').props.accessibilityState.selected).toBe(true);
    expect(pressable('Community').props.accessibilityState.selected).toBe(false);
  });

  it('opens the join step when a member who has not joined picks Community, and stays on Friends', async () => {
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: false }));
    const { press, text, pressable, lastQuery } = await render();
    await press('Community');
    expect(text()).toContain('Join community swaps');
    expect(pressable('Friends').props.accessibilityState.selected).toBe(true);
    expect(lastQuery().scope).toBe('friends');
    expect(mockBrowse).toHaveBeenCalledTimes(1);
  });

  it('moves to the community rack once the member has joined', async () => {
    mockSettings.mockResolvedValueOnce(settings({ communityAvailable: true, communityJoined: false }));
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true, alias: 'Velvet Otter' }));
    mockBrowse.mockImplementation(async (q: any) =>
      q.scope === 'community'
        ? page([listing('9', { ownerLabel: 'Velvet Otter', ownerKind: 'member', audience: 'community' })])
        : page([listing('1')]),
    );
    const { tree, press, pressable, has, lastQuery } = await render();
    await press('Community');

    const alias = tree.root.findAll(n => n.props.accessibilityLabel === 'Alias' && typeof n.props.onChangeText === 'function', { deep: false })[0];
    await act(async () => {
      alias.props.onChangeText('Velvet Otter');
    });
    await press('I am 18 or older');
    await press(SWAP_COMMUNITY_SCAN_NOTICE);
    await press('Join');

    expect(mockJoin).toHaveBeenCalledWith({ alias: 'Velvet Otter', adult: true, photoScanOk: true });
    expect(pressable('Community').props.accessibilityState.selected).toBe(true);
    expect(lastQuery().scope).toBe('community');
    expect(has('Open Piece 9')).toBe(true);
  });

  it('browses the community rack for a member who has joined', async () => {
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true, alias: 'Velvet Otter' }));
    mockBrowse.mockImplementation(async (q: any) =>
      q.scope === 'community'
        ? page([listing('9', { ownerLabel: 'Velvet Otter', ownerKind: 'member', audience: 'community' })])
        : page([listing('1')]),
    );
    const { press, text, pressable, has, lastQuery } = await render();
    await press('Community');
    expect(lastQuery()).toEqual(expect.objectContaining({ scope: 'community', cursor: null, limit: 30 }));
    expect(pressable('Community').props.accessibilityState.selected).toBe(true);
    expect(has('Open Piece 9')).toBe(true);
    expect(has('Open Piece 1')).toBe(false);
    expect(text()).toContain('Velvet Otter · Member');

    await press('Friends');
    expect(lastQuery().scope).toBe('friends');
    expect(has('Open Piece 1')).toBe(true);
  });

  it('falls back to friends if the server stops offering the community', async () => {
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true }));
    mockBrowse.mockImplementation(async (q: any) => {
      if (q.scope === 'community') throw new SwapError('community_unavailable');
      return page([listing('1')]);
    });
    const { press, pressable, has } = await render();
    await press('Community');
    expect(pressable('Friends').props.accessibilityState.selected).toBe(true);
    expect(has('Open Piece 1')).toBe(true);
  });

  it('shows one friend’s pieces on a friend’s board, with no segment even when the community is open', async () => {
    mockParams = { friendId: 'f1', friendName: 'Bea' };
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true }));
    const { text, has, lastQuery } = await render();
    expect(text()).toContain('Bea’s swaps');
    expect(lastQuery()).toEqual(expect.objectContaining({ scope: 'friends', friendId: 'f1' }));
    expect(has('Friends')).toBe(false);
    expect(has('Community')).toBe(false);
  });

  it('is titled Swaps without a friend', async () => {
    const { text } = await render();
    expect(text()).toContain('Swaps');
    expect(text()).not.toContain('’s swaps');
  });
});

describe('SwapBoardScreen: filters', () => {
  it('re-queries with a category, and clears it from All or by tapping it again', async () => {
    const { press, lastQuery, pressable } = await render();
    await press('Tops');
    expect(lastQuery()).toEqual(expect.objectContaining({ category: 'tops', cursor: null }));
    expect(pressable('Tops').props.accessibilityState.selected).toBe(true);
    expect(mockBrowse).toHaveBeenCalledTimes(2);

    await press('Shoes');
    expect(lastQuery().category).toBe('shoes');
    await press('All');
    expect(lastQuery().category).toBeUndefined();
    await press('Bags');
    await press('Bags');
    expect(lastQuery().category).toBeUndefined();
  });

  it('re-queries with the chosen conditions, in a fixed order', async () => {
    const { press, lastQuery } = await render();
    await press('Good');
    expect(lastQuery().conditions).toEqual(['good']);
    await press('New with tags');
    expect(lastQuery().conditions).toEqual(['new_with_tags', 'good']);
    await press('Good');
    expect(lastQuery().conditions).toEqual(['new_with_tags']);
    await press('New with tags');
    expect(lastQuery().conditions).toBeUndefined();
  });

  it('searches by name or brand when the search is submitted, not on every key', async () => {
    const { searchField, lastQuery } = await render();
    await act(async () => {
      searchField().props.onChangeText('  linen ');
    });
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    await act(async () => {
      searchField().props.onSubmitEditing();
    });
    await settle();
    expect(mockBrowse).toHaveBeenCalledTimes(2);
    expect(lastQuery().q).toBe('linen');
  });

  it('does not search again when the same words are submitted twice', async () => {
    const { searchField } = await render();
    await act(async () => {
      searchField().props.onChangeText('linen');
    });
    await act(async () => {
      searchField().props.onSubmitEditing();
    });
    await settle();
    await act(async () => {
      searchField().props.onSubmitEditing();
    });
    await settle();
    expect(mockBrowse).toHaveBeenCalledTimes(2);
  });

  it('takes the words in the box along when a chip changes', async () => {
    const { searchField, press, lastQuery } = await render();
    await act(async () => {
      searchField().props.onChangeText('silk');
    });
    await press('Tops');
    expect(lastQuery()).toEqual(expect.objectContaining({ q: 'silk', category: 'tops' }));
  });

  it('clears the search with its button', async () => {
    const { searchField, press, lastQuery } = await render();
    await act(async () => {
      searchField().props.onChangeText('silk');
    });
    await act(async () => {
      searchField().props.onSubmitEditing();
    });
    await settle();
    expect(lastQuery().q).toBe('silk');
    await press('Clear search');
    expect(lastQuery().q).toBeUndefined();
    expect(searchField().props.value).toBe('');
  });

  it('shows "No matches" with a way to clear when the filters find nothing', async () => {
    mockBrowse.mockImplementation(async (q: any) => (q.category ? page([]) : page([listing('1')])));
    const { press, text, has, searchField } = await render();
    await press('Shoes');
    expect(text()).toContain('No matches');
    expect(text()).not.toContain('Nothing open to swap yet');
    await press('Clear filters');
    expect(has('Open Piece 1')).toBe(true);
    expect(searchField().props.value).toBe('');
  });

  it('gives the search a Return key that closes the keyboard, and keeps the list tappable under it', async () => {
    const { searchField, list } = await render();
    expect(searchField().props.returnKeyType).toBe('search');
    expect(searchField().props.blurOnSubmit).not.toBe(false);
    expect(searchField().props.multiline).toBeFalsy();
    expect(searchField().props.maxLength).toBe(40);

    const props = list().props;
    expect(props.keyboardShouldPersistTaps).toBe('handled');
    expect(props.keyboardDismissMode).toBe('interactive');
    expect(props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('needs no Done bar: the search field is not multi-line', async () => {
    const { tree } = await render();
    expect(tree.root.findAllByType(InputAccessoryView).filter(b => b.props.nativeID === KEYBOARD_DONE_ID)).toHaveLength(0);
  });

  it('keeps the category and condition chips in scrollers that run sideways', async () => {
    const { tree } = await render();
    const sideways = tree.root.findAllByType(ScrollView).filter(s => s.props.horizontal);
    expect(sideways.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores a slow answer for filters the member has already changed', async () => {
    const slow = deferred<ReturnType<typeof page>>();
    mockBrowse.mockReset();
    mockBrowse.mockResolvedValueOnce(page([listing('1')]));
    const { press, has } = await render();
    mockBrowse.mockReturnValueOnce(slow.promise).mockResolvedValue(page([listing('5')]));
    await press('Tops');
    await press('Shoes');
    expect(has('Open Piece 5')).toBe(true);
    await act(async () => {
      slow.resolve(page([listing('7')]));
    });
    expect(has('Open Piece 7')).toBe(false);
    expect(has('Open Piece 5')).toBe(true);
  });
});

describe('SwapBoardScreen: paging', () => {
  const cursor = { ts: '2026-10-02T00:00:00Z', id: '2' };

  it('asks for the next 30 with the cursor when the end is reached, and adds them below', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1'), listing('2')], cursor));
    mockBrowse.mockResolvedValueOnce(page([listing('3'), listing('4')], null));
    const { endReached, has, lastQuery } = await render();
    await endReached();
    expect(mockBrowse).toHaveBeenCalledTimes(2);
    expect(lastQuery()).toEqual(expect.objectContaining({ cursor, limit: 30, scope: 'friends' }));
    for (const id of ['1', '2', '3', '4']) expect(has(`Open Piece ${id}`)).toBe(true);
  });

  it('stops asking when there is no next page', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1')], null));
    const { endReached } = await render();
    await endReached();
    await endReached();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
  });

  it('asks only once for a page the list asks for twice', async () => {
    const gate = deferred<ReturnType<typeof page>>();
    mockBrowse.mockResolvedValueOnce(page([listing('1')], cursor)).mockReturnValueOnce(gate.promise);
    const { list } = await render();
    await act(async () => {
      list().props.onEndReached({ distanceFromEnd: 0 });
      list().props.onEndReached({ distanceFromEnd: 0 });
    });
    expect(mockBrowse).toHaveBeenCalledTimes(2);
    await act(async () => {
      gate.resolve(page([listing('3')], null));
    });
  });

  it('does not show the same piece twice if two pages overlap', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1'), listing('2')], cursor));
    mockBrowse.mockResolvedValueOnce(page([listing('2'), listing('3')], null));
    const { endReached, tree } = await render();
    await endReached();
    const opens = tree.root.findAll(n => n.props.accessibilityLabel === 'Open Piece 2' && typeof n.props.onPress === 'function', { deep: false });
    expect(opens).toHaveLength(1);
  });

  it('offers a retry when the next page fails, and keeps what is on screen', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1')], cursor));
    mockBrowse.mockRejectedValueOnce(new SwapError('offline'));
    mockBrowse.mockResolvedValueOnce(page([listing('3')], null));
    const { endReached, press, has, text } = await render();
    await endReached();
    expect(text()).toContain('Couldn’t load more. Try again');
    expect(has('Open Piece 1')).toBe(true);

    await endReached();
    expect(mockBrowse).toHaveBeenCalledTimes(2);

    await press('Couldn’t load more. Try again');
    expect(mockBrowse).toHaveBeenCalledTimes(3);
    expect(has('Open Piece 3')).toBe(true);
    expect(text()).not.toContain('Couldn’t load more');
  });

  it('starts over from the first page after a filter change, dropping the cursor', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1')], cursor));
    const { press, lastQuery } = await render();
    await press('Tops');
    expect(lastQuery().cursor).toBeNull();
  });
});

describe('SwapBoardScreen: when loading goes wrong', () => {
  it('shows the full load error with nothing on screen, and loads the rack on Try again', async () => {
    mockBrowse.mockRejectedValueOnce(new SwapError('offline')).mockResolvedValue(page([listing('1')]));
    const { text, press, has } = await render();
    expect(text()).toContain('Couldn\'t load your swaps');
    expect(text()).not.toContain('Nothing open to swap yet');
    await press('Try again to load your swaps');
    expect(has('Open Piece 1')).toBe(true);
    expect(text()).not.toContain('Couldn\'t load your swaps');
  });

  it('keeps the pieces and adds a banner when a refresh fails', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1')]));
    const { refreshList, text, has, press } = await render();
    mockBrowse.mockRejectedValueOnce(new SwapError('offline')).mockResolvedValue(page([listing('1'), listing('2')]));
    await refreshList();
    expect(text()).toContain('Couldn\'t load your swaps');
    expect(has('Open Piece 1')).toBe(true);

    await press('Try again to load your swaps');
    expect(text()).not.toContain('Couldn\'t load your swaps');
    expect(has('Open Piece 2')).toBe(true);
  });

  it('replaces the pieces on a pull to refresh', async () => {
    mockBrowse.mockResolvedValueOnce(page([listing('1')]));
    const { refreshList, has } = await render();
    mockBrowse.mockResolvedValueOnce(page([listing('2')]));
    await refreshList();
    expect(has('Open Piece 1')).toBe(false);
    expect(has('Open Piece 2')).toBe(true);
  });

  it('says how long to wait when the member is going too fast, and how long when they browsed too much', async () => {
    mockBrowse.mockRejectedValueOnce(new SwapError('swap_rate_limited', 'x', 'browse_day'));
    const first = await render();
    expect(first.text()).toContain('You’ve browsed a lot today. Please try again tomorrow.');
    expect(first.text()).not.toContain('Couldn\'t load your swaps');

    mockBrowse.mockRejectedValueOnce(new SwapError('swap_rate_limited', 'x', 'propose_day'));
    const second = await render();
    expect(second.text()).toContain('You’re going a bit fast. Please wait a moment and try again.');
  });

  it('never logs an error for a failed load', async () => {
    mockBrowse.mockRejectedValue(new Error('boom'));
    const { text } = await render();
    expect(text()).toContain('Couldn\'t load your swaps');
    expect(text()).not.toContain('boom');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('SwapBoardScreen: coming back to the board', () => {
  const refocus = async () => {
    await act(async () => {
      mockFocusCallbacks.forEach(cb => cb());
    });
    await settle();
  };

  it('does not read the rack again when the member comes back within a moment', async () => {
    const { has } = await render();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    await refocus();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    expect(has('Open Piece 1')).toBe(true);
  });

  it('reads the first page again quietly after a while, keeping the pieces on screen', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { has, text } = await render();
    clock.mockReturnValue(now + 31000);
    mockBrowse.mockResolvedValueOnce(page([listing('1'), listing('8')]));
    await refocus();
    expect(mockBrowse).toHaveBeenCalledTimes(2);
    expect(has('Open Piece 8')).toBe(true);
    expect(text()).not.toContain('Loading');
  });

  it('says nothing when the quiet read fails', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { has, text } = await render();
    clock.mockReturnValue(now + 31000);
    mockBrowse.mockRejectedValueOnce(new SwapError('offline'));
    await refocus();
    expect(has('Open Piece 1')).toBe(true);
    expect(text()).not.toContain('Couldn\'t load your swaps');
  });

  describe('after a block made on a piece’s own screen', () => {
    it('reads the rack again at once, even within a moment, and drops the blocked member’s cards', async () => {
      mockBrowse.mockResolvedValueOnce(page([listing('1', { ownerLabel: 'Ann' }), listing('2', { ownerLabel: 'Bea' })]));
      const { has } = await render();
      expect(mockBrowse).toHaveBeenCalledTimes(1);
      expect(has('Open Piece 2')).toBe(true);

      mockBrowse.mockResolvedValueOnce(page([listing('1', { ownerLabel: 'Ann' })]));
      markSwapRackDirty();
      await refocus();
      expect(mockBrowse).toHaveBeenCalledTimes(2);
      expect(has('Open Piece 1')).toBe(true);
      expect(has('Open Piece 2')).toBe(false);

      // The flag is used up by that read.
      await refocus();
      expect(mockBrowse).toHaveBeenCalledTimes(2);
    });

    it('replaces a first read that is still on its way instead of waiting for it', async () => {
      const first = deferred<ReturnType<typeof page>>();
      mockBrowse.mockReturnValueOnce(first.promise);
      mockBrowse.mockResolvedValueOnce(page([listing('1', { ownerLabel: 'Ann' })]));
      const { has } = await render();
      expect(mockBrowse).toHaveBeenCalledTimes(1);

      markSwapRackDirty();
      await refocus();
      expect(mockBrowse).toHaveBeenCalledTimes(2);
      expect(has('Open Piece 1')).toBe(true);

      // The older answer still lists the blocked member and is dropped.
      await act(async () => {
        first.resolve(page([listing('1', { ownerLabel: 'Ann' }), listing('2', { ownerLabel: 'Bea' })]));
      });
      await settle();
      expect(has('Open Piece 2')).toBe(false);
    });

    it('does not read twice when the flag was set before the board had loaded', async () => {
      markSwapRackDirty();
      const { has } = await render();
      expect(mockBrowse).toHaveBeenCalledTimes(1);
      expect(has('Open Piece 1')).toBe(true);
      await refocus();
      expect(mockBrowse).toHaveBeenCalledTimes(1);
    });
  });
});
