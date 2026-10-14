import 'react-native';
import React from 'react';
import { InputAccessoryView, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockMine = jest.fn();
const mockBrowse = jest.fn();
const mockPropose = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  listMySwapListings: (...a: any[]) => mockMine(...a),
  browseSwapListings: (...a: any[]) => mockBrowse(...a),
  proposeSwap: (...a: any[]) => mockPropose(...a),
}));
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`])),
  forgetSwapPhoto: jest.fn(),
}));

import SwapOfferSheet from '../../src/components/SwapOfferSheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { SWAP_LIMITS, SWAP_NO_MONEY_LINE } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';
import type { MySwapListing, SwapListing } from '../../src/types/swap';

type Props = React.ComponentProps<typeof SwapOfferSheet>;

const piece = (id: string, over: Partial<MySwapListing> = {}): MySwapListing => ({
  id,
  itemId: `item-${id}`,
  audience: 'friends',
  status: 'active',
  name: `Piece ${id}`,
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

const listing = (id: string, over: Partial<SwapListing> = {}): SwapListing => ({
  id,
  ownerLabel: 'Bea',
  ownerKind: 'friend',
  audience: 'friends',
  name: `Their ${id}`,
  category: 'tops',
  size: 'S',
  condition: 'like_new',
  photoPath: `${id}.jpg`,
  listedAt: '2026-10-01T00:00:00Z',
  mine: false,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const base = (over: Partial<Props> = {}): Props => ({
  visible: true,
  target: listing('t1'),
  onClose: jest.fn(),
  onSent: jest.fn(),
  onOpenPieces: jest.fn(),
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props = base(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapOfferSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapOfferSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const has = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const checked = (label: string) => Boolean(pressable(label).props.accessibilityState.checked);
  const noteField = () => tree.root.findAllByType(TextInput)[0];
  const type = async (value: string) => {
    await act(async () => {
      noteField().props.onChangeText(value);
    });
  };
  const sendDisabled = () => Boolean(pressable('Send offer').props.accessibilityState.disabled);
  return { tree, props, text, pressable, has, press, checked, noteField, type, sendDisabled, update };
};

const FOUR = [piece('a'), piece('b'), piece('c'), piece('d')];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockMine.mockReset().mockResolvedValue(FOUR);
  mockBrowse.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mockPropose.mockReset().mockResolvedValue('swap-1');
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

describe('SwapOfferSheet: choosing pieces', () => {
  it('names what is being asked for and lists the member’s open pieces, none picked yet', async () => {
    const { text, checked, sendDisabled } = await render();
    expect(text()).toContain('You’re asking for Their t1 from Bea.');
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(text()).toContain(`Piece ${id}`);
      expect(checked(`Offer Piece ${id}`)).toBe(false);
    }
    expect(text()).toContain('0 of 3');
    expect(sendDisabled()).toBe(true);
  });

  it('lists only pieces that are on the rack now', async () => {
    mockMine.mockResolvedValue([
      piece('a'),
      piece('b', { status: 'reserved' }),
      piece('c', { status: 'withdrawn' }),
      piece('d', { status: 'held' }),
      piece('e', { status: 'expired' }),
      piece('f', { expiresAt: '2020-01-01T00:00:00Z' }),
    ]);
    const { text } = await render();
    expect(text()).toContain('Piece a');
    for (const id of ['b', 'c', 'd', 'e', 'f']) expect(text()).not.toContain(`Piece ${id}`);
  });

  it('lets a member pick one to three pieces and ignores a fourth', async () => {
    const { press, checked, text } = await render();
    await press('Offer Piece a');
    await press('Offer Piece b');
    await press('Offer Piece c');
    expect(text()).toContain('3 of 3');
    await press('Offer Piece d');
    expect(checked('Offer Piece d')).toBe(false);
    expect(['a', 'b', 'c'].map(id => checked(`Offer Piece ${id}`))).toEqual([true, true, true]);
    expect(text()).toContain('3 of 3');
  });

  it('lets a picked piece be put back, which frees a place', async () => {
    const { press, checked } = await render();
    await press('Offer Piece a');
    await press('Offer Piece b');
    await press('Offer Piece c');
    await press('Offer Piece b');
    expect(checked('Offer Piece b')).toBe(false);
    await press('Offer Piece d');
    expect(checked('Offer Piece d')).toBe(true);
  });

  it('offers every open piece to a friend, whatever its audience', async () => {
    mockMine.mockResolvedValue([piece('a'), piece('b', { audience: 'community' })]);
    const { press, checked, text } = await render();
    await press('Offer Piece a');
    await press('Offer Piece b');
    expect(checked('Offer Piece a') && checked('Offer Piece b')).toBe(true);
    expect(text()).not.toContain('Friends only');
  });

  it('offers only community pieces to someone who is not a friend, and greys the rest', async () => {
    mockMine.mockResolvedValue([piece('a'), piece('b', { audience: 'community' }), piece('c', { audience: 'community' })]);
    const { press, checked, pressable, text } = await render({
      target: listing('t1', { ownerKind: 'member', ownerLabel: 'Velvet Otter', audience: 'community' }),
    });
    expect(text()).toContain('Friends only');
    expect(pressable('Offer Piece a').props.accessibilityState.disabled).toBe(true);
    expect(pressable('Offer Piece b').props.accessibilityState.disabled).toBe(false);

    await press('Offer Piece a');
    expect(checked('Offer Piece a')).toBe(false);
    await press('Offer Piece b');
    expect(checked('Offer Piece b')).toBe(true);
  });

  it('keeps only the pieces that went to the community when it sends to a stranger', async () => {
    mockMine.mockResolvedValue([piece('a'), piece('b', { audience: 'community' })]);
    const { press } = await render({ target: listing('t1', { ownerKind: 'member', ownerLabel: 'Velvet Otter' }) });
    await press('Offer Piece a');
    await press('Offer Piece b');
    await press('Send offer');
    expect(mockPropose.mock.calls[0][0].offerListingIds).toEqual(['b']);
  });
});

describe('SwapOfferSheet: asking for more from the same person', () => {
  const others = [listing('x1'), listing('x2'), listing('x3'), listing('t1')];

  it('lists their other pieces for a friend from the friends rack, without the one already asked for', async () => {
    mockBrowse.mockResolvedValue({ items: others, nextCursor: null });
    const { text, has } = await render();
    expect(mockBrowse).toHaveBeenCalledWith(expect.objectContaining({ scope: 'friends', sameOwnerAs: 't1' }));
    expect(text()).toContain('More from Bea');
    expect(has('Also ask for Their x1')).toBe(true);
    expect(has('Also ask for Their x3')).toBe(true);
    expect(has('Also ask for Their t1')).toBe(false);
  });

  it('reads the community rack for a stranger', async () => {
    mockMine.mockResolvedValue([piece('a', { audience: 'community' })]);
    await render({ target: listing('t1', { ownerKind: 'member', ownerLabel: 'Velvet Otter' }) });
    expect(mockBrowse).toHaveBeenCalledWith(expect.objectContaining({ scope: 'community', sameOwnerAs: 't1' }));
  });

  it('allows at most two extra pieces', async () => {
    mockBrowse.mockResolvedValue({ items: others, nextCursor: null });
    const { press, checked } = await render();
    await press('Also ask for Their x1');
    await press('Also ask for Their x2');
    await press('Also ask for Their x3');
    expect(checked('Also ask for Their x1')).toBe(true);
    expect(checked('Also ask for Their x2')).toBe(true);
    expect(checked('Also ask for Their x3')).toBe(false);
    expect(SWAP_LIMITS.items_per_side - 1).toBe(2);
  });

  it('adds the extras after the piece that was opened, in the order they were picked', async () => {
    mockBrowse.mockResolvedValue({ items: others, nextCursor: null });
    const { press } = await render();
    await press('Offer Piece a');
    await press('Also ask for Their x2');
    await press('Also ask for Their x1');
    await press('Send offer');
    expect(mockPropose.mock.calls[0][0].requestListingIds).toEqual(['t1', 'x2', 'x1']);
  });

  it('shows no extras section and still works when the list cannot be read', async () => {
    mockBrowse.mockRejectedValue(new SwapError('swap_rate_limited', 'x', 'browse_day'));
    const { text, press } = await render();
    expect(text()).not.toContain('More from');
    await press('Offer Piece a');
    await press('Send offer');
    expect(mockPropose.mock.calls[0][0].requestListingIds).toEqual(['t1']);
  });
});

describe('SwapOfferSheet: sending', () => {
  it('sends the pieces, the trimmed note and a clientRef, then tells the screen', async () => {
    const { press, type, props } = await render();
    await press('Offer Piece a');
    await press('Offer Piece c');
    await type('  Would love this one.  ');
    await press('Send offer');

    expect(mockPropose).toHaveBeenCalledTimes(1);
    expect(mockPropose).toHaveBeenCalledWith({
      requestListingIds: ['t1'],
      offerListingIds: ['a', 'c'],
      note: 'Would love this one.',
      clientRef: expect.stringMatching(UUID),
    });
    expect(props.onSent).toHaveBeenCalledWith('swap-1');
  });

  it('sends no note when none was written', async () => {
    const { press } = await render();
    await press('Offer Piece a');
    await press('Send offer');
    expect(mockPropose.mock.calls[0][0].note).toBeUndefined();
  });

  it('will not send without a piece, or twice at once', async () => {
    const gate = deferred();
    mockPropose.mockReturnValue(gate.promise);
    const { press, pressable } = await render();
    await act(async () => {
      pressable('Send offer').props.onPress();
    });
    expect(mockPropose).not.toHaveBeenCalled();

    await press('Offer Piece a');
    await act(async () => {
      pressable('Send offer').props.onPress();
    });
    await act(async () => {
      pressable('Send offer').props.onPress();
    });
    expect(mockPropose).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve('swap-1');
    });
  });

  it('keeps the same clientRef across a failed send and its retry, and keeps what was typed and picked', async () => {
    mockPropose.mockRejectedValueOnce(new SwapError('offline')).mockResolvedValueOnce('swap-9');
    const { press, type, text, checked, noteField, props } = await render();
    await press('Offer Piece b');
    await type('Hello');
    await press('Send offer');

    expect(text()).toContain('You seem to be offline. Check your connection and try again.');
    expect(props.onSent).not.toHaveBeenCalled();
    expect(checked('Offer Piece b')).toBe(true);
    expect(noteField().props.value).toBe('Hello');

    await press('Send offer');
    expect(mockPropose).toHaveBeenCalledTimes(2);
    const [first, second] = mockPropose.mock.calls.map(c => c[0]);
    expect(first.clientRef).toMatch(UUID);
    expect(second.clientRef).toBe(first.clientRef);
    expect(second).toEqual(first);
    expect(props.onSent).toHaveBeenCalledWith('swap-9');
    expect(text()).not.toContain('offline');
  });

  it('makes a new clientRef each time the sheet is opened', async () => {
    mockPropose.mockRejectedValueOnce(new SwapError('offline'));
    const { press, update } = await render();
    await press('Offer Piece a');
    await press('Send offer');
    const first = mockPropose.mock.calls[0][0].clientRef;

    await update({ visible: false });
    await update({ visible: true });
    await press('Offer Piece a');
    await press('Send offer');
    expect(mockPropose.mock.calls[1][0].clientRef).toMatch(UUID);
    expect(mockPropose.mock.calls[1][0].clientRef).not.toBe(first);
  });

  it.each([
    ['already_proposed', new SwapError('already_proposed'), 'You already have an open offer with this person.'],
    ['swap_cooldown', new SwapError('swap_cooldown'), 'This person declined recently. You can offer again in a few days.'],
    ['swap_open_limit', new SwapError('swap_open_limit'), 'You have five open offers. Wait for answers or withdraw one.'],
    ['recipient_busy', new SwapError('recipient_busy'), 'This person has a lot of offers waiting. Try again later.'],
    ['listing_busy', new SwapError('listing_busy'), 'This piece has a lot of offers. Try another or wait.'],
    ['offer_not_allowed', new SwapError('offer_not_allowed'), 'Pick pieces of yours that are open to swap.'],
    ['swap_unavailable', new SwapError('swap_unavailable'), 'That piece or swap is no longer available.'],
    ['payment wording', new SwapError('text_not_allowed', 'x', 'note', 'payment'), 'Swaps are item for item. Please don’t mention payments or gift cards.'],
    ['rate limit', new SwapError('swap_rate_limited', 'x', 'propose_day'), 'You’re going a bit fast. Please wait a moment and try again.'],
    ['swap_terms_required', new SwapError('swap_terms_required'), 'Please read and accept the swap terms first.'],
    ['an unknown failure', new Error('boom'), 'Couldn’t send your offer. Please try again.'],
  ])('explains %s in plain words', async (_name, failure, message) => {
    mockPropose.mockRejectedValue(failure);
    const { press, text, props } = await render();
    await press('Offer Piece a');
    await press('Send offer');
    expect(text()).toContain(message);
    expect(props.onSent).not.toHaveBeenCalled();
    expect(text()).not.toContain('boom');
  });

  it('clears the message once the member changes something', async () => {
    mockPropose.mockRejectedValue(new SwapError('offline'));
    const { press, text } = await render();
    await press('Offer Piece a');
    await press('Send offer');
    expect(text()).toContain('offline');
    await press('Offer Piece b');
    expect(text()).not.toContain('offline');
  });

  it('stays open while the offer is on its way, and ignores an answer that comes after it closed', async () => {
    const gate = deferred();
    mockPropose.mockReturnValue(gate.promise);
    const { press, pressable, props, update } = await render();
    await press('Offer Piece a');
    await act(async () => {
      pressable('Send offer').props.onPress();
    });
    await act(async () => {
      pressable('Cancel').props.onPress();
    });
    expect(props.onClose).not.toHaveBeenCalled();

    await update({ visible: false });
    await act(async () => {
      gate.resolve('swap-1');
    });
    expect(props.onSent).not.toHaveBeenCalled();
  });

  it('closes from Cancel', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('starts fresh when it is opened again', async () => {
    const { press, type, update, noteField, checked } = await render();
    await press('Offer Piece a');
    await type('Hi');
    await update({ visible: false });
    await update({ visible: true });
    expect(noteField().props.value).toBe('');
    expect(checked('Offer Piece a')).toBe(false);
  });
});

describe('SwapOfferSheet: nothing to offer', () => {
  it('says so and sends the member to their pieces', async () => {
    mockMine.mockResolvedValue([piece('r', { status: 'reserved' })]);
    const { text, has, press, props } = await render();
    expect(text()).toContain('You don’t have any pieces open to swap yet.');
    expect(has('Send offer')).toBe(false);
    expect(has('Offer Piece r')).toBe(false);

    await press('Open a piece');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpenPieces).toHaveBeenCalledTimes(1);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('does not spend a browsing page on their other pieces when there is nothing to offer for them', async () => {
    mockMine.mockResolvedValue([]);
    await render();
    expect(mockBrowse).not.toHaveBeenCalled();

    mockMine.mockResolvedValue([piece('a')]);
    await render({ target: listing('t2', { ownerKind: 'member', ownerLabel: 'Velvet Otter' }) });
    expect(mockBrowse).not.toHaveBeenCalled();
  });

  it('explains when a stranger can only be offered community pieces and none are open to the community', async () => {
    mockMine.mockResolvedValue([piece('a'), piece('b')]);
    const { text, has } = await render({ target: listing('t1', { ownerKind: 'member', ownerLabel: 'Velvet Otter' }) });
    expect(text()).toContain('Only pieces you opened to the community can be offered to someone who isn’t your friend.');
    expect(has('Open a piece')).toBe(true);
    expect(has('Send offer')).toBe(false);
  });
});

describe('SwapOfferSheet: loading', () => {
  it('shows a message while the pieces load', async () => {
    mockMine.mockReturnValue(new Promise(() => {}));
    const { text } = await render();
    expect(text()).toContain('Loading your pieces');
  });

  it('shows a plain message and a way to try again when the pieces cannot be read', async () => {
    mockMine.mockRejectedValueOnce(new SwapError('offline'));
    const { text, press, has } = await render();
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');
    expect(has('Send offer')).toBe(false);

    await press('Try again');
    expect(mockMine).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Piece a');
  });

  it('does not ask for anything while it is closed', async () => {
    await render({ visible: false });
    expect(mockMine).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
  });
});

describe('SwapOfferSheet: the note and the keyboard', () => {
  it('states the no-money rule', async () => {
    const { text } = await render();
    expect(text()).toContain(SWAP_NO_MONEY_LINE);
  });

  it('has a multi-line note capped at 280 characters, with the Done bar', async () => {
    const { noteField } = await render();
    const field = noteField().props;
    expect(field.multiline).toBe(true);
    expect(field.maxLength).toBe(280);
    expect(field.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(field.accessibilityLabel).toBe('Offer note');
  });

  it('renders the Done bar once and lifts the form above the keyboard', async () => {
    const { tree, noteField } = await render();
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe(KEYBOARD_DONE_ID);

    let lifted = false;
    for (let p = noteField().parent; p; p = p.parent) if (p.type === KeyboardLift) lifted = true;
    expect(lifted).toBe(true);
  });

  it('counts the note as it is typed', async () => {
    const { type, text } = await render();
    await type('Hello there');
    expect(text()).toContain('11/280');
  });

  it('keeps the note field out of reach while the offer is on its way', async () => {
    const gate = deferred();
    mockPropose.mockReturnValue(gate.promise);
    const { press, noteField } = await render();
    await press('Offer Piece a');
    await press('Send offer');
    expect(noteField().props.editable).toBe(false);
    await act(async () => {
      gate.resolve('swap-1');
    });
  });
});
