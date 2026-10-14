import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, AppState, InputAccessoryView, RefreshControl, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = { swapId: 's1' };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockSettings = jest.fn();
const mockGetSwap = jest.fn();
const mockRespond = jest.fn();
const mockCancel = jest.fn();
const mockSend = jest.fn();
const mockComplete = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  getSwap: (...a: any[]) => mockGetSwap(...a),
  respondToSwap: (...a: any[]) => mockRespond(...a),
  cancelSwap: (...a: any[]) => mockCancel(...a),
  sendSwapMessage: (...a: any[]) => mockSend(...a),
  completeSwapHandoff: (...a: any[]) => mockComplete(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));

const mockGetClothingItem = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getClothingItem: (...a: any[]) => mockGetClothingItem(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
// Markers that keep the props they were given.
jest.mock('../../src/components/SwapPhoto', () => {
  const R = require('react');
  const SwapPhoto = (props: any) => R.createElement('SwapPhoto', props);
  return { __esModule: true, default: SwapPhoto, SwapPhoto };
});
// SwapSafetySheet has its own suite; here only what the thread tells it matters.
jest.mock('../../src/components/SwapSafetySheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('SwapSafetySheet', props) };
});

import SwapThreadScreen, { SWAP_MESSAGE_ACCESSORY_ID } from '../../src/screens/SwapThreadScreen';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { SwapError } from '../../src/services/swapErrors';
import {
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_PAYMENT_WARNING,
  SWAP_QUICK_REPLIES,
  SWAP_SAFETY_TIPS,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS_VERSION,
  SWAP_THREAD_POLL_MS,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/swapRules';
import type { SwapActions, SwapDetail, SwapItemView, SwapMessage } from '../../src/types/swap';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const settings = (over: object = {}) => ({
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

const none: SwapActions = { canAccept: false, canDecline: false, canCancel: false, canComplete: false, canMessage: false, messagesLeft: 0 };

const piece = (over: Partial<SwapItemView> = {}): SwapItemView => ({
  listingId: 'l1',
  side: 'offer',
  mine: true,
  name: 'Blue blazer',
  size: 'M',
  condition: 'good',
  photoPath: 'mine.jpg',
  photoPending: false,
  removalPending: false,
  ...over,
});
const theirs = (over: Partial<SwapItemView> = {}) =>
  piece({ listingId: 'l2', side: 'request', mine: false, name: 'Linen shirt', size: 'S', condition: 'like_new', photoPath: 'theirs.jpg', ...over });

const text = (id: number, body: string, mine = false): SwapMessage => ({ id, kind: 'text', body, mine, createdAt: '2026-10-02T10:00:00Z' });
const system = (id: number, code: string): SwapMessage => ({ id, kind: 'system', code, mine: false, createdAt: '2026-10-02T09:00:00Z' });

/** An accepted swap that I proposed, nobody has tapped yet. */
const detail = (over: Partial<SwapDetail> = {}): SwapDetail => ({
  id: 's1',
  status: 'accepted',
  closedReason: null,
  role: 'proposer',
  pairKind: 'friends',
  otherLabel: 'Bea',
  createdAt: '2026-10-01T10:00:00Z',
  expiresAt: '2026-10-31T10:00:00Z',
  closedAt: null,
  iDone: false,
  theyDone: false,
  autoCompleted: false,
  items: [piece(), theirs()],
  messages: [system(1, 'proposed'), system(2, 'accepted')],
  actions: { canAccept: false, canDecline: false, canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 },
  ...over,
});

const proposedForMe = (over: Partial<SwapDetail> = {}) =>
  detail({
    status: 'proposed',
    role: 'recipient',
    messages: [system(1, 'proposed'), text(2, 'Hi, fancy a swap?')],
    actions: { canAccept: true, canDecline: true, canCancel: false, canComplete: false, canMessage: true, messagesLeft: 190 },
    ...over,
  });

const handoffDone = { completed: false, receivedItemIds: [], photosPending: 0, removedItemIds: [], removalsPending: 0 };

/** Pressable shows up as two instances (memo and forwardRef) and Button wraps one; keep the outermost of each chain. */
const outermost = (nodes: ReactTestInstance[]) =>
  nodes.filter(n => {
    for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
    return true;
  });

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/**
 * Fake only the clock. React Native's test setup swaps in a Promise whose callbacks run on setImmediate and
 * nextTick; if those were faked and the clock restored before they ran, every later promise in the file
 * would wait forever.
 */
const fakeClock = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapThreadScreen />);
  });
  mounted.push(tree);
  const out = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const has = (label: string) => byLabel(label).length > 0;
  const input = () => tree.root.findAllByType(TextInput)[0];
  const type = async (value: string) => {
    await act(async () => {
      input().props.onChangeText(value);
    });
  };
  const bubble = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onLongPress === 'function'))[0];
  const safety = () => tree.root.findByType('SwapSafetySheet' as any);
  const photos = () => tree.root.findAllByType('SwapPhoto' as any);
  return { tree, out, byLabel, press, has, input, type, bubble, safety, photos };
};

let alertSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = { swapId: 's1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockSettings.mockReset().mockResolvedValue(settings());
  mockGetSwap.mockReset().mockResolvedValue(detail());
  mockRespond.mockReset().mockResolvedValue('accepted');
  mockCancel.mockReset().mockResolvedValue(undefined);
  mockSend.mockReset().mockResolvedValue(100);
  mockComplete.mockReset().mockResolvedValue(handoffDone);
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockGetClothingItem.mockReset().mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  jest.useRealTimers();
  (AppState as any).currentState = jest.fn();
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('SwapThreadScreen: what is on screen', () => {
  it('shows the other member in the header, the ticket, and the messages', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [system(1, 'proposed'), text(2, 'See you Saturday', false), text(3, 'Great!', true)] }));
    const { out } = await mount();
    expect(out()).toContain('Bea');
    expect(out()).toContain('You give');
    expect(out()).toContain('Blue blazer');
    expect(out()).toContain('Linen shirt');
    expect(out()).toContain('Offer sent');
    expect(out()).toContain('See you Saturday');
    expect(out()).toContain('Great!');
    expect(mockGetSwap).toHaveBeenCalledWith('s1', 0);
  });

  it('puts system lines in words and leaves out codes it does not know', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [system(1, 'proposed'), system(2, 'accepted'), system(3, 'something_new')] }));
    const { out } = await mount();
    expect(out()).toContain('Offer sent');
    expect(out()).toContain('Accepted. Both pieces are set aside for this swap.');
    expect(out()).not.toContain('something_new');
  });

  it('says what it is waiting for on an offer, from the member’s side', async () => {
    mockGetSwap.mockResolvedValue(detail({ status: 'proposed', role: 'proposer', actions: { ...none, canCancel: true, canMessage: true } }));
    expect((await mount()).out()).toContain('Waiting for Bea to answer.');
    mockGetSwap.mockResolvedValue(proposedForMe());
    expect((await mount()).out()).toContain('Bea would like to swap. Accept or decline below.');
  });

  it('goes back from the header', async () => {
    const { press } = await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows a skeleton until the swap arrives', async () => {
    mockGetSwap.mockReturnValue(new Promise(() => {}));
    const { tree, out } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(out()).not.toContain('You give');
  });
});

