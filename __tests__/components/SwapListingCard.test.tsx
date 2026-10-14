import 'react-native';
import React from 'react';
import { Alert, Linking, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockList = jest.fn();
const mockWithdraw = jest.fn();
const mockRenew = jest.fn();
const mockPublish = jest.fn();
const mockSettings = jest.fn();
const mockAccept = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockSession = jest.fn();
const mockSheet = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
  },
}));
jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: jest.fn(async () => []),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  listMySwapListings: (...a: any[]) => mockList(...a),
  withdrawSwapListing: (...a: any[]) => mockWithdraw(...a),
  renewSwapListing: (...a: any[]) => mockRenew(...a),
  publishSwapListing: (...a: any[]) => mockPublish(...a),
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));
// The sheet has its own tests; here it is a stub that records the props the card gives it.
jest.mock('../../src/components/ListForSwapSheet', () => ({
  ...jest.requireActual('../../src/components/ListForSwapSheet'),
  __esModule: true,
  default: (props: any) => {
    mockSheet(props);
    return null;
  },
}));

import SwapListingCard from '../../src/components/SwapListingCard';
import { HELD_TEXT } from '../../src/components/ListForSwapSheet';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import { SWAP_TERMS, SWAP_TERMS_VERSION, SWAP_UPDATE_REQUIRED_MESSAGE } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { ClothingItem } from '../../src/types';
import type { MySwapListing, SwapSettings } from '../../src/types/swap';

type Props = React.ComponentProps<typeof SwapListingCard>;

const PHOTO = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/u1/1700000000000.jpg';

const makeItem = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Linen Shirt',
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
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
  termsAccepted: false,
  termsCurrent: false,
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
    item: makeItem(),
    onEditPiece: jest.fn(),
    onOpenSwaps: jest.fn(),
    onSignIn: jest.fn(),
    ...over,
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapListingCard {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapListingCard {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const find = (label: string) =>
    // deep: false, so the wrappers React Native puts around a Pressable count as one button
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false });
  const has = (label: string) => find(label).length > 0;
  const press = async (label: string) => {
    const nodes = find(label);
    if (nodes.length !== 1) throw new Error(`expected one "${label}" button, found ${nodes.length}`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  return { tree, props, text, find, has, press, update };
};

const lastSheet = () => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];

