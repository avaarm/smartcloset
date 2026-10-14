import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Image, InputAccessoryView, Linking, Modal, Platform, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockPublish = jest.fn();
const mockUpdateNote = jest.fn();
const mockSettings = jest.fn();
const mockList = jest.fn();
const mockAccept = jest.fn();
const mockOwned = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: (...a: any[]) => mockOwned(...a),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  publishSwapListing: (...a: any[]) => mockPublish(...a),
  updateSwapListingNote: (...a: any[]) => mockUpdateNote(...a),
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  listMySwapListings: (...a: any[]) => mockList(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));

import ListForSwapSheet from '../../src/components/ListForSwapSheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import SwapJoinCommunitySheet from '../../src/components/SwapJoinCommunitySheet';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import SwapTermsSheet from '../../src/components/SwapTermsSheet';
import {
  SWAP_COMMUNITY_SCAN_NOTICE,
  SWAP_NO_MONEY_LINE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS,
  SWAP_TERMS_VERSION,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { ClothingItem } from '../../src/types';
import type { MySwapListing, SwapSettings } from '../../src/types/swap';

type Props = React.ComponentProps<typeof ListForSwapSheet>;

const PHOTO = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/1700000000000.jpg';

const makeItem = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Linen Shirt',
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  brand: 'Everlane',
  size: 'M',
  condition: 'good',
  userImage: PHOTO,
  ...over,
});

const listing = (over: Partial<MySwapListing> = {}): MySwapListing => ({
  id: 'l1',
  itemId: 'item-1',
  audience: 'friends',
  status: 'active',
  name: 'Linen Shirt',
  size: 'M',
  condition: 'good',
  note: 'Runs small',
  photoPath: 'l1.jpg',
  listedAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-11-30T00:00:00Z',
  openOffers: 0,
  inAcceptedSwap: false,
  stale: false,
  ...over,
});

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

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (over: Partial<Props> = {}) => {
  const props: Props = {
    visible: true,
    item: makeItem(),
    onClose: jest.fn(),
    onChanged: jest.fn(),
    onEditPiece: jest.fn(),
    ...over,
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ListForSwapSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ListForSwapSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const find = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false });
  const has = (label: string) => find(label).length > 0;
  const press = async (label: string) => {
    const nodes = find(label);
    if (nodes.length !== 1) throw new Error(`expected one "${label}" button, found ${nodes.length}`);
    await act(async () => {
      await nodes[0].props.onPress();
    });
  };
  const input = () => tree.root.findAllByType(TextInput)[0];
  const type = async (value: string) => {
    await act(async () => {
      input().props.onChangeText(value);
    });
  };
  const chip = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label, { deep: false })[0];
  // Whether the three modals are up, in render order: the form, the join step, the terms.
  const modals = () => tree.root.findAllByType(Modal).map(m => m.props.visible as boolean);
  return { tree, props, text, find, has, press, input, type, update, chip, modals };
};

// On iOS the sheet that is leaving goes first and the next one follows after this long (the component's
// HANDOFF_MS). The run is under fake timers, so a test steps over the wait on purpose.
const HANDOFF_MS = 700;
const settle = async (ms = HANDOFF_MS + 100) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const agree = async (tree: renderer.ReactTestRenderer) => {
  const node = tree.root.find(n => n.props.accessibilityLabel === 'I agree' && typeof n.props.onPress === 'function');
  await act(async () => {
    await node.props.onPress();
  });
};

const notNow = async (tree: renderer.ReactTestRenderer) => {
  const node = tree.root.find(n => n.props.accessibilityLabel === 'Not now' && typeof n.props.onPress === 'function');
  await act(async () => {
    node.props.onPress();
  });
};