describe('SwapThreadScreen: buttons come only from `actions`', () => {
  const labels = ['Accept', 'Decline', 'Cancel offer', 'Cancel swap', 'We swapped'];
  const shown = (has: (l: string) => boolean) => labels.filter(has);

  it('offers Accept and Decline to the member who was asked', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    const { has } = await mount();
    expect(shown(has)).toEqual(['Accept', 'Decline']);
  });

  it('offers "Cancel offer" to the member who asked', async () => {
    mockGetSwap.mockResolvedValue(detail({ status: 'proposed', role: 'proposer', actions: { ...none, canCancel: true, canMessage: true } }));
    const { has } = await mount();
    expect(shown(has)).toEqual(['Cancel offer']);
  });

  it('offers "We swapped!" and "Cancel swap" on an accepted swap', async () => {
    const { has } = await mount();
    expect(shown(has)).toEqual(['Cancel swap', 'We swapped']);
  });

  it('keeps "Cancel swap" for the member who has not tapped after the other has, and asks first', async () => {
    mockGetSwap.mockResolvedValue(detail({ theyDone: true }));
    const { has, press, out } = await mount();
    expect(out()).toContain('Bea says you swapped. Tap “We swapped!” when you have your piece.');
    expect(shown(has)).toEqual(['Cancel swap', 'We swapped']);

    await press('Cancel swap');
    expect(mockCancel).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Cancel this swap?');
    expect(message).toBe('They already tapped “We swapped!”. Cancel only if you didn’t hand your piece over.');
    await act(async () => {
      buttons.find((b: any) => b.text === 'Cancel swap').onPress();
    });
    expect(mockCancel).toHaveBeenCalledWith('s1');
  });

  it('asks before cancelling an accepted swap, and lets the member keep it', async () => {
    const { press } = await mount();
    await press('Cancel swap');
    const [, message, buttons] = alertSpy.mock.calls[0];
    expect(message).toBe('This ends the swap.');
    expect(buttons.map((b: any) => b.text)).toEqual(['Keep swap', 'Cancel swap']);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('cancels an unanswered offer straight away and reloads', async () => {
    mockGetSwap.mockResolvedValueOnce(detail({ status: 'proposed', role: 'proposer', actions: { ...none, canCancel: true, canMessage: true } }));
    mockGetSwap.mockResolvedValue(
      detail({ status: 'cancelled', closedReason: 'cancelled_by_proposer', role: 'proposer', actions: none }),
    );
    const { press, out, has } = await mount();
    await press('Cancel offer');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledWith('s1');
    expect(out()).toContain('You cancelled this swap.');
    expect(has('Cancel offer')).toBe(false);
  });

  it('shows nothing to press after the member’s own tap: only a report remains', async () => {
    mockGetSwap.mockResolvedValue(detail({ iDone: true, actions: { ...none, canMessage: true, messagesLeft: 10 } }));
    const { has, out } = await mount();
    expect(shown(has)).toEqual([]);
    expect(out()).toContain('You tapped “We swapped!”. Waiting for Bea to do the same.');
    expect(has('Swap menu')).toBe(true);
  });

  it('draws no button when the server allows none, whatever the status says', async () => {
    mockGetSwap.mockResolvedValue(detail({ status: 'proposed', role: 'recipient', actions: { ...none, canMessage: true } }));
    const { has } = await mount();
    expect(shown(has)).toEqual([]);
  });

  it('lets a silent member collect their piece after an automatic finish, and says so', async () => {
    mockGetSwap.mockResolvedValue(
      detail({
        status: 'completed',
        closedReason: 'completed',
        autoCompleted: true,
        theyDone: true,
        actions: { ...none, canComplete: true, canMessage: true, messagesLeft: 5 },
      }),
    );
    const { has, out } = await mount();
    expect(has('We swapped')).toBe(true);
    expect(out()).toContain('Bea tapped “We swapped!” and the swap was finished.');
  });
});

describe('SwapThreadScreen: answering', () => {
  it('accepts, then reloads what the server now says', async () => {
    mockGetSwap.mockResolvedValueOnce(proposedForMe());
    mockGetSwap.mockResolvedValue(detail());
    const { press, has } = await mount();
    await press('Accept');
    expect(mockRespond).toHaveBeenCalledWith('s1', 'accept');
    expect(mockGetSwap).toHaveBeenCalledTimes(2);
    expect(has('Accept')).toBe(false);
    expect(has('We swapped')).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('declines', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    mockRespond.mockResolvedValue('declined');
    const { press } = await mount();
    await press('Decline');
    expect(mockRespond).toHaveBeenCalledWith('s1', 'decline');
  });

  it('says "That piece is no longer available" when accepting comes back unavailable', async () => {
    mockGetSwap.mockResolvedValueOnce(proposedForMe());
    mockGetSwap.mockResolvedValue(detail({ status: 'cancelled', closedReason: 'unavailable', actions: none }));
    mockRespond.mockResolvedValue('unavailable');
    const { press, out } = await mount();
    await press('Accept');
    expect(alertSpy).toHaveBeenCalledWith('That piece is no longer available');
    expect(out()).toContain('This swap is no longer available.');
    expect(out()).not.toMatch(/block|report|suspend/i);
  });

  it('shows a short alert for a failed answer, keeps the buttons, and reloads a swap that has moved on', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    mockRespond.mockRejectedValueOnce({ message: 'Network request failed' });
    const { press, has } = await mount();
    await press('Accept');
    expect(alertSpy).toHaveBeenCalledWith('Couldn’t do that', 'You seem to be offline. Check your connection and try again.');
    expect(has('Accept')).toBe(true);

    mockRespond.mockRejectedValueOnce(new SwapError('swap_not_open'));
    const calls = mockGetSwap.mock.calls.length;
    await press('Accept');
    expect(alertSpy).toHaveBeenLastCalledWith('Couldn’t do that', 'That swap has already changed. Here’s the latest.');
    expect(mockGetSwap.mock.calls.length).toBe(calls + 1);
  });

  it('never shows a raw error message', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    mockRespond.mockRejectedValueOnce(new Error('relation "swaps" exploded'));
    const { press } = await mount();
    await press('Accept');
    expect(alertSpy).toHaveBeenCalledWith('Couldn’t do that', 'Couldn’t send your answer. Please try again.');
  });
});

describe('SwapThreadScreen: the terms moved on', () => {
  it('opens the terms, and repeats the same action once the member has agreed', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    mockRespond.mockRejectedValueOnce(new SwapError('swap_terms_required'));
    const { press, out } = await mount();
    await press('Accept');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(out()).toContain('I agree');
    expect(mockRespond).toHaveBeenCalledTimes(1);

    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockRespond).toHaveBeenCalledTimes(2);
    expect(mockRespond).toHaveBeenLastCalledWith('s1', 'accept');
    expect(out()).not.toContain('I agree');
  });

  it('drops the action if the member closes the terms', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    mockRespond.mockRejectedValueOnce(new SwapError('swap_terms_required'));
    const { press, out } = await mount();
    await press('Accept');
    await press('Not now');
    expect(out()).not.toContain('I agree');
    expect(mockRespond).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('repeats a message with the same clientRef', async () => {
    mockSend.mockRejectedValueOnce(new SwapError('swap_terms_required'));
    const { type, press } = await mount();
    await type('Hello there');
    await press('Send message');
    await press('I agree');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][2]).toBe(mockSend.mock.calls[0][2]);
  });
});