/** Taps a button of the confirmation the card just put up. */
const confirmWith = async (label: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls[(Alert.alert as jest.Mock).mock.calls.length - 1];
  const button = call[2].find((b: any) => b.text === label);
  await act(async () => {
    await button.onPress();
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

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockWithdraw.mockReset().mockResolvedValue(undefined);
  mockRenew.mockReset().mockResolvedValue(undefined);
  mockPublish.mockReset().mockResolvedValue({ listingId: 'l2' });
  mockSettings.mockReset().mockResolvedValue(settings());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockInvoke.mockReset().mockResolvedValue({ data: null, error: null });
  mockSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  mockSheet.mockReset();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('SwapListingCard: a guest', () => {
  it('shows the sign-in line, calls onSignIn, and makes no call but the session check', async () => {
    mockSession.mockResolvedValue({ data: { session: null } });
    mockList.mockImplementation(jest.requireActual('../../src/services/swapService').listMySwapListings);
    const { text, press, props } = await render();
    expect(text()).toContain('Sign in to swap');
    expect(text()).not.toContain('Open to swap');
    await press('Sign in to swap');
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it('is a guest when the list call says not_authenticated', async () => {
    mockList.mockRejectedValue(new SwapError('not_authenticated'));
    const { has } = await render();
    expect(has('Sign in to swap')).toBe(true);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('SwapListingCard: loading, errors, and when it stays quiet', () => {
  it('shows a placeholder while the answer is on its way, with no buttons', async () => {
    const d = deferred();
    mockList.mockReturnValue(d.promise);
    const { has, text, tree } = await render();
    expect(text()).toContain('Swap');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading swap status').length).toBeGreaterThan(0);
    expect(has('Open to swap')).toBe(false);
    expect(has('Sign in to swap')).toBe(false);
    await act(async () => {
      d.resolve([]);
    });
    expect(has('Open to swap')).toBe(true);
  });

  it.each([
    ['the server switch being off', new SwapError('swaps_disabled')],
    ['a server without swap functions', { message: 'Could not find the function', code: 'PGRST202' }],
  ])('renders nothing for %s, and logs nothing', async (_n, failure) => {
    mockList.mockRejectedValue(failure);
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it.each([
    ['offline', { message: 'Network request failed' }],
    ['an unexpected failure', new Error('boom')],
  ])('shows "Couldn\'t load swap status" with Try again for %s', async (_n, failure) => {
    mockList.mockRejectedValue(failure);
    const { text, press, has } = await render();
    expect(text()).toContain("Couldn't load swap status");
    expect(has('Open to swap')).toBe(false);
    mockList.mockResolvedValue([listing()]);
    await press('Try again');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain("Couldn't load swap status");
    expect(has('Withdraw')).toBe(true);
  });

  it('renders nothing, and reads nothing, for a wishlist piece', async () => {
    const { tree } = await render({ item: makeItem({ isWishlist: true }) });
    expect(tree.toJSON()).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('drops an answer that arrives after the card went away', async () => {
    const d = deferred();
    mockList.mockReturnValue(d.promise);
    const { tree } = await render();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      d.resolve([listing()]);
    });
    // afterEach checks that nothing was logged (no "state update on an unmounted component")
    expect(mockSheet).not.toHaveBeenCalled();
  });
});

describe('SwapListingCard: a piece that is not open to swap', () => {
  it('offers "Open to swap" and opens the sheet for this piece', async () => {
    const { has, press, props } = await render();
    expect(has('Open to swap')).toBe(true);
    expect(lastSheet().visible).toBe(false);
    await press('Open to swap');
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().item).toBe(props.item);
    expect(lastSheet().editListing).toBeUndefined();
  });

  it('closes the sheet again, keeping what it showed while it slides away', async () => {
    const { press, props } = await render();
    await press('Open to swap');
    await act(async () => {
      lastSheet().onClose();
    });
    expect(lastSheet().visible).toBe(false);
    expect(lastSheet().item).toBe(props.item);
  });

  it('reloads after the sheet reports a change, and shows the new listing', async () => {
    const { press, text } = await render();
    await press('Open to swap');
    mockList.mockResolvedValue([listing({ note: 'Runs small' })]);
    await act(async () => {
      lastSheet().onChanged();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Runs small');
  });

  it('sends the sheet\'s "edit the piece" shortcut to onEditPiece', async () => {
    const { press, props } = await render();
    await press('Open to swap');
    await act(async () => {
      lastSheet().onEditPiece(props.item);
    });
    expect(props.onEditPiece).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no photo', undefined],
    ['a photo that is only on the phone', 'file:///var/mobile/photo.jpg'],
    ['a photo from a shop website', 'https://shop.example.com/shirt.jpg'],
  ])('disables "Open to swap" with %s, and says why with a way to fix it', async (_n, userImage) => {
    const { find, text, press, props } = await render({ item: makeItem({ userImage }) });
    const [button] = find('Open to swap');
    expect(button.props.disabled).toBe(true);
    expect(text()).toContain('Add a photo of the piece first');
    await press('Add a photo');
    expect(props.onEditPiece).toHaveBeenCalledTimes(1);
  });

  it('accepts a signed link to the closet photo as a photo', async () => {
    const signed = 'https://x.supabase.co/storage/v1/object/sign/wardrobe-images/u1/1.jpg?t=x';
    const { find, text } = await render({ item: makeItem({ userImage: signed }) });
    expect(find('Open to swap')[0].props.disabled).toBeFalsy();
    expect(text()).not.toContain('Add a photo of the piece first');
  });

  it('ignores listings of other pieces', async () => {
    mockList.mockResolvedValue([listing({ id: 'x', itemId: 'item-2' }), listing({ id: 'y', itemId: null })]);
    const { has } = await render();
    expect(has('Open to swap')).toBe(true);
    expect(has('Withdraw')).toBe(false);
  });
});

describe('SwapListingCard: open to swap', () => {
  it('shows the audience, the note, and Edit note and Withdraw', async () => {
    mockList.mockResolvedValue([listing({ note: 'Runs small' })]);
    const { text, has } = await render();
    expect(text()).toContain('Friends');
    expect(text()).toContain('Open to swap');
    expect(text()).toContain('Runs small');
    expect(has('Edit note')).toBe(true);
    expect(has('Withdraw')).toBe(true);
    // the way in is gone: the piece is already open
    expect(has('Open to swap')).toBe(false);
    expect(has('Update')).toBe(false);
    expect(has('Renew')).toBe(false);
  });

  it('labels a community listing', async () => {
    mockList.mockResolvedValue([listing({ audience: 'community' })]);
    const { text } = await render();
    expect(text()).toContain('Community');
  });

  it('opens the note editor for this listing', async () => {
    const mine = listing({ note: 'Runs small' });
    mockList.mockResolvedValue([mine]);
    const { press } = await render();
    await press('Edit note');
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().editListing).toEqual(mine);
    expect(lastSheet().item).toBeUndefined();
  });

  it('counts offers waiting and links to My swaps', async () => {
    mockList.mockResolvedValue([listing({ openOffers: 2 })]);
    const { text, press, props } = await render();
    expect(text()).toContain('2 offers waiting');
    await press('See swaps');
    expect(props.onOpenSwaps).toHaveBeenCalledTimes(1);
  });

  it('says "1 offer waiting" for one', async () => {
    mockList.mockResolvedValue([listing({ openOffers: 1 })]);
    const { text } = await render();
    expect(text()).toContain('1 offer waiting');
    expect(text()).not.toContain('1 offers');
  });

  it('asks before withdrawing, and withdraws only on confirmation', async () => {
    mockList.mockResolvedValueOnce([listing()]).mockResolvedValue([]);
    const { press, has } = await render();
    await press('Withdraw');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockWithdraw).not.toHaveBeenCalled();
    await confirmWith('Withdraw');
    expect(mockWithdraw).toHaveBeenCalledWith('l1');
    // then it reads the listings again and offers to open the piece
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(has('Open to swap')).toBe(true);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    mockList.mockResolvedValue([listing()]);
    const { press, has } = await render();
    await press('Withdraw');
    const call = (Alert.alert as jest.Mock).mock.calls[0];
    expect(call[2].find((b: any) => b.text === 'Cancel').onPress).toBeUndefined();
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(has('Withdraw')).toBe(true);
  });

  it('warns that offers end when some are waiting', async () => {
    mockList.mockResolvedValue([listing({ openOffers: 1 })]);
    const { press } = await render();
    await press('Withdraw');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/offers waiting for it end/);
  });

  it('shows why a withdraw failed and reads the listings again when the server moved on', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValue(new SwapError('item_reserved'));
    const { press, text } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(text()).toContain('That piece is locked into a swap right now.');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('uses plain words for an offline failure', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValue({ message: 'Network request failed' });
    const { press, text } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(text()).toContain('You seem to be offline.');
  });

  it('hides itself if swaps are switched off while it is open', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValue(new SwapError('swaps_disabled'));
    const { press, tree } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(tree.toJSON()).toBeNull();
  });

  it('ignores a second tap while an action is running', async () => {
    mockList.mockResolvedValue([listing()]);
    const d = deferred();
    mockWithdraw.mockReturnValue(d.promise);
    const { press, find } = await render();
    await press('Withdraw');
    // not awaited: the action is still running
    const confirm = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === 'Withdraw');
    await act(async () => {
      confirm.onPress();
    });
    expect(find('Withdraw')[0].props.disabled).toBe(true);
    expect(find('Edit note')[0].props.disabled).toBe(true);
    await act(async () => {
      confirm.onPress();
    });
    await act(async () => {
      d.resolve();
    });
    expect(mockWithdraw).toHaveBeenCalledTimes(1);
  });
});

describe('SwapListingCard: the piece changed since it was opened', () => {
  it('shows the nudge and republishes with the same audience and note', async () => {
    mockList.mockResolvedValueOnce([listing({ stale: true, audience: 'community', note: 'Runs small' })]).mockResolvedValue([listing({ id: 'l2' })]);
    const { text, press, has } = await render();
    expect(text()).toContain('You changed this piece since you opened it.');
    await press('Update');
    expect(mockPublish).toHaveBeenCalledWith({ itemId: 'item-1', audience: 'community', note: 'Runs small' });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(has('Update')).toBe(false);
  });

  it('shows no nudge for a listing that is current', async () => {
    mockList.mockResolvedValue([listing()]);
    const { text, has } = await render();
    expect(text()).not.toContain('You changed this piece');
    expect(has('Update')).toBe(false);
  });

  it.each([
    ['unsupported_image', 'Replace the photo of the piece'],
    ['photo_too_large', 'That photo is too large'],
  ] as const)('offers a different photo when Update fails with %s', async (code, message) => {
    mockList.mockResolvedValue([listing({ stale: true })]);
    mockPublish.mockRejectedValue(new SwapError(code));
    const { press, text, props } = await render();
    await press('Update');
    expect(text()).toContain(message);
    await press('Replace photo');
    expect(props.onEditPiece).toHaveBeenCalledTimes(1);
  });

  it('reads the listings again when the piece is edited', async () => {
    mockList.mockResolvedValue([listing()]);
    const { update, props } = await render();
    expect(mockList).toHaveBeenCalledTimes(1);
    await update({ item: { ...props.item } });
    expect(mockList).toHaveBeenCalledTimes(1);
    await update({ item: makeItem({ size: 'L' }) });
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('starts over for a different piece', async () => {
    mockList.mockResolvedValue([listing()]);
    const { update, has } = await render();
    expect(has('Withdraw')).toBe(true);
    await update({ item: makeItem({ id: 'item-2', name: 'Wool Coat' }) });
    expect(has('Withdraw')).toBe(false);
    expect(has('Open to swap')).toBe(true);
  });
});

describe('SwapListingCard: locked, expired, under review', () => {
  it.each([
    ['in an accepted swap', listing({ inAcceptedSwap: true })],
    ['reserved', listing({ status: 'reserved' })],
  ])('shows the lock banner and only "See swap" when the piece is %s', async (_n, locked) => {
    mockList.mockResolvedValue([locked]);
    const { text, has, press, props } = await render();
    expect(text()).toContain('Locked into a swap. Deleting this piece cancels the swap.');
    for (const label of ['Withdraw', 'Edit note', 'Update', 'Renew', 'Open to swap']) expect(has(label)).toBe(false);
    await press('See swap');
    expect(props.onOpenSwaps).toHaveBeenCalledTimes(1);
  });

  it('does not offer Update on a locked piece even if it changed', async () => {
    mockList.mockResolvedValue([listing({ inAcceptedSwap: true, stale: true })]);
    const { has } = await render();
    expect(has('Update')).toBe(false);
  });

  it('shows "Expired" with Renew, and renews', async () => {
    mockList.mockResolvedValueOnce([listing({ status: 'expired' })]).mockResolvedValue([listing()]);
    const { text, press, has } = await render();
    expect(text()).toContain('Expired');
    expect(has('Edit note')).toBe(false);
    await press('Renew');
    expect(mockRenew).toHaveBeenCalledWith('l1');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(has('Withdraw')).toBe(true);
    expect(has('Renew')).toBe(false);
  });

  it('shows the owner a hold message when renewing is refused', async () => {
    mockList.mockResolvedValue([listing({ status: 'expired' })]);
    mockRenew.mockRejectedValue(new SwapError('listing_held'));
    const { press, text } = await render();
    await press('Renew');
    expect(text()).toContain(HELD_TEXT);
  });

  it.each([
    ['held', 'Under review'],
    ['removed', 'Not available'],
  ] as const)('shows "%s" listings as "%s", with no actions but Email support', async (status, label) => {
    mockList.mockResolvedValue([listing({ status })]);
    const { text, has, press } = await render();
    expect(text()).toContain(label);
    expect(text()).toContain('This piece can’t be listed right now. Email support if you think this is a mistake.');
    for (const action of ['Withdraw', 'Edit note', 'Update', 'Renew', 'Open to swap', 'See swap']) expect(has(action)).toBe(false);
    await press('Email support');
    expect(Linking.openURL).toHaveBeenCalledWith(SUPPORT_MAILTO);
  });

  it('shows the alert fallback when the mail app cannot open', async () => {
    mockList.mockResolvedValue([listing({ status: 'held' })]);
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('no mail'));
    const { press } = await render();
    await press('Email support');
    expect(Alert.alert).toHaveBeenCalledWith('Could not open Mail', expect.stringContaining('@'));
  });

  it('lets a hold or a removal outrank a live listing of the same piece', async () => {
    mockList.mockResolvedValue([listing({ id: 'a', status: 'active' }), listing({ id: 'b', status: 'held' })]);
    const { text, has } = await render();
    expect(text()).toContain('Under review');
    expect(has('Withdraw')).toBe(false);
  });
});

describe('SwapListingCard: the swap terms', () => {
  const agree = async (tree: renderer.ReactTestRenderer) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === 'I agree' && typeof n.props.onPress === 'function');
    await act(async () => {
      await node.props.onPress();
    });
  };

  it('opens the terms when an action needs them, and repeats the action after the member agrees', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue(undefined);
    const { press, text, tree } = await render();
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
    await press('Withdraw');
    await confirmWith('Withdraw');
    for (const section of SWAP_TERMS.sections) expect(text()).toContain(section.heading);
    expect(mockAccept).not.toHaveBeenCalled();
    await agree(tree);
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith();
    expect(mockWithdraw).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
  });

  it('does not repeat the action when the member declines the terms', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValue(new SwapError('swap_terms_required'));
    const { press, text, tree } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    const notNow = tree.root.find(n => n.props.accessibilityLabel === 'Not now' && typeof n.props.onPress === 'function');
    await act(async () => {
      notNow.props.onPress();
    });
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockWithdraw).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
  });

  it('does not ask the member to agree to text the server does not hold', async () => {
    mockList.mockResolvedValue([listing()]);
    mockWithdraw.mockRejectedValue(new SwapError('swap_terms_required'));
    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2099-01' }));
    const { press, text } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(text()).toContain(SWAP_UPDATE_REQUIRED_MESSAGE);
    expect(text()).not.toContain(SWAP_TERMS.sections[0].heading);
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

describe('SwapListingCard: hosted in the item screen', () => {
  it('renders no text field in any state', async () => {
    const states: Array<[string, () => void]> = [
      ['guest', () => mockList.mockRejectedValue(new SwapError('not_authenticated'))],
      ['error', () => mockList.mockRejectedValue(new Error('boom'))],
      ['open', () => mockList.mockResolvedValue([])],
      ['listed', () => mockList.mockResolvedValue([listing({ note: 'Runs small', stale: true, openOffers: 3 })])],
      ['locked', () => mockList.mockResolvedValue([listing({ inAcceptedSwap: true })])],
      ['expired', () => mockList.mockResolvedValue([listing({ status: 'expired' })])],
      ['held', () => mockList.mockResolvedValue([listing({ status: 'held' })])],
      ['removed', () => mockList.mockResolvedValue([listing({ status: 'removed' })])],
    ];
    for (const [, arrange] of states) {
      mockList.mockReset();
      arrange();
      const { tree } = await render();
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      await act(async () => {
        tree.unmount();
      });
    }
  });

  it('uses no navigation hook and no storage of its own', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(require('path').resolve(__dirname, '../../src/components/SwapListingCard.tsx'), 'utf8');
    expect(source).not.toMatch(/@react-navigation/);
    expect(source).not.toMatch(/useNavigation|useFocusEffect|navigate\(/);
    expect(source).not.toMatch(/AsyncStorage/);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/<TextInput|<Input\b/);
  });
});
