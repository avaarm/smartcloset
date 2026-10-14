import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockList = jest.fn();
const mockWithdraw = jest.fn();
const mockRenew = jest.fn();
const mockNarrow = jest.fn();
const mockPublish = jest.fn();
const mockSettings = jest.fn();
const mockAccept = jest.fn();
const mockSheet = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: jest.fn(),
    functions: { invoke: jest.fn() },
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
  narrowSwapListing: (...a: any[]) => mockNarrow(...a),
  publishSwapListing: (...a: any[]) => mockPublish(...a),
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));
// The sheet has its own tests; here it is a stub that records the props the list gives it.
jest.mock('../../src/components/ListForSwapSheet', () => ({
  ...jest.requireActual('../../src/components/ListForSwapSheet'),
  __esModule: true,
  default: (props: any) => {
    mockSheet(props);
    return null;
  },
}));

import MyPiecesList from '../../src/components/MyPiecesList';
import { HELD_TEXT } from '../../src/components/ListForSwapSheet';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import { SWAP_PAUSED_MESSAGE, SWAP_TERMS, SWAP_TERMS_VERSION } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { MySwapListing, SwapSettings } from '../../src/types/swap';

type Props = React.ComponentProps<typeof MyPiecesList>;

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
  const props: Props = { onChanged: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<MyPiecesList {...props} />);
  });
  const text = () => flatten(tree.toJSON());
  const find = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function', { deep: false });
  const has = (label: string) => find(label).length > 0;
  const press = async (label: string, index = 0) => {
    const nodes = find(label);
    if (nodes.length <= index) throw new Error(`no "${label}" button #${index}`);
    await act(async () => {
      nodes[index].props.onPress();
    });
  };
  return { tree, props, text, find, has, press };
};

const lastSheet = () => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];