describe('SwapThreadScreen: the composer', () => {
  it('sends the text, clears the field and shows the message', async () => {
    mockSend.mockResolvedValue(50);
    const { type, press, input, out } = await mount();
    await type('  Saturday works  ');
    await press('Send message');
    expect(mockSend).toHaveBeenCalledWith('s1', 'Saturday works', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(input().props.value).toBe('');
    expect(out()).toContain('Saturday works');
  });

  it('keeps what was typed when a send fails, and reuses the same clientRef on retry', async () => {
    mockSend.mockRejectedValueOnce({ message: 'Network request failed' });
    const { type, press, input, out } = await mount();
    await type('Saturday works');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith('Couldn’t do that', 'You seem to be offline. Check your connection and try again.');
    expect(input().props.value).toBe('Saturday works');
    expect(out()).not.toContain('Saturday works Saturday works');

    await press('Send message');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][2]).toBe(mockSend.mock.calls[0][2]);
    expect(input().props.value).toBe('');
  });

  it('uses a fresh clientRef for the next message, and for changed text', async () => {
    mockSend.mockRejectedValueOnce({ message: 'Network request failed' });
    const { type, press } = await mount();
    await type('First');
    await press('Send message');
    await type('First, but different');
    await press('Send message');
    await type('Second');
    await press('Send message');
    const refs = mockSend.mock.calls.map(c => c[2]);
    expect(new Set(refs).size).toBe(3);
  });

  it('explains a message the server refuses, in plain words', async () => {
    mockSend.mockRejectedValueOnce(new SwapError('text_not_allowed', 'text_not_allowed', 'message', 'payment'));
    const { type, press, input } = await mount();
    await type('send me a gift card');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith('Couldn’t do that', 'Swaps are item for item. Please don’t mention payments or gift cards.');
    expect(input().props.value).toBe('send me a gift card');
  });

  it('is a multiline field of 500 characters with a counter', async () => {
    const { input, type, out } = await mount();
    expect(input().props.multiline).toBe(true);
    expect(input().props.maxLength).toBe(500);
    expect(input().props.accessibilityLabel).toBe('Message');
    expect(out()).toContain('0/500');
    await type('Hello');
    expect(out()).toContain('5/500');
  });

  it('will not send an empty message', async () => {
    const { tree, press } = await mount();
    const send = tree.root.findAll(n => n.props.accessibilityLabel === 'Send message' && n.props.accessibilityState !== undefined);
    expect(send.length).toBeGreaterThan(0);
    expect(send.every(n => n.props.accessibilityState.disabled === true)).toBe(true);
    await press('Send message');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('fills the field from a quick reply instead of sending it', async () => {
    const { press, input } = await mount();
    for (const reply of SWAP_QUICK_REPLIES) {
      // each chip is on screen under its own words
      expect((await mount()).has(reply)).toBe(true);
    }
    await press(SWAP_QUICK_REPLIES[0]);
    expect(input().props.value).toBe(SWAP_QUICK_REPLIES[0]);
    await press(SWAP_QUICK_REPLIES[3]);
    expect(input().props.value).toBe(`${SWAP_QUICK_REPLIES[0]} ${SWAP_QUICK_REPLIES[3]}`);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('has no composer on a swap that has ended', async () => {
    mockGetSwap.mockResolvedValue(
      detail({ status: 'declined', closedReason: 'declined', role: 'recipient', actions: none, messages: [system(1, 'proposed'), system(2, 'declined')] }),
    );
    const { tree, out, has } = await mount();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(has('Send message')).toBe(false);
    expect(out()).toContain('This swap has ended');
    expect(out()).toContain('You declined this offer.');
  });

  it('says so, instead of "ended", when messages are paused on a live swap', async () => {
    mockGetSwap.mockResolvedValue(detail({ actions: { ...detail().actions, canMessage: false, messagesLeft: 0 } }));
    const { tree, out } = await mount();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(out()).toContain('You can’t send messages in this swap right now.');
    expect(out()).not.toContain('This swap has ended');
  });
});

describe('SwapThreadScreen: keeping the thread fresh', () => {
  it('asks again every 15 seconds for messages after the last one and merges them by id', async () => {
    fakeClock();
    mockGetSwap.mockResolvedValueOnce(detail({ messages: [text(1, 'One'), text(2, 'Two', true)] }));
    const { out } = await mount();
    expect(mockGetSwap).toHaveBeenCalledTimes(1);

    mockGetSwap.mockResolvedValueOnce(detail({ messages: [text(2, 'Two, edited', true), text(3, 'Three')] }));
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(2);
    expect(mockGetSwap).toHaveBeenLastCalledWith('s1', 2);
    expect(out()).toContain('One');
    expect(out()).toContain('Two, edited');
    expect(out()).not.toMatch(/Two(?!,)/);
    expect(out()).toContain('Three');

    mockGetSwap.mockResolvedValueOnce(detail({ messages: [] }));
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(mockGetSwap).toHaveBeenLastCalledWith('s1', 3);
    expect(out()).toContain('One');
    expect(out()).toContain('Three');
  });

  it('takes new buttons from a poll: an offer that was accepted shows the next steps', async () => {
    fakeClock();
    mockGetSwap.mockResolvedValueOnce(detail({ status: 'proposed', role: 'proposer', actions: { ...none, canCancel: true, canMessage: true } }));
    const { has } = await mount();
    expect(has('Cancel offer')).toBe(true);
    mockGetSwap.mockResolvedValueOnce(detail());
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(has('Cancel offer')).toBe(false);
    expect(has('We swapped')).toBe(true);
  });

  it('stays quiet when a poll fails', async () => {
    fakeClock();
    const { out } = await mount();
    mockGetSwap.mockRejectedValueOnce({ message: 'Network request failed' });
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(2);
    expect(out()).toContain('Blue blazer');
    expect(out()).not.toContain('Couldn\'t load your swap');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not poll while the app is in the background, or once the swap can no longer change', async () => {
    fakeClock();
    (AppState as any).currentState = 'background';
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS * 3);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(1);
    (AppState as any).currentState = 'active';
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(2);
  });

  it('stops asking about a declined, cancelled or expired swap', async () => {
    fakeClock();
    mockGetSwap.mockResolvedValue(detail({ status: 'expired', closedReason: 'expired', actions: none }));
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS * 3);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(1);
  });

  it('keeps asking about a completed swap, because messages are allowed for a week', async () => {
    fakeClock();
    mockGetSwap.mockResolvedValue(detail({ status: 'completed', closedReason: 'completed', iDone: true, theyDone: true, actions: { ...none, canMessage: true, messagesLeft: 9 } }));
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the screen goes away', async () => {
    fakeClock();
    const { tree } = await mount();
    await act(async () => {
      tree.unmount();
    });
    mounted.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS * 3);
    });
    expect(mockGetSwap).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow answer that was asked for before one it already showed', async () => {
    fakeClock();
    const slow = deferred<SwapDetail>();
    const { out, tree } = await mount();
    mockGetSwap.mockReturnValueOnce(slow.promise);
    await act(async () => {
      jest.advanceTimersByTime(SWAP_THREAD_POLL_MS);
    });
    // A pull to refresh asked later and answered first.
    mockGetSwap.mockResolvedValueOnce(detail({ messages: [text(1, 'Newest')], status: 'completed', closedReason: 'completed', iDone: true, theyDone: true, actions: none }));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain('Newest');
    await act(async () => {
      slow.resolve(detail({ messages: [text(1, 'Stale')] }));
    });
    expect(out()).toContain('Newest');
    expect(out()).not.toContain('Stale');
  });

  it('reloads by pull to refresh and reports a failed refresh as a banner over the thread', async () => {
    const { tree, out } = await mount();
    // Offline, the settings call fails too; that must not hide the thread behind a full-screen error.
    mockSettings.mockRejectedValue({ message: 'Network request failed' });
    mockGetSwap.mockRejectedValueOnce({ message: 'Network request failed' });
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain('Couldn\'t load your swap');
    expect(out()).toContain('Blue blazer');
  });
});