const deferred = () => {
  let resolve!: (v?: any) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const realOS = Platform.OS;
let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockPublish.mockReset().mockResolvedValue({ listingId: 'l2' });
  mockUpdateNote.mockReset().mockResolvedValue(undefined);
  mockSettings.mockReset().mockResolvedValue(settings());
  mockList.mockReset().mockResolvedValue([]);
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockOwned.mockReset().mockResolvedValue([]);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
});
afterEach(() => {
  jest.useRealTimers();
  Platform.OS = realOS;
  expect(consoleError).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ListForSwapSheet: the form', () => {
  it('previews what others will see: photo, name, brand and size, condition, and the note as it is typed', async () => {
    const { text, tree, type } = await render();
    expect(text()).toContain('Open to swap');
    expect(text()).toContain('What others will see');
    expect(text()).toContain('Linen Shirt');
    expect(text()).toContain('Everlane, M');
    expect(text()).toContain('Good');
    expect(tree.root.findAllByType(Image).some(i => i.props.source?.uri === PHOTO)).toBe(true);
    expect(text()).not.toContain('Runs small');
    await type('Runs small');
    expect(text()).toContain('Runs small');
  });

  it('says what stays private and carries the no-money line', async () => {
    const { text } = await render();
    expect(text()).toContain('Never what you paid or your private notes.');
    expect(text()).toContain(SWAP_NO_MONEY_LINE);
    expect(text()).not.toContain(SWAP_COMMUNITY_SCAN_NOTICE);
  });

  it('has one single-line note field with a Done return key', async () => {
    const { tree } = await render();
    const fields = tree.root.findAllByType(TextInput);
    expect(fields).toHaveLength(1);
    expect(fields[0].props.multiline).toBeFalsy();
    expect(fields[0].props.returnKeyType).toBe('done');
    expect(fields[0].props.maxLength).toBe(140);
  });

  it('keeps the note to 140 characters', async () => {
    const { type, input, text } = await render();
    await type('x'.repeat(200));
    expect(input().props.value).toHaveLength(140);
    expect(text()).toContain('140/140');
  });

  it('shows no choice of audience when the community is not available, or the server cannot say', async () => {
    const { chip, tree } = await render();
    expect(chip('Community')).toBeUndefined();
    expect(chip('Friends')).toBeUndefined();
    await act(async () => {
      tree.unmount();
    });
    mockSettings.mockRejectedValue(new Error('offline'));
    const second = await render();
    expect(second.chip('Community')).toBeUndefined();
  });

  it('reads the server settings once per opening, and not at all for an edit', async () => {
    await render();
    expect(mockSettings).toHaveBeenCalledTimes(1);
    mockSettings.mockClear();
    await render({ item: undefined, editListing: listing() });
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it('reads nothing while closed', async () => {
    await render({ visible: false });
    await render({ visible: false, item: undefined });
    expect(mockSettings).not.toHaveBeenCalled();
    expect(mockOwned).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('ListForSwapSheet: publishing', () => {
  it('publishes with the audience and the trimmed note, then reports the change and closes', async () => {
    const { type, press, props } = await render();
    await type('  Runs small  ');
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith({ itemId: 'item-1', audience: 'friends', note: 'Runs small' });
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('sends no note when there is none', async () => {
    const { press } = await render();
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith({ itemId: 'item-1', audience: 'friends', note: undefined });
  });

  it('shows "Getting your photo ready" while the photo is prepared, and ignores a second tap', async () => {
    const d = deferred();
    mockPublish.mockReturnValue(d.promise);
    const { text, find, props } = await render();
    // not awaited: the call is still running
    const node = find('Open to swap')[0];
    await act(async () => {
      node.props.onPress();
    });
    expect(text()).toContain('Getting your photo ready');
    expect(find('Open to swap')[0].props.disabled).toBe(true);
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve({ listingId: 'l2' });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens a piece that already has a listing the same way (the server replaces the old one)', async () => {
    const { press } = await render({ item: makeItem({ id: 'item-9' }) });
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-9' }));
  });
});

describe('ListForSwapSheet: when publishing fails', () => {
  it.each([
    ['photo_rejected with people in it', new SwapError('photo_rejected', 'photo_rejected', undefined, 'people'), 'Photos with people in them can’t be shared with the community.'],
    ['photo_rejected for another reason', new SwapError('photo_rejected', 'photo_rejected', undefined, 'unsafe'), 'That photo can’t be shared with the community.'],
    ['moderation_unavailable', new SwapError('moderation_unavailable'), 'We couldn’t check that photo right now. Please try again in a moment.'],
    ['an offline failure', { message: 'Network request failed' }, 'You seem to be offline. Check your connection and try again.'],
    ['a limit', new SwapError('swap_listing_limit'), 'You have the most pieces open to swap. Withdraw one to add another.'],
    ['an unexpected failure', new Error('boom'), 'Couldn’t open this piece to swap. Please try again.'],
  ])('shows a plain message and a Retry for %s', async (_n, failure, message) => {
    mockPublish.mockRejectedValue(failure);
    const { press, text, has, props } = await render();
    await press('Open to swap');
    expect(text()).toContain(message);
    expect(has('Retry')).toBe(true);
    expect(has('Replace photo')).toBe(false);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it('shows what is missing for listing_incomplete, with the way to fix it and a Retry', async () => {
    mockPublish.mockRejectedValue(new SwapError('listing_incomplete', 'listing_incomplete', 'size,condition'));
    const { press, text, has } = await render();
    await press('Open to swap');
    expect(text()).toContain('Add a size and condition first.');
    expect(has('Retry')).toBe(true);
    expect(has('Edit piece')).toBe(true);
  });

  it('says a photo is needed for listing_incomplete about the photo', async () => {
    mockPublish.mockRejectedValue(new SwapError('listing_incomplete', 'listing_incomplete', 'photo'));
    const { press, text } = await render();
    await press('Open to swap');
    expect(text()).toContain('Add a photo first.');
  });

  it('repeats the same call on Retry', async () => {
    mockPublish.mockRejectedValueOnce(new SwapError('moderation_unavailable')).mockResolvedValue({ listingId: 'l2' });
    const { press, type, props, text } = await render();
    await type('Runs small');
    await press('Open to swap');
    expect(text()).toContain('We couldn’t check that photo');
    await press('Retry');
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish.mock.calls[1][0]).toEqual(mockPublish.mock.calls[0][0]);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it.each(['unsupported_image', 'photo_too_large'] as const)('offers "Replace photo" and no retry for %s', async code => {
    mockPublish.mockRejectedValue(new SwapError(code));
    const { press, has, text, props } = await render();
    await press('Open to swap');
    expect(text()).toContain(code === 'photo_too_large' ? 'That photo is too large.' : 'That photo can’t be used for a swap.');
    expect(has('Retry')).toBe(false);
    expect(has('Open to swap')).toBe(false);
    await press('Replace photo');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onEditPiece).toHaveBeenCalledWith(props.item);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it('offers no Replace photo when the host gave no way to edit the piece, and still no retry', async () => {
    mockPublish.mockRejectedValue(new SwapError('unsupported_image'));
    const { press, has, text } = await render({ onEditPiece: undefined });
    await press('Open to swap');
    expect(text()).toContain('That photo can’t be used for a swap.');
    expect(has('Replace photo')).toBe(false);
    expect(has('Retry')).toBe(false);
  });

  it('shows the hold message for listing_held, with no retry and nothing to press but Close', async () => {
    mockPublish.mockRejectedValue(new SwapError('listing_held'));
    const { press, text, has, props } = await render();
    await press('Open to swap');
    expect(text()).toContain('This piece can’t be listed right now. Email support if you think this is a mistake.');
    expect(has('Retry')).toBe(false);
    expect(has('Open to swap')).toBe(false);
    expect(has('Replace photo')).toBe(false);
    await press('Email support');
    expect(Linking.openURL).toHaveBeenCalledWith(SUPPORT_MAILTO);
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('goes back to "Open to swap" when the note is changed after a failure', async () => {
    mockPublish.mockRejectedValue(new SwapError('text_not_allowed', 'text_not_allowed', 'note', 'payment'));
    const { press, text, has, type } = await render();
    await type('venmo me');
    await press('Open to swap');
    expect(text()).toContain('Swaps are item for item. Please don’t mention payments or gift cards.');
    expect(has('Retry')).toBe(true);
    await type('Runs small');
    expect(text()).not.toContain('Please don’t mention payments');
    expect(has('Open to swap')).toBe(true);
    expect(has('Retry')).toBe(false);
  });
});

describe('ListForSwapSheet: what the piece needs', () => {
  it.each([
    ['no photo', undefined],
    ['a photo only on the phone', 'file:///var/mobile/photo.jpg'],
  ])('disables Open to swap and says so for %s', async (_n, userImage) => {
    const { find, text, press, props } = await render({ item: makeItem({ userImage }) });
    expect(text()).toContain('Add a photo of the piece first');
    expect(find('Open to swap')[0].props.disabled).toBe(true);
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    expect(mockPublish).not.toHaveBeenCalled();
    await press('Add a photo');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onEditPiece).toHaveBeenCalledWith(props.item);
  });

  it('suggests, but does not require, a size and condition for friends', async () => {
    const { find, text, press, props } = await render({ item: makeItem({ size: undefined, condition: undefined }) });
    expect(text()).toContain('Add size and condition so friends know what they are getting');
    expect(find('Open to swap')[0].props.disabled).toBeFalsy();
    await press('Edit piece');
    expect(props.onEditPiece).toHaveBeenCalledTimes(1);
    await act(async () => {
      props.onClose();
    });
  });

  it('says nothing about size and condition when the piece has both', async () => {
    const { text, has } = await render();
    expect(text()).not.toContain('Add size and condition');
    expect(has('Edit piece')).toBe(false);
  });
});

describe('ListForSwapSheet: the community', () => {
  const community = (over: Partial<SwapSettings> = {}) => mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: true, ...over }));

  it('shows Friends (selected) and Community when the server says the community is available', async () => {
    community();
    const { chip } = await render();
    expect(chip('Friends').props.accessibilityState.selected).toBe(true);
    expect(chip('Community').props.accessibilityState.selected).toBe(false);
  });

  it('publishes for the community after it is picked, and shows the photo-check notice', async () => {
    community();
    const { chip, press, text } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    expect(chip('Community').props.accessibilityState.selected).toBe(true);
    expect(text()).toContain(SWAP_COMMUNITY_SCAN_NOTICE);
    expect(text()).toContain('People who aren’t your friends see only your alias.');
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith({ itemId: 'item-1', audience: 'community', note: undefined });
  });

  it('can go back to Friends, and the notice goes away', async () => {
    community();
    const { chip, text } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    await act(async () => {
      chip('Friends').props.onPress();
    });
    expect(chip('Friends').props.accessibilityState.selected).toBe(true);
    expect(text()).not.toContain(SWAP_COMMUNITY_SCAN_NOTICE);
  });

  it('opens the join step before the member has joined, in place of the form', async () => {
    community({ communityJoined: false });
    const { chip, text, tree, modals } = await render();
    expect(tree.root.findByType(SwapJoinCommunitySheet).props.visible).toBe(false);
    await act(async () => {
      await chip('Community').props.onPress();
    });
    await settle();
    expect(tree.root.findByType(SwapJoinCommunitySheet).props.visible).toBe(true);
    expect(modals()).toEqual([false, true, false]);
    expect(text()).toContain('Join community swaps');
    expect(text()).not.toContain('What others will see');
    // the sheet stays the owner of the typed note and the piece while the step is up
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('returns to the form with Community picked once the member has joined', async () => {
    community({ communityJoined: false });
    const { chip, text, tree, press, modals } = await render();
    await act(async () => {
      await chip('Community').props.onPress();
    });
    await settle();
    await act(async () => {
      tree.root.findByType(SwapJoinCommunitySheet).props.onJoined();
    });
    await settle();
    expect(tree.root.findByType(SwapJoinCommunitySheet).props.visible).toBe(false);
    expect(modals()).toEqual([true, false, false]);
    expect(text()).toContain('What others will see');
    expect(chip('Community').props.accessibilityState.selected).toBe(true);
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ audience: 'community' }));
  });

  it('keeps Friends and the typed note when the join step is closed', async () => {
    community({ communityJoined: false });
    const { chip, tree, input, type } = await render();
    await type('Runs small');
    await act(async () => {
      await chip('Community').props.onPress();
    });
    await settle();
    await act(async () => {
      tree.root.findByType(SwapJoinCommunitySheet).props.onClose();
    });
    await settle();
    expect(chip('Friends').props.accessibilityState.selected).toBe(true);
    expect(input().props.value).toBe('Runs small');
  });

  it('requires a size and condition for the community, and says so', async () => {
    community();
    const { chip, find, text } = await render({ item: makeItem({ size: undefined }) });
    expect(find('Open to swap')[0].props.disabled).toBeFalsy();
    await act(async () => {
      chip('Community').props.onPress();
    });
    expect(text()).toContain('Community swaps need a size and condition');
    expect(find('Open to swap')[0].props.disabled).toBe(true);
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('shows account_too_new in plain words', async () => {
    community();
    mockPublish.mockRejectedValue(new SwapError('account_too_new'));
    const { chip, press, text } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    await press('Open to swap');
    expect(text()).toContain('Community swaps unlock two days after you create your account.');
  });
});

describe('ListForSwapSheet: Community before the swap terms are agreed', () => {
  const unagreed = settings({
    communityAvailable: true,
    communityJoined: false,
    termsAccepted: false,
    termsCurrent: false,
  });
  const noTerms = (over: Partial<SwapSettings> = {}) => mockSettings.mockResolvedValue({ ...unagreed, ...over });
  const pick = async (chip: (label: string) => any, label = 'Community') => {
    await act(async () => {
      await chip(label).props.onPress();
    });
  };

  it('asks for the terms first, and only then opens the join step', async () => {
    noTerms();
    const { chip, tree, modals } = await render();
    expect(chip('Community')).toBeDefined();
    await pick(chip);
    await settle();
    expect(modals()).toEqual([false, false, true]);
    expect(tree.root.findByType(SwapJoinCommunitySheet).props.visible).toBe(false);
    expect(mockAccept).not.toHaveBeenCalled();
    await agree(tree);
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith();
    await settle();
    expect(modals()).toEqual([false, true, false]);
    expect(tree.root.findByType(SwapTermsSheet).props.visible).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not ask again when Community is picked again after the join step was closed', async () => {
    noTerms();
    const { chip, tree, modals } = await render();
    await pick(chip);
    await settle();
    await agree(tree);
    await settle();
    // two reads so far: the one when the sheet opened, and the one that checked the terms version
    expect(mockSettings).toHaveBeenCalledTimes(2);
    await act(async () => {
      tree.root.findByType(SwapJoinCommunitySheet).props.onClose();
    });
    await settle();
    expect(modals()).toEqual([true, false, false]);
    await pick(chip);
    await settle();
    expect(modals()).toEqual([false, true, false]);
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });

  it('comes back to the form with Friends selected and the note kept on "Not now", and asks again next time', async () => {
    noTerms();
    const { chip, tree, input, type, text, modals } = await render();
    await type('Runs small');
    await pick(chip);
    await settle();
    await notNow(tree);
    await settle();
    expect(modals()).toEqual([true, false, false]);
    expect(text()).toContain('What others will see');
    expect(chip('Friends').props.accessibilityState.selected).toBe(true);
    expect(chip('Community').props.accessibilityState.selected).toBe(false);
    expect(input().props.value).toBe('Runs small');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
    await pick(chip);
    await settle();
    expect(modals()).toEqual([false, false, true]);
  });

  it.each([
    ['a newer server version', '2099-01', SWAP_UPDATE_REQUIRED_MESSAGE],
    ['an older server version', '1999-01', SWAP_SERVER_BEHIND_MESSAGE],
  ])('says so, and records nothing, when the terms are %s', async (_n, serverVersion, message) => {
    noTerms({ currentTermsVersion: serverVersion });
    const { chip, text, modals, has } = await render();
    await pick(chip);
    await settle();
    expect(text()).toContain(message);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
    expect(modals()).toEqual([true, false, false]);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(has('Open to swap')).toBe(false);
    // choosing Friends clears the message and the way on for friends is open again
    await pick(chip, 'Friends');
    expect(text()).not.toContain(message);
    expect(has('Open to swap')).toBe(true);
  });

  it('reads the terms version once for two quick taps on Community', async () => {
    const base = { ...unagreed };
    const d = deferred();
    mockSettings.mockReset().mockResolvedValueOnce(base).mockReturnValueOnce(d.promise).mockResolvedValue(base);
    const { chip, modals } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    await act(async () => {
      chip('Community').props.onPress();
    });
    expect(mockSettings).toHaveBeenCalledTimes(2);
    await act(async () => {
      d.resolve(base);
    });
    await settle();
    expect(modals()).toEqual([false, false, true]);
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });

  it('opens nothing when Friends is chosen while the terms version is still being read', async () => {
    const base = { ...unagreed };
    const d = deferred();
    mockSettings.mockReset().mockResolvedValueOnce(base).mockReturnValueOnce(d.promise).mockResolvedValue(base);
    const { chip, modals, text } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    await pick(chip, 'Friends');
    await act(async () => {
      d.resolve(base);
    });
    await settle();
    expect(modals()).toEqual([true, false, false]);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
    expect(chip('Friends').props.accessibilityState.selected).toBe(true);
  });

  it('opens nothing when the sheet is closed while the terms version is still being read', async () => {
    const base = { ...unagreed };
    const d = deferred();
    mockSettings.mockReset().mockResolvedValueOnce(base).mockReturnValueOnce(d.promise).mockResolvedValue(base);
    const { chip, modals, update } = await render();
    await act(async () => {
      chip('Community').props.onPress();
    });
    await update({ visible: false });
    await act(async () => {
      d.resolve(base);
    });
    await settle();
    expect(modals()).toEqual([false, false, false]);
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

describe('ListForSwapSheet: the swap terms', () => {
  it('asks for the terms in place of the form, then publishes again once they are agreed', async () => {
    mockPublish.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue({ listingId: 'l2' });
    const { press, text, tree, props, type } = await render();
    await type('Runs small');
    await press('Open to swap');
    await settle();
    for (const section of SWAP_TERMS.sections) expect(text()).toContain(section.heading);
    expect(text()).not.toContain('What others will see');
    expect(mockAccept).not.toHaveBeenCalled();
    await agree(tree);
    expect(mockAccept).toHaveBeenCalledWith();
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish.mock.calls[1][0]).toEqual({ itemId: 'item-1', audience: 'friends', note: 'Runs small' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('comes back to the form with the note kept, and does not publish, when the terms are declined', async () => {
    mockPublish.mockRejectedValue(new SwapError('swap_terms_required'));
    const { press, text, tree, input, type } = await render();
    await type('Runs small');
    await press('Open to swap');
    await settle();
    await notNow(tree);
    await settle();
    expect(text()).toContain('What others will see');
    expect(input().props.value).toBe('Runs small');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it('does not ask for agreement to terms the server does not hold', async () => {
    mockPublish.mockRejectedValue(new SwapError('swap_terms_required'));
    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2099-01' }));
    const { press, text, has } = await render();
    await press('Open to swap');
    expect(text()).toContain(SWAP_UPDATE_REQUIRED_MESSAGE);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(has('Retry')).toBe(false);
  });
});

describe('ListForSwapSheet: one modal at a time', () => {
  const termsRequired = () =>
    mockPublish.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue({ listingId: 'l2' });
  const community = (over: Partial<SwapSettings> = {}) =>
    mockSettings.mockResolvedValue(settings({ communityAvailable: true, communityJoined: false, ...over }));

  beforeEach(() => {
    Platform.OS = 'ios';
  });

  it('shows the form on its own when it opens, and hides it at once when it closes', async () => {
    const { modals, update } = await render();
    expect(modals()).toEqual([true, false, false]);
    await update({ visible: false });
    expect(modals()).toEqual([false, false, false]);
    await update({ visible: true });
    expect(modals()).toEqual([true, false, false]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('hides the form first and shows the terms only after the wait', async () => {
    termsRequired();
    const { press, modals } = await render();
    expect(modals()).toEqual([true, false, false]);
    await press('Open to swap');
    // the form is leaving; the terms are not up yet
    expect(modals()).toEqual([false, false, false]);
    await settle(HANDOFF_MS - 1);
    expect(modals()).toEqual([false, false, false]);
    await settle(1);
    expect(modals()).toEqual([false, false, true]);
  });

  it('hides the terms first and shows the form again only after the wait, on "Not now"', async () => {
    termsRequired();
    const { press, modals, tree } = await render();
    await press('Open to swap');
    await settle();
    expect(modals()).toEqual([false, false, true]);
    await notNow(tree);
    expect(modals()).toEqual([false, false, false]);
    await settle(HANDOFF_MS - 1);
    expect(modals()).toEqual([false, false, false]);
    await settle(1);
    expect(modals()).toEqual([true, false, false]);
  });

  it('waits between the form and the join step, and between the join step and the form', async () => {
    community();
    const { chip, modals, tree } = await render();
    await act(async () => {
      await chip('Community').props.onPress();
    });
    expect(modals()).toEqual([false, false, false]);
    await settle(HANDOFF_MS - 1);
    expect(modals()).toEqual([false, false, false]);
    await settle(1);
    expect(modals()).toEqual([false, true, false]);
    await act(async () => {
      tree.root.findByType(SwapJoinCommunitySheet).props.onJoined();
    });
    expect(modals()).toEqual([false, false, false]);
    await settle(HANDOFF_MS);
    expect(modals()).toEqual([true, false, false]);
  });

  it('waits between the terms and the join step when Community is picked before the terms are agreed', async () => {
    community({ termsAccepted: false, termsCurrent: false });
    const { chip, modals, tree } = await render();
    await act(async () => {
      await chip('Community').props.onPress();
    });
    await settle();
    expect(modals()).toEqual([false, false, true]);
    await agree(tree);
    expect(modals()).toEqual([false, false, false]);
    await settle(HANDOFF_MS - 1);
    expect(modals()).toEqual([false, false, false]);
    await settle(1);
    expect(modals()).toEqual([false, true, false]);
  });

  it('waits the same way for the terms of an edited note', async () => {
    mockUpdateNote.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue(undefined);
    const { press, modals } = await render({ item: undefined, editListing: listing() });
    await press('Save');
    expect(modals()).toEqual([false, false, false]);
    await settle();
    expect(modals()).toEqual([false, false, true]);
  });

  it('leaves nothing shown, and no timer, when the sheet is closed during the wait', async () => {
    termsRequired();
    const { press, modals, update } = await render();
    await press('Open to swap');
    expect(jest.getTimerCount()).toBe(1);
    await update({ visible: false });
    expect(modals()).toEqual([false, false, false]);
    expect(jest.getTimerCount()).toBe(0);
    await settle(3000);
    expect(modals()).toEqual([false, false, false]);
  });

  it('opens straight to the form again when it is reopened during the wait', async () => {
    termsRequired();
    const { press, modals, update, text } = await render();
    await press('Open to swap');
    await update({ visible: false });
    await update({ visible: true });
    expect(modals()).toEqual([true, false, false]);
    expect(text()).toContain('What others will see');
    expect(jest.getTimerCount()).toBe(0);
    await settle(3000);
    expect(modals()).toEqual([true, false, false]);
  });

  it('shows the form at once when the piece changes while the form is waiting to come back', async () => {
    termsRequired();
    const { press, modals, tree, update } = await render();
    await press('Open to swap');
    await settle();
    await notNow(tree);
    expect(modals()).toEqual([false, false, false]);
    await update({ item: makeItem({ id: 'item-2', name: 'Wool Coat' }) });
    expect(modals()).toEqual([true, false, false]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind when it unmounts during the wait', async () => {
    termsRequired();
    const { press, tree } = await render();
    await press('Open to swap');
    expect(jest.getTimerCount()).toBe(1);
    await act(async () => {
      tree.unmount();
    });
    expect(jest.getTimerCount()).toBe(0);
    await settle(3000);
  });

  it('does not open the terms when the sheet is closed while the server is still being asked about them', async () => {
    termsRequired();
    const base = settings();
    const d = deferred();
    mockSettings.mockReset().mockResolvedValueOnce(base).mockReturnValueOnce(d.promise).mockResolvedValue(base);
    const { find, modals, update } = await render();
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    await update({ visible: false });
    await act(async () => {
      d.resolve(base);
    });
    await settle();
    expect(modals()).toEqual([false, false, false]);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('swaps at once on Android, which has no such wait', async () => {
    Platform.OS = 'android';
    termsRequired();
    const { press, modals, tree } = await render();
    await press('Open to swap');
    expect(modals()).toEqual([false, false, true]);
    await notNow(tree);
    expect(modals()).toEqual([true, false, false]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('swaps at once on Android between the form and the join step', async () => {
    Platform.OS = 'android';
    community();
    const { chip, modals } = await render();
    await act(async () => {
      await chip('Community').props.onPress();
    });
    expect(modals()).toEqual([false, true, false]);
  });
});

describe('ListForSwapSheet: closing', () => {
  it('reports the change but does nothing else when the answer arrives after it was closed', async () => {
    const d = deferred();
    mockPublish.mockReturnValue(d.promise);
    const { find, update, props, text } = await render();
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    await update({ visible: false });
    await act(async () => {
      d.resolve({ listingId: 'l2' });
    });
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(text()).toBe('');
  });

  it('drops a failure that arrives after it was closed', async () => {
    const d = deferred();
    mockPublish.mockReturnValue(d.promise);
    const { find, update, text } = await render();
    await act(async () => {
      find('Open to swap')[0].props.onPress();
    });
    await update({ visible: false });
    await act(async () => {
      d.reject(new SwapError('moderation_unavailable'));
    });
    await update({ visible: true });
    expect(text()).not.toContain('We couldn’t check that photo');
    expect(text()).toContain('Open to swap');
  });

  it('starts fresh each time it opens', async () => {
    mockPublish.mockRejectedValue(new SwapError('moderation_unavailable'));
    const { press, type, update, text, input } = await render();
    await type('Runs small');
    await press('Open to swap');
    expect(text()).toContain('We couldn’t check that photo');
    await update({ visible: false });
    await update({ visible: true });
    expect(text()).not.toContain('We couldn’t check that photo');
    expect(input().props.value).toBe('');
  });

  it('closes from Cancel', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ListForSwapSheet: editing a note', () => {
  it('shows only the note and Save', async () => {
    const { text, has, tree, input } = await render({ item: undefined, editListing: listing() });
    expect(text()).toContain('Edit note');
    expect(text()).toContain('Linen Shirt');
    expect(input().props.value).toBe('Runs small');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(has('Save')).toBe(true);
    expect(has('Open to swap')).toBe(false);
    expect(has('Friends')).toBe(false);
    expect(text()).not.toContain('What others will see');
  });

  it('saves the trimmed note, then reports the change and closes', async () => {
    const { type, press, props } = await render({ item: undefined, editListing: listing() });
    await type('  Fits like a 10  ');
    await press('Save');
    expect(mockUpdateNote).toHaveBeenCalledWith('l1', 'Fits like a 10');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('can clear the note', async () => {
    const { type, press } = await render({ item: undefined, editListing: listing() });
    await type('');
    await press('Save');
    expect(mockUpdateNote).toHaveBeenCalledWith('l1', '');
  });

  it('keeps the note to 140 characters', async () => {
    const { type, input } = await render({ item: undefined, editListing: listing() });
    await type('y'.repeat(300));
    expect(input().props.value).toHaveLength(140);
  });

  it('shows a refused note in plain words and keeps what was typed', async () => {
    mockUpdateNote.mockRejectedValue(new SwapError('text_not_allowed', 'text_not_allowed', 'note', 'payment'));
    const { type, press, text, input, props } = await render({ item: undefined, editListing: listing() });
    await type('send money');
    await press('Save');
    expect(text()).toContain('Swaps are item for item. Please don’t mention payments or gift cards.');
    expect(input().props.value).toBe('send money');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('asks for the terms and saves again after they are agreed', async () => {
    mockUpdateNote.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue(undefined);
    const { press, tree, props } = await render({ item: undefined, editListing: listing() });
    await press('Save');
    await settle();
    await agree(tree);
    expect(mockUpdateNote).toHaveBeenCalledTimes(2);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Saving as busy and ignores a second tap', async () => {
    const d = deferred();
    mockUpdateNote.mockReturnValue(d.promise);
    const { find } = await render({ item: undefined, editListing: listing() });
    await act(async () => {
      find('Save')[0].props.onPress();
    });
    await act(async () => {
      find('Save')[0].props.onPress();
    });
    expect(mockUpdateNote).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve();
    });
  });
});

describe('ListForSwapSheet: choosing a piece first', () => {
  const owned = [
    makeItem({ id: 'a', name: 'Linen Shirt' }),
    makeItem({ id: 'b', name: 'Wool Coat', userImage: PHOTO.replace('1700000000000', '2') }),
    makeItem({ id: 'c', name: 'Already Open' }),
    makeItem({ id: 'd', name: 'No Photo', userImage: undefined }),
    makeItem({ id: 'e', name: 'Phone Photo', userImage: 'file:///var/mobile/x.jpg' }),
    makeItem({ id: 'f', name: 'Wishlist Dress', isWishlist: true }),
  ];

  beforeEach(() => {
    mockOwned.mockResolvedValue(owned);
    mockList.mockResolvedValue([listing({ id: 'lc', itemId: 'c' })]);
  });

  it('lists owned pieces with a closet photo that are not already listed', async () => {
    const { text, has } = await render({ item: undefined });
    expect(text()).toContain('Choose a piece');
    expect(has('Choose Linen Shirt')).toBe(true);
    expect(has('Choose Wool Coat')).toBe(true);
    for (const name of ['Already Open', 'No Photo', 'Phone Photo', 'Wishlist Dress']) expect(has(`Choose ${name}`)).toBe(false);
  });

  it('shows the form for the piece that was chosen, publishes it, and can go back', async () => {
    const { press, text } = await render({ item: undefined });
    await press('Choose Wool Coat');
    expect(text()).toContain('What others will see');
    expect(text()).toContain('Wool Coat');
    await press('Choose a different piece');
    expect(text()).toContain('Choose a piece');
    await press('Choose Wool Coat');
    await press('Open to swap');
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'b' }));
  });

  it('explains when there is nothing to open', async () => {
    mockOwned.mockResolvedValue([makeItem({ userImage: undefined })]);
    const { text } = await render({ item: undefined });
    expect(text()).toContain('Nothing to open right now.');
  });

  it('says so, with Try again, when the closet cannot be read', async () => {
    mockOwned.mockRejectedValueOnce({ message: 'Network request failed' }).mockResolvedValue(owned);
    const { text, press, has } = await render({ item: undefined });
    expect(text()).toContain('You seem to be offline.');
    await press('Try again');
    expect(has('Choose Linen Shirt')).toBe(true);
  });

  it('does not read the closet when a piece or a listing was given', async () => {
    await render();
    await render({ item: undefined, editListing: listing() });
    expect(mockOwned).not.toHaveBeenCalled();
  });
});

describe('ListForSwapSheet: keyboard rules (the checks keyboardScreens makes of a lifted sheet)', () => {
  const ancestorsOf = (node: renderer.ReactTestInstance) => {
    const out: renderer.ReactTestInstance[] = [];
    for (let n = node.parent; n; n = n.parent) out.push(n);
    return out;
  };

  it.each([
    ['the form', {}],
    ['the note editor', { item: undefined, editListing: listing() }],
  ])('keeps the field of %s above the keyboard, with a Return key that closes it', async (_n, over) => {
    const { tree } = await render(over as Partial<Props>);
    const fields = tree.root.findAllByType(TextInput);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(ancestorsOf(field).some(a => a.type === KeyboardLift)).toBe(true);
      expect(field.props.returnKeyType).toBe('done');
      expect(field.props.blurOnSubmit).not.toBe(false);
      expect(field.props.inputAccessoryViewID).toBeUndefined();
    }
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
  });
});

describe('ListForSwapSheet: source rules', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ListForSwapSheet.tsx'), 'utf8');

  it('has no Done bar (its field is single-line) and no navigation or storage of its own', () => {
    expect(source).not.toMatch(/<KeyboardDoneBar/);
    expect(source).not.toMatch(/keyboardDoneProps/);
    expect(source).not.toMatch(/@react-navigation|useNavigation|navigate\(/);
    expect(source).not.toMatch(/AsyncStorage/);
    expect(source).not.toMatch(/console\.error/);
  });

  it('lifts its fields above the keyboard', () => {
    expect(source).toMatch(/<KeyboardLift>/);
  });
});