const confirmWith = async (label: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const button = calls[calls.length - 1][2].find((b: any) => b.text === label);
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
  mockList.mockReset().mockResolvedValue([listing()]);
  mockWithdraw.mockReset().mockResolvedValue(undefined);
  mockRenew.mockReset().mockResolvedValue(undefined);
  mockNarrow.mockReset().mockResolvedValue(undefined);
  mockPublish.mockReset().mockResolvedValue({ listingId: 'l2' });
  mockSettings.mockReset().mockResolvedValue(settings());
  mockAccept.mockReset().mockResolvedValue(undefined);
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

describe('MyPiecesList: rows', () => {
  it('shows each piece with its audience, status, size and condition', async () => {
    mockList.mockResolvedValue([
      listing({ id: 'a', name: 'Linen Shirt' }),
      listing({ id: 'b', itemId: 'item-2', name: 'Wool Coat', audience: 'community', size: 'L', condition: 'like_new' }),
    ]);
    const { text } = await render();
    expect(text()).toContain('Linen Shirt');
    expect(text()).toContain('M · Good');
    expect(text()).toContain('Wool Coat');
    expect(text()).toContain('L · Like new');
    expect(text()).toContain('Friends');
    expect(text()).toContain('Community');
    expect(text()).toContain('Open to swap');
  });

  it('shows the note and counts open offers', async () => {
    mockList.mockResolvedValue([listing({ note: 'Runs small', openOffers: 2 }), listing({ id: 'b', openOffers: 1 })]);
    const { text } = await render();
    expect(text()).toContain('Runs small');
    expect(text()).toContain('2 open offers');
    expect(text()).toContain('1 open offer');
    expect(text()).not.toContain('1 open offers');
  });

  it('shows a placeholder while the rows load, with nothing to press', async () => {
    const d = deferred();
    mockList.mockReturnValue(d.promise);
    const { tree, has } = await render();
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading your pieces').length).toBeGreaterThan(0);
    expect(has('Open another piece')).toBe(false);
    expect(has('Open a piece')).toBe(false);
    await act(async () => {
      d.resolve([listing()]);
    });
    expect(has('Open another piece')).toBe(true);
  });

  it('shows the photo from the swap photos, not from the closet', async () => {
    const { tree } = await render();
    expect(tree.root.findAll(n => n.props.path === 'l1.jpg').length).toBeGreaterThan(0);
  });
});

describe('MyPiecesList: nothing open yet', () => {
  beforeEach(() => mockList.mockResolvedValue([]));

  it('says so, and offers to open a piece', async () => {
    const { text, press, has } = await render();
    expect(text()).toContain('Nothing open to swap yet');
    expect(has('Open another piece')).toBe(false);
    expect(lastSheet().visible).toBe(false);
    await press('Open a piece');
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().item).toBeUndefined();
    expect(lastSheet().editListing).toBeUndefined();
  });

  it('shows the new piece after the sheet reports a change, and tells the screen', async () => {
    const { text, props, press } = await render();
    await press('Open a piece');
    mockList.mockResolvedValue([listing({ name: 'Silk Scarf' })]);
    await act(async () => {
      lastSheet().onChanged();
    });
    expect(text()).toContain('Silk Scarf');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('MyPiecesList: open pieces', () => {
  it('opens a different piece from the button under the rows', async () => {
    const { press } = await render();
    await press('Open another piece');
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().item).toBeUndefined();
    expect(lastSheet().editListing).toBeUndefined();
  });

  it('edits the note of the row that was pressed', async () => {
    const second = listing({ id: 'b', itemId: 'item-2', name: 'Wool Coat' });
    mockList.mockResolvedValue([listing(), second]);
    const { press } = await render();
    await press('Edit note', 1);
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().editListing).toEqual(second);
    expect(lastSheet().item).toBeUndefined();
  });

  it('keeps the sheet\'s mode while it closes', async () => {
    const { press } = await render();
    await press('Edit note');
    await act(async () => {
      lastSheet().onClose();
    });
    expect(lastSheet().visible).toBe(false);
    expect(lastSheet().editListing).toEqual(listing());
  });

  it('asks before withdrawing, and withdraws only on confirmation', async () => {
    mockList.mockResolvedValueOnce([listing()]).mockResolvedValue([]);
    const { press, text, props } = await render();
    await press('Withdraw');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Withdraw this piece?');
    expect(mockWithdraw).not.toHaveBeenCalled();
    await confirmWith('Withdraw');
    expect(mockWithdraw).toHaveBeenCalledWith('l1');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Nothing open to swap yet');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it('withdraws nothing when the confirmation is cancelled', async () => {
    const { press, props } = await render();
    await press('Withdraw');
    const cancel = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === 'Cancel');
    expect(cancel.onPress).toBeUndefined();
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it('warns that waiting offers end', async () => {
    mockList.mockResolvedValue([listing({ openOffers: 2 })]);
    const { press } = await render();
    await press('Withdraw');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/offers waiting for it end/);
  });

  it('narrows a community listing to friends straight away when no offers are waiting', async () => {
    mockList.mockResolvedValueOnce([listing({ audience: 'community' })]).mockResolvedValue([listing({ audience: 'friends' })]);
    const { press, has, text, props } = await render();
    await press('Narrow to friends');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockNarrow).toHaveBeenCalledWith('l1');
    expect(has('Narrow to friends')).toBe(false);
    expect(text()).toContain('Friends');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it('asks first when narrowing would end offers from people who are not friends', async () => {
    mockList.mockResolvedValue([listing({ audience: 'community', openOffers: 1 })]);
    const { press } = await render();
    await press('Narrow to friends');
    expect(mockNarrow).not.toHaveBeenCalled();
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/aren’t your friends end/);
    await confirmWith('Narrow to friends');
    expect(mockNarrow).toHaveBeenCalledWith('l1');
  });

  it('offers Narrow to friends for community listings only', async () => {
    const { has } = await render();
    expect(has('Narrow to friends')).toBe(false);
  });

  it('nudges a changed piece to Update, and republishes with the same audience and note', async () => {
    mockList
      .mockResolvedValueOnce([listing({ stale: true, audience: 'community', note: 'Runs small' })])
      .mockResolvedValue([listing({ id: 'l2', audience: 'community', note: 'Runs small' })]);
    const { text, press, has, props } = await render();
    expect(text()).toContain('You changed this piece since you opened it.');
    await press('Update');
    expect(mockPublish).toHaveBeenCalledWith({ itemId: 'item-1', audience: 'community', note: 'Runs small' });
    expect(has('Update')).toBe(false);
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it('offers no Update for a piece that was deleted, or that has not changed', async () => {
    mockList.mockResolvedValue([listing({ stale: true, itemId: null }), listing({ id: 'b', stale: false })]);
    const { has, text } = await render();
    expect(has('Update')).toBe(false);
    expect(text()).not.toContain('You changed this piece');
  });

  it('shows why an Update failed', async () => {
    mockList.mockResolvedValue([listing({ stale: true })]);
    mockPublish.mockRejectedValue(new SwapError('moderation_unavailable'));
    const { press, text } = await render();
    await press('Update');
    expect(text()).toContain('We couldn’t check that photo right now.');
  });
});

describe('MyPiecesList: expired, locked, under review', () => {
  it('renews an expired listing', async () => {
    mockList.mockResolvedValueOnce([listing({ status: 'expired' })]).mockResolvedValue([listing()]);
    const { press, text, has, props } = await render();
    expect(text()).toContain('Expired');
    expect(has('Edit note')).toBe(false);
    await press('Renew');
    expect(mockRenew).toHaveBeenCalledWith('l1');
    expect(has('Renew')).toBe(false);
    expect(text()).toContain('Open to swap');
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it('lets an expired listing be withdrawn, with the same confirmation', async () => {
    mockList.mockResolvedValue([listing({ status: 'expired' })]);
    const { press } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(mockWithdraw).toHaveBeenCalledWith('l1');
  });

  it.each([
    ['in an accepted swap', listing({ inAcceptedSwap: true, stale: true })],
    ['reserved', listing({ status: 'reserved' })],
  ])('shows a piece %s as locked, with no actions', async (_n, locked) => {
    mockList.mockResolvedValue([locked]);
    const { text, has } = await render();
    expect(text()).toContain('Locked into a swap');
    for (const label of ['Edit note', 'Withdraw', 'Renew', 'Update', 'Narrow to friends']) expect(has(label)).toBe(false);
  });

  it.each([
    ['held', 'Under review'],
    ['removed', 'Not available'],
  ] as const)('shows a %s listing as "%s", with the reason and only Email support', async (status, label) => {
    mockList.mockResolvedValue([listing({ status, openOffers: 3, stale: true, audience: 'community' })]);
    const { text, has, press } = await render();
    expect(text()).toContain(label);
    expect(text()).toContain(HELD_TEXT);
    expect(text()).not.toContain('open offers');
    for (const action of ['Edit note', 'Withdraw', 'Renew', 'Update', 'Narrow to friends']) expect(has(action)).toBe(false);
    await press('Email support');
    expect(Linking.openURL).toHaveBeenCalledWith(SUPPORT_MAILTO);
  });

  it('shows the hold message when renewing is refused', async () => {
    mockList.mockResolvedValue([listing({ status: 'expired' })]);
    mockRenew.mockRejectedValue(new SwapError('listing_held'));
    const { press, text } = await render();
    await press('Renew');
    expect(text()).toContain(HELD_TEXT);
  });
});

describe('MyPiecesList: when something goes wrong', () => {
  it('shows "Couldn\'t load your pieces" with Try again when there is nothing to show', async () => {
    mockList.mockRejectedValueOnce({ message: 'Network request failed' }).mockResolvedValue([listing()]);
    const { text, press, has } = await render();
    expect(text()).toContain("Couldn't load your pieces");
    expect(has('Open a piece')).toBe(false);
    await press('Try again to load your pieces');
    expect(text()).toContain('Linen Shirt');
  });

  it('keeps the rows and shows a banner when a refresh fails', async () => {
    const { text, press, tree, has } = await render();
    mockList.mockRejectedValue({ message: 'Network request failed' });
    await press('Withdraw');
    mockWithdraw.mockResolvedValue(undefined);
    await confirmWith('Withdraw');
    expect(text()).toContain('Linen Shirt');
    expect(text()).toContain("Couldn't load your pieces");
    expect(has('Try again to load your pieces')).toBe(true);
    mockList.mockResolvedValue([listing()]);
    await press('Try again to load your pieces');
    expect(text()).not.toContain("Couldn't load your pieces");
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Try again to load your pieces')).toHaveLength(0);
  });

  it.each([
    ['a guest', new SwapError('not_authenticated'), 'Sign in to swap'],
    ['swaps being paused', new SwapError('swaps_disabled'), SWAP_PAUSED_MESSAGE],
    ['a server without swaps', { message: 'Could not find the function', code: 'PGRST202' }, 'Swaps aren’t available yet in this version'],
  ])('says so for %s, and does not offer to retry', async (_n, failure, expected) => {
    mockList.mockRejectedValue(failure);
    const { text, has } = await render();
    expect(text()).toContain(expected);
    expect(has('Try again to load your pieces')).toBe(false);
    expect(has('Open a piece')).toBe(false);
  });

  it('shows a failed action in plain words and reads the list again when the server moved on', async () => {
    mockWithdraw.mockRejectedValue(new SwapError('item_reserved'));
    const { press, text } = await render();
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(text()).toContain('That piece is locked into a swap right now.');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('uses fitting words for an unexpected failure of each action', async () => {
    mockList.mockResolvedValue([listing({ status: 'expired' })]);
    mockRenew.mockRejectedValue(new Error('boom'));
    const { press, text } = await render();
    await press('Renew');
    expect(text()).toContain('Couldn’t renew that piece. Please try again.');
  });

  it('ignores a second tap while an action runs, and disables the other buttons', async () => {
    const d = deferred();
    mockWithdraw.mockReturnValue(d.promise);
    const { press, find } = await render();
    await press('Withdraw');
    const confirm = (Alert.alert as jest.Mock).mock.calls[0][2].find((b: any) => b.text === 'Withdraw');
    await act(async () => {
      confirm.onPress();
    });
    expect(find('Edit note')[0].props.disabled).toBe(true);
    expect(find('Open another piece')[0].props.disabled).toBe(true);
    await act(async () => {
      confirm.onPress();
    });
    await act(async () => {
      d.resolve();
    });
    expect(mockWithdraw).toHaveBeenCalledTimes(1);
  });

  it('asks for the swap terms when an action needs them, and repeats the action after they are agreed', async () => {
    mockList.mockResolvedValue([listing({ status: 'expired' })]);
    mockRenew.mockRejectedValueOnce(new SwapError('swap_terms_required')).mockResolvedValue(undefined);
    const { press, text, tree } = await render();
    await press('Renew');
    for (const section of SWAP_TERMS.sections) expect(text()).toContain(section.heading);
    const agree = tree.root.find(n => n.props.accessibilityLabel === 'I agree' && typeof n.props.onPress === 'function');
    await act(async () => {
      await agree.props.onPress();
    });
    expect(mockAccept).toHaveBeenCalledWith();
    expect(mockRenew).toHaveBeenCalledTimes(2);
  });

  it('drops an answer that arrives after the list went away', async () => {
    const d = deferred();
    mockList.mockReturnValue(d.promise);
    const { tree } = await render();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      d.resolve([listing()]);
    });
    expect(mockSheet).not.toHaveBeenCalled();
  });
});

describe('MyPiecesList: hosted in the My swaps screen', () => {
  it('uses no navigation hook, no storage of its own and no text field', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/MyPiecesList.tsx'), 'utf8');
    expect(source).not.toMatch(/@react-navigation|useNavigation|useFocusEffect|navigate\(/);
    expect(source).not.toMatch(/AsyncStorage/);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/<TextInput|<Input\b/);
  });

  it('works without onChanged', async () => {
    const { press } = await render({ onChanged: undefined });
    await press('Withdraw');
    await confirmWith('Withdraw');
    expect(mockWithdraw).toHaveBeenCalledTimes(1);
  });
});