describe('SwapThreadScreen: states of the swap itself', () => {
  it('shows "This swap is no longer available" with a way back when the swap is gone', async () => {
    mockGetSwap.mockRejectedValue(new SwapError('swap_unavailable'));
    const { out, press } = await mount();
    expect(out()).toContain('This swap is no longer available');
    await press('Back to My swaps');
    expect(mockNavigate).toHaveBeenCalledWith('MySwaps');
  });

  it('shows the load error with Try again when the swap cannot be loaded at all', async () => {
    mockGetSwap.mockRejectedValueOnce({ message: 'Network request failed' });
    const { out, press } = await mount();
    expect(out()).toContain('Couldn\'t load your swap');
    mockGetSwap.mockResolvedValue(detail());
    await press('Try again to load your swap');
    expect(out()).toContain('Blue blazer');
  });

  it('opens a swap with a blocked member as a closed shell: no photos, no buttons, no composer, no reason', async () => {
    mockGetSwap.mockResolvedValue(
      detail({
        status: 'cancelled',
        closedReason: 'unavailable',
        otherLabel: 'Swap member',
        items: [piece({ photoPath: null }), theirs({ photoPath: null })],
        messages: [system(1, 'proposed'), system(2, 'unavailable')],
        actions: none,
      }),
    );
    const { out, photos, tree, has } = await mount();
    expect(out()).toContain('Swap member');
    expect(out()).toContain('This swap is no longer available.');
    expect(out()).toContain('No longer available');
    expect(out().toLowerCase()).not.toContain('block');
    expect(photos().every(p => !p.props.path)).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    for (const label of ['Accept', 'Decline', 'Cancel offer', 'Cancel swap', 'We swapped', 'Send message']) expect(has(label)).toBe(false);
    expect(out()).toContain('This swap has ended');
  });

  it('explains a cancellation after the member’s own tap, and what it means for the piece they added', async () => {
    mockGetSwap.mockResolvedValue(
      detail({ status: 'cancelled', closedReason: 'cancelled_by_recipient', role: 'proposer', iDone: true, actions: none }),
    );
    const { out } = await mount();
    expect(out()).toMatch(/They cancelled this swap after you tapped “We swapped!”\. The piece you added stays in your closet\./);
  });
});

describe('SwapThreadScreen: "We swapped!"', () => {
  it('asks first, and does nothing until the member confirms', async () => {
    const { press, out } = await mount();
    await press('We swapped');
    expect(out()).toContain('Only tap this once you have actually swapped.');
    expect(out()).toContain('Linen shirt will be added to your closet, and Blue blazer will be removed from it.');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('runs the hand-off with keepGiven false by default', async () => {
    const { press, out } = await mount();
    await press('We swapped');
    await press('Yes, we swapped!');
    expect(mockComplete).toHaveBeenCalledWith('s1', { keepGiven: false });
    expect(out()).not.toContain('Only tap this once');
  });

  it('passes keepGiven true when the member keeps theirs', async () => {
    const { press, tree } = await mount();
    await press('We swapped');
    await act(async () => {
      tree.root.findAllByType(Switch)[0].props.onValueChange(true);
    });
    await press('Yes, we swapped!');
    expect(mockComplete).toHaveBeenCalledWith('s1', { keepGiven: true });
  });

  it('does not close or run twice while the hand-off is running', async () => {
    const slow = deferred<typeof handoffDone>();
    mockComplete.mockReturnValue(slow.promise);
    const { press, out, tree } = await mount();
    await press('We swapped');
    await press('Yes, we swapped!');
    await press('Yes, we swapped!');
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(out()).toContain('Only tap this once');
    await act(async () => {
      slow.resolve(handoffDone);
    });
    expect(out()).not.toContain('Only tap this once');
    expect(tree).toBeTruthy();
  });

  it('keeps the sheet open and says why when the hand-off fails', async () => {
    mockComplete.mockRejectedValueOnce({ message: 'Network request failed' });
    const { press, out } = await mount();
    await press('We swapped');
    await press('Yes, we swapped!');
    expect(alertSpy).toHaveBeenCalledWith('Couldn’t do that', 'You seem to be offline. Check your connection and try again.');
    expect(out()).toContain('Only tap this once');
    mockComplete.mockResolvedValue(handoffDone);
    await press('Yes, we swapped!');
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(out()).not.toContain('Only tap this once');
  });

  it('celebrates and offers the new piece once the member’s side is done', async () => {
    mockGetSwap.mockResolvedValueOnce(detail());
    mockGetSwap.mockResolvedValue(
      detail({
        iDone: true,
        items: [piece({ removalPending: false }), theirs({ claimedItemId: 'c1' })],
        actions: { ...none, canMessage: true, messagesLeft: 10 },
      }),
    );
    mockGetClothingItem.mockResolvedValue({ id: 'c1', name: 'Linen shirt' });
    const { press, out } = await mount();
    await press('We swapped');
    await press('Yes, we swapped!');
    expect(out()).toContain('Swapped!');
    expect(out()).toContain('Linen shirt is in your closet.');
    await press('See it in my closet');
    expect(mockGetClothingItem).toHaveBeenCalledWith('c1');
    expect(mockNavigate).toHaveBeenCalledWith('ItemDetails', { item: { id: 'c1', name: 'Linen shirt' } });
  });

  it('says so if the piece is no longer in the closet', async () => {
    mockGetSwap.mockResolvedValue(
      detail({ iDone: true, items: [piece(), theirs({ claimedItemId: 'c1' })], actions: { ...none, canMessage: true, messagesLeft: 10 } }),
    );
    mockGetClothingItem.mockResolvedValue(null);
    const { press } = await mount();
    await press('See it in my closet');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Not in your closet', 'That piece is no longer in your closet.');
  });

  it('does not celebrate while something is still to finish', async () => {
    mockGetSwap.mockResolvedValue(
      detail({ iDone: true, items: [piece(), theirs({ claimedItemId: 'c1', photoPending: true })], actions: { ...none, canMessage: true, messagesLeft: 10 } }),
    );
    const { out, has } = await mount();
    expect(has('See it in my closet')).toBe(false);
    expect(out()).not.toContain('is in your closet.');
  });
});

describe('SwapThreadScreen: finishing an interrupted hand-off', () => {
  const interrupted = (items: SwapItemView[] = [piece(), theirs({ claimedItemId: 'c1', photoPending: true })]) =>
    detail({ iDone: true, items, actions: { ...none, canMessage: true, messagesLeft: 10 } });

  it('shows a "Finish up" banner and tries once on its own', async () => {
    mockGetSwap.mockResolvedValue(interrupted());
    const { out, has } = await mount();
    expect(out()).toContain('Your new piece’s photo is still being added to your closet.');
    expect(has('Finish up')).toBe(true);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledWith('s1', { keepGiven: false });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('names the other leftover too', async () => {
    mockGetSwap.mockResolvedValue(interrupted([piece({ removalPending: true }), theirs({ claimedItemId: 'c1' })]));
    expect((await mount()).out()).toContain('The piece you gave is still in your closet.');
    mockGetSwap.mockResolvedValue(interrupted([piece({ removalPending: true }), theirs({ claimedItemId: 'c1', photoPending: true })]));
    expect((await mount()).out()).toContain('are still to do');
  });

  it('does not try again on its own, but does when the member taps "Finish up"', async () => {
    mockGetSwap.mockResolvedValue(interrupted());
    mockComplete.mockResolvedValue({ ...handoffDone, photosPending: 1 });
    const { press } = await mount();
    expect(mockComplete).toHaveBeenCalledTimes(1);

    await press('Finish up');
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith('Not quite done', 'Some of it couldn’t finish. Check your connection and try again.');

    mockComplete.mockResolvedValue(handoffDone);
    await press('Finish up');
    expect(mockComplete).toHaveBeenCalledTimes(3);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the automatic try fails', async () => {
    mockGetSwap.mockResolvedValue(interrupted());
    mockComplete.mockRejectedValue({ message: 'Network request failed' });
    const { has } = await mount();
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(has('Finish up')).toBe(true);
  });

  it('does nothing when nothing is left', async () => {
    mockGetSwap.mockResolvedValue(detail({ iDone: true, items: [piece(), theirs({ claimedItemId: 'c1' })], actions: { ...none, canMessage: true, messagesLeft: 10 } }));
    const { has } = await mount();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(has('Finish up')).toBe(false);
  });

  it('disappears once the server says it is finished', async () => {
    mockGetSwap.mockResolvedValueOnce(interrupted());
    mockGetSwap.mockResolvedValue(detail({ iDone: true, items: [piece(), theirs({ claimedItemId: 'c1' })], actions: { ...none, canMessage: true, messagesLeft: 10 } }));
    const { has, out } = await mount();
    expect(has('Finish up')).toBe(false);
    expect(out()).toContain('Linen shirt is in your closet.');
  });
});

describe('SwapThreadScreen: reporting and blocking', () => {
  it('opens the safety sheet for the swap from the header menu', async () => {
    const { press, safety } = await mount();
    expect(safety().props.visible).toBe(false);
    await press('Swap menu');
    expect(safety().props).toMatchObject({ visible: true, refType: 'swap', refId: 's1', label: 'Bea', messageId: undefined });
  });

  it('reports one of the other member’s messages on a long press, with its id', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(7, 'Pay me first'), text(8, 'Okay', true)] }));
    const { bubble, safety } = await mount();
    await act(async () => {
      bubble('Bea: Pay me first').props.onLongPress();
    });
    expect(safety().props).toMatchObject({ visible: true, refType: 'swap', refId: 's1', label: 'Bea', messageId: 7 });
  });

  it('does not make the member’s own messages reportable', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(8, 'Okay', true)] }));
    const { tree } = await mount();
    expect(tree.root.findAll(n => typeof n.props.onLongPress === 'function')).toHaveLength(0);
  });

  it('offers the same report through the screen reader’s actions', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(7, 'Hello')] }));
    const { bubble, safety } = await mount();
    expect(bubble('Bea: Hello').props.accessibilityActions).toEqual([{ name: 'report', label: 'Report this message' }]);
    await act(async () => {
      bubble('Bea: Hello').props.onAccessibilityAction({ nativeEvent: { actionName: 'report' } });
    });
    expect(safety().props).toMatchObject({ visible: true, messageId: 7 });
  });

  it('forgets the message when the menu is used afterwards', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(7, 'Hello')] }));
    const { bubble, press, safety } = await mount();
    await act(async () => {
      bubble('Bea: Hello').props.onLongPress();
    });
    await act(async () => {
      safety().props.onClose();
    });
    await press('Swap menu');
    expect(safety().props.messageId).toBeUndefined();
  });

  it('leaves the thread after a block', async () => {
    const { press, safety } = await mount();
    await press('Swap menu');
    await act(async () => {
      safety().props.onBlocked();
    });
    expect(safety().props.visible).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('warns about payment talk in the other member’s message, with a one-tap Report, and never blocks it', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(7, 'can you venmo me a deposit?'), text(8, 'paypal is fine', true)] }));
    const { out, press, safety } = await mount();
    expect(out()).toContain('can you venmo me a deposit?');
    expect(out().split(SWAP_PAYMENT_WARNING)).toHaveLength(2); // once, not for the member’s own message
    await press('Report this message');
    expect(safety().props).toMatchObject({ visible: true, refType: 'swap', messageId: 7 });
  });

  it('shows no warning for ordinary messages', async () => {
    mockGetSwap.mockResolvedValue(detail({ messages: [text(7, 'See you at 3')] }));
    const { out, has } = await mount();
    expect(out()).not.toContain(SWAP_PAYMENT_WARNING);
    expect(has('Report this message')).toBe(false);
  });
});

describe('SwapThreadScreen: the safety card', () => {
  it('is collapsed on an offer and opens when the member taps it', async () => {
    mockGetSwap.mockResolvedValue(proposedForMe());
    const { out, press, byLabel } = await mount();
    expect(out()).toContain('Swap safely');
    expect(out()).not.toContain(SWAP_SAFETY_TIPS[0]);
    expect(byLabel('Swap safely')[0].props.accessibilityState).toMatchObject({ expanded: false });
    await press('Swap safely');
    expect(out()).toContain(SWAP_SAFETY_TIPS[0]);
    await press('Swap safely');
    expect(out()).not.toContain(SWAP_SAFETY_TIPS[0]);
  });

  it('opens by itself once the swap is accepted, and the member can still close it', async () => {
    mockGetSwap.mockResolvedValueOnce(proposedForMe());
    mockGetSwap.mockResolvedValue(detail());
    const { out, press } = await mount();
    expect(out()).not.toContain(SWAP_SAFETY_TIPS[0]);
    await press('Accept');
    for (const tip of SWAP_SAFETY_TIPS) expect(out()).toContain(tip);
    await press('Swap safely');
    expect(out()).not.toContain(SWAP_SAFETY_TIPS[0]);
  });

  it('is not shown on a swap that was declined, cancelled or has run out', async () => {
    mockGetSwap.mockResolvedValue(detail({ status: 'cancelled', closedReason: 'cancelled_by_proposer', actions: none }));
    const { has } = await mount();
    expect(has('Swap safely')).toBe(false);
  });
});

describe('SwapThreadScreen: keyboard', () => {
  it('gives the composer its own accessory bar, not the shared Done bar', async () => {
    const { tree, input } = await mount();
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe(SWAP_MESSAGE_ACCESSORY_ID);
    expect(input().props.inputAccessoryViewID).toBe(SWAP_MESSAGE_ACCESSORY_ID);
    expect(SWAP_MESSAGE_ACCESSORY_ID).toBe('smartcloset-swap-message-done');
    expect(SWAP_MESSAGE_ACCESSORY_ID).not.toBe(KEYBOARD_DONE_ID);
    expect(input().props.inputAccessoryViewID).not.toBe(KEYBOARD_DONE_ID);
  });

  it('labels the bar "Done"', async () => {
    const { tree } = await mount();
    const done = outermost(tree.root.findAll(n => n.props.accessibilityLabel === 'Done' && typeof n.props.onPress === 'function'));
    expect(done).toHaveLength(1);
  });

  it('has exactly one KeyboardActionBar and no KeyboardDoneBar in the source', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/SwapThreadScreen.tsx'), 'utf8');
    expect(source.match(/<KeyboardActionBar\b/g)).toHaveLength(1);
    expect(source).toMatch(/<KeyboardActionBar nativeID=\{SWAP_MESSAGE_ACCESSORY_ID\} label="Done"/);
    expect(source).toMatch(/inputAccessoryViewID=\{SWAP_MESSAGE_ACCESSORY_ID\}/);
    expect(source).not.toMatch(/<KeyboardDoneBar\b/);
    expect(source).not.toMatch(/keyboardDoneProps/);
  });

  it('keeps the composer above the keyboard: a keyboard-avoiding screen, with the field outside the scroll view', async () => {
    const { KeyboardAvoidingView, ScrollView } = require('react-native');
    const { input } = await mount();
    const above: ReactTestInstance[] = [];
    for (let n = input().parent; n; n = n.parent) above.push(n);
    expect(above.find(a => a.type === KeyboardAvoidingView)?.props.behavior).toBe('padding');
    expect(above.find(a => a.type === ScrollView)).toBeUndefined();
  });
});

describe('SwapThreadScreen: who can use it', () => {
  it('asks a guest to sign in and reads nothing', async () => {
    mockSettings.mockRejectedValue(new SwapError('not_authenticated'));
    const { out, press } = await mount();
    expect(out()).toContain('Sign in to swap');
    await press('Sign in');
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    expect(mockGetSwap).not.toHaveBeenCalled();
  });

  it('says swaps are paused', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    const { out } = await mount();
    expect(out()).toContain('Swaps are paused');
    expect(out()).toContain(SWAP_PAUSED_MESSAGE);
    expect(mockGetSwap).not.toHaveBeenCalled();
  });

  it('says swaps are not available yet on a server without them', async () => {
    mockSettings.mockRejectedValue({ message: 'x', code: 'PGRST202' });
    const { out } = await mount();
    expect(out()).toContain(SWAP_NOT_DEPLOYED_MESSAGE);
    expect(mockGetSwap).not.toHaveBeenCalled();
  });

  it('asks for an update, or says swaps are being updated, and records nothing', async () => {
    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2099-01', termsCurrent: false }));
    const first = await mount();
    expect(first.out()).toContain(SWAP_UPDATE_REQUIRED_MESSAGE);
    expect(first.out()).not.toContain('I agree');

    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2000-01', termsCurrent: false }));
    const second = await mount();
    expect(second.out()).toContain(SWAP_SERVER_BEHIND_MESSAGE);
    expect(second.out()).not.toContain('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockGetSwap).not.toHaveBeenCalled();
  });

  it('opens the terms by itself, and loads the swap after "I agree"', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false }));
    const { out, press } = await mount();
    expect(out()).toContain('Read the swap terms to get started');
    expect(out()).toContain('I agree');
    expect(mockGetSwap).not.toHaveBeenCalled();
    mockSettings.mockResolvedValue(settings());
    await press('I agree');
    expect(mockGetSwap).toHaveBeenCalledWith('s1', 0);
    expect(out()).toContain('Blue blazer');
  });

  it('keeps history readable for a suspended member, with a notice', async () => {
    mockSettings.mockResolvedValue(settings({ suspended: true }));
    mockGetSwap.mockResolvedValue(detail({ status: 'cancelled', closedReason: 'unavailable', actions: none }));
    const { out, tree } = await mount();
    expect(out()).toContain('Swapping is paused on your account');
    expect(out()).toContain('Email support');
    expect(out()).toContain('Blue blazer');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('shows the load error when the access check itself fails', async () => {
    mockSettings.mockRejectedValueOnce({ message: 'Network request failed' });
    const { out, press } = await mount();
    expect(out()).toContain('Couldn\'t load your swap');
    mockSettings.mockResolvedValue(settings());
    await press('Try again to load your swap');
    expect(out()).toContain('Blue blazer');
  });
});
