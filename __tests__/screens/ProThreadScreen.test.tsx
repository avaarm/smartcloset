import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, AppState, InputAccessoryView, KeyboardAvoidingView, RefreshControl, ScrollView, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = { connectionId: 'c1' };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockConnection = jest.fn();
const mockThread = jest.fn();
const mockSend = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
  getProThread: (...a: any[]) => mockThread(...a),
  sendProMessage: (...a: any[]) => mockSend(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
// The shared sheets and notice have their own suites; here only what the thread tells them matters.
jest.mock('../../src/components/ProSafetySheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProSafetySheet', props) };
});
jest.mock('../../src/components/ProTermsSheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProTermsSheet', props) };
});
jest.mock('../../src/components/ProAccessNotice', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProAccessNotice', props) };
});

import ProThreadScreen, { PRO_MESSAGE_ACCESSORY_ID } from '../../src/screens/ProThreadScreen';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_PAUSED_MESSAGE,
  PRO_PAYMENT_WARNING,
  PRO_POLL_MS,
  PRO_QUICK_REPLIES,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
  PRO_SUSPENDED_MESSAGE,
  PRO_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/proRules';
import type { ProConnectionDetail, ProMessage, ProStatus, ProThread } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: null,
  client: { termsCurrent: true, connections: 1, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const connection = (over: Partial<ProConnectionDetail> = {}): ProConnectionDetail => ({
  id: 'c1',
  myRole: 'client',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Ann',
  myAlias: 'Bea',
  safetyOnly: false,
  stylist: null,
  closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 0, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: false, canEnd: true,
    canViewCloset: false, canShare: true, canStopSharing: true, canRename: true,
  },
  ...over,
});

const them = (id: number, body: string): ProMessage => ({ id, from: 'them', body, at: '2026-10-02T10:00:00Z' });
const mine = (id: number, body: string): ProMessage => ({ id, from: 'me', body, at: '2026-10-02T10:00:00Z' });
const system = (id: number, code: string): ProMessage => ({ id, from: 'system', body: '', code, at: '2026-10-02T09:00:00Z' });
const thread = (messages: ProMessage[], over: Partial<ProThread> = {}): ProThread => ({ messages, hasMore: false, canSend: true, ...over });

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
    tree = renderer.create(<ProThreadScreen />);
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
  const safety = () => tree.root.findByType('ProSafetySheet' as any);
  const terms = () => tree.root.findAllByType('ProTermsSheet' as any);
  const notice = () => tree.root.findAllByType('ProAccessNotice' as any);
  return { tree, out, byLabel, press, has, input, type, bubble, safety, terms, notice };
};

let alertSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = { connectionId: 'c1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(connection());
  mockThread.mockReset().mockResolvedValue(thread([system(1, 'connected'), them(2, 'Welcome!'), mine(3, 'Thanks')]));
  mockSend.mockReset().mockResolvedValue({ id: 100, at: '2026-10-02T11:00:00Z' });
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

describe('ProThreadScreen: what is on screen', () => {
  it('shows the other person in the header and the messages, with system lines in words', async () => {
    const { out } = await mount();
    expect(out()).toContain('Ann');
    expect(out()).toContain("You're connected.");
    expect(out()).toContain('Welcome!');
    expect(out()).toContain('Thanks');
  });

  it('reads the connection and the latest page of messages', async () => {
    await mount();
    expect(mockConnection).toHaveBeenCalledWith('c1');
    expect(mockThread).toHaveBeenCalledWith('c1', { limit: 50 });
  });

  it('puts every kind of system line in words and leaves out a code it does not know', async () => {
    mockThread.mockResolvedValue(thread([system(1, 'connected'), system(2, 'sharing_on'), system(3, 'ended'), system(4, 'something_new')], { canSend: false }));
    const { out } = await mount();
    expect(out()).toContain("You're connected.");
    expect(out()).toContain('Closet sharing is on.');
    expect(out()).toContain('This connection has ended.');
    expect(out()).not.toContain('something_new');
  });

  it('goes back from the header', async () => {
    const { press } = await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows a skeleton until the thread arrives', async () => {
    mockThread.mockReturnValue(new Promise(() => {}));
    const { tree, out } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(out()).not.toContain('Welcome!');
  });

  it('says so when there is nothing yet, and invites a hello only to someone who can write', async () => {
    mockThread.mockResolvedValue(thread([]));
    expect((await mount()).out()).toContain('No messages yet. Say hello.');
    mockThread.mockResolvedValue(thread([], { canSend: false }));
    expect((await mount()).out()).toContain('There are no messages to show.');
  });

  it('shows the same plain words to a stylist reading a client\'s thread', async () => {
    mockConnection.mockResolvedValue(connection({ myRole: 'stylist', otherLabel: 'Bea' }));
    const { out } = await mount();
    expect(out()).toContain('Bea');
  });

  it('has no commerce wording and no link text of its own', async () => {
    const { out } = await mount();
    expect(out()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });
});

describe('ProThreadScreen: the composer', () => {
  it('sends the trimmed text with a clientRef, clears the field and shows the message', async () => {
    const { type, press, input, out } = await mount();
    await type('  Saturday works  ');
    await press('Send message');
    expect(mockSend).toHaveBeenCalledWith('c1', 'Saturday works', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(input().props.value).toBe('');
    expect(out()).toContain('Saturday works');
  });

  it('asks for what the other person wrote meanwhile after sending', async () => {
    const { type, press, out } = await mount();
    mockThread.mockResolvedValueOnce(thread([them(50, 'See you then'), mine(100, 'Hello')]));
    await type('Hello');
    await press('Send message');
    // Ids are shared by every connection, so the id of the message just sent is no cursor: a reply that was
    // written before it has a smaller id. The follow-up asks after the newest message it had before the send.
    expect(mockThread).toHaveBeenLastCalledWith('c1', { afterId: 3 });
    expect(out()).toContain('See you then');
    expect(out().match(/Hello/g)).toHaveLength(1);
  });

  it('keeps what was typed when a send fails, and reuses the same clientRef on retry', async () => {
    mockSend.mockRejectedValueOnce({ message: 'Network request failed' });
    const { type, press, input, out } = await mount();
    await type('Saturday works');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", 'You seem to be offline. Please try again.');
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
    expect(new Set(mockSend.mock.calls.map(c => c[2])).size).toBe(3);
  });

  it('explains a message the server refuses, in plain words, and keeps it', async () => {
    mockSend.mockRejectedValueOnce(new ProError('text_not_allowed', 'text_not_allowed', 'message', 'payment'));
    const { type, press, input } = await mount();
    await type('send me a gift card');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", "Payment wording isn't allowed here.");
    expect(input().props.value).toBe('send me a gift card');
  });

  it('never shows a raw error', async () => {
    mockSend.mockRejectedValueOnce(new Error('relation "pro_messages" exploded'));
    const { type, press } = await mount();
    await type('Hello');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", "Couldn't send your message. Please try again.");
  });

  it('reloads and says so when the connection ended while the person was typing', async () => {
    mockSend.mockRejectedValueOnce(new ProError('connection_ended'));
    const { type, press, out } = await mount();
    mockThread.mockResolvedValue(thread([system(4, 'ended')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    await type('Hello');
    await press('Send message');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", 'This connection has ended.');
    expect(out()).toContain('This connection has ended.');
    expect(mockThread.mock.calls.length).toBeGreaterThan(1);
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

  it('sends once while a send is in flight', async () => {
    const slow = deferred<{ id: number; at: string }>();
    mockSend.mockReturnValue(slow.promise);
    const { type, press } = await mount();
    await type('Hello');
    await press('Send message');
    await press('Send message');
    expect(mockSend).toHaveBeenCalledTimes(1);
    await act(async () => {
      slow.resolve({ id: 100, at: '2026-10-02T11:00:00Z' });
    });
  });

  it('fills the field from a quick reply instead of sending it, and joins a second one', async () => {
    const { press, input, has } = await mount();
    for (const reply of PRO_QUICK_REPLIES) expect(has(reply)).toBe(true);
    await press(PRO_QUICK_REPLIES[0]);
    expect(input().props.value).toBe(PRO_QUICK_REPLIES[0]);
    await press(PRO_QUICK_REPLIES[3]);
    expect(input().props.value).toBe(`${PRO_QUICK_REPLIES[0]} ${PRO_QUICK_REPLIES[3]}`);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('replaces the composer with the ending line when the server says the person cannot write', async () => {
    mockThread.mockResolvedValue(thread([system(1, 'connected'), system(2, 'ended')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    const { tree, out, has } = await mount();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(has('Send message')).toBe(false);
    expect(out()).toContain('This connection has ended.');
  });

  it('tells the person who ended it so', async () => {
    mockThread.mockResolvedValue(thread([system(2, 'ended')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'me' }));
    expect((await mount()).out()).toContain('You ended this connection.');
  });

  it('never says why a connection ended, or the word blocked', async () => {
    mockThread.mockResolvedValue(thread([], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them', otherLabel: 'Former stylist' }));
    const { out } = await mount();
    expect(out()).toContain('Former stylist');
    expect(out().toLowerCase()).not.toContain('block');
    expect(out().toLowerCase()).not.toContain('suspend');
  });
});

describe('ProThreadScreen: keeping the thread fresh', () => {
  it('asks again every 15 seconds for messages after the last one and merges them by id', async () => {
    fakeClock();
    mockThread.mockResolvedValueOnce(thread([them(1, 'One'), mine(2, 'Two')]));
    const { out } = await mount();
    expect(mockThread).toHaveBeenCalledTimes(1);
    expect(PRO_POLL_MS).toBe(15000);

    mockThread.mockResolvedValueOnce(thread([mine(2, 'Two, edited'), them(3, 'Three')]));
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread).toHaveBeenCalledTimes(2);
    expect(mockThread).toHaveBeenLastCalledWith('c1', { afterId: 2 });
    expect(out()).toContain('One');
    expect(out()).toContain('Two, edited');
    expect(out()).not.toMatch(/Two(?!,)/);
    expect(out()).toContain('Three');

    mockThread.mockResolvedValueOnce(thread([]));
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread).toHaveBeenLastCalledWith('c1', { afterId: 3 });
    expect(out()).toContain('One');
    expect(out()).toContain('Three');
  });

  it('pages forward while there are more, oldest first', async () => {
    fakeClock();
    mockThread.mockResolvedValueOnce(thread([them(1, 'One')]));
    const { out } = await mount();
    mockThread.mockResolvedValueOnce(thread([them(2, 'Two'), them(3, 'Three')], { hasMore: true }));
    mockThread.mockResolvedValueOnce(thread([them(4, 'Four')], { hasMore: false }));
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread).toHaveBeenNthCalledWith(2, 'c1', { afterId: 1 });
    expect(mockThread).toHaveBeenNthCalledWith(3, 'c1', { afterId: 3 });
    expect(mockThread).toHaveBeenCalledTimes(3);
    for (const word of ['One', 'Two', 'Three', 'Four']) expect(out()).toContain(word);
  });

  it('stays quiet when a poll fails', async () => {
    fakeClock();
    const { out } = await mount();
    mockThread.mockRejectedValueOnce({ message: 'Network request failed' });
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread).toHaveBeenCalledTimes(2);
    expect(out()).toContain('Welcome!');
    expect(out()).not.toContain("Couldn't load your messages");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not poll while the app is in the background', async () => {
    fakeClock();
    (AppState as any).currentState = 'background';
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS * 3);
    });
    expect(mockThread).toHaveBeenCalledTimes(1);
    (AppState as any).currentState = 'active';
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread).toHaveBeenCalledTimes(2);
  });

  it('stops asking once the person can no longer write, and reads how it ended', async () => {
    fakeClock();
    const { out } = await mount();
    mockThread.mockResolvedValueOnce(thread([system(4, 'ended')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'me' }));
    const reads = mockConnection.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockConnection.mock.calls.length).toBe(reads + 1);
    expect(out()).toContain('You ended this connection.');
    const calls = mockThread.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS * 3);
    });
    expect(mockThread.mock.calls.length).toBe(calls);
  });

  it('does not read the connection again on an ordinary poll', async () => {
    fakeClock();
    await mount();
    const reads = mockConnection.mock.calls.length;
    mockThread.mockResolvedValueOnce(thread([them(9, 'Hi')]));
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockConnection.mock.calls.length).toBe(reads);
  });

  it('stops polling when the screen goes away', async () => {
    fakeClock();
    const { tree } = await mount();
    await act(async () => {
      tree.unmount();
    });
    mounted.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS * 3);
    });
    expect(mockThread).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow answer that was asked for before one it already showed', async () => {
    fakeClock();
    const slow = deferred<ProThread>();
    const { out, tree } = await mount();
    mockThread.mockReturnValueOnce(slow.promise);
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    // A pull to refresh asked later and answered first.
    mockThread.mockResolvedValueOnce(thread([them(9, 'Newest')]));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain('Newest');
    await act(async () => {
      slow.resolve(thread([them(4, 'Stale')]));
    });
    expect(out()).toContain('Newest');
    expect(out()).not.toContain('Stale');
  });

  it('reloads by pull to refresh and shows a failed refresh as a banner over the thread', async () => {
    const { tree, out } = await mount();
    mockThread.mockRejectedValueOnce({ message: 'Network request failed' });
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain("Couldn't load your messages");
    expect(out()).toContain('Welcome!');
  });

  it('keeps a loaded thread on screen, and keeps polling, when only the access check fails afterwards', async () => {
    fakeClock();
    const { out, notice } = await mount();
    // A poll finds the session gone; asking who the person is fails too, because the phone is offline.
    mockThread.mockRejectedValueOnce(new ProError('not_authenticated'));
    mockStatus.mockRejectedValue({ message: 'Network request failed' });
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1);
    expect(out()).toContain('Welcome!');
    expect(notice()).toHaveLength(0);
    const polls = mockThread.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(PRO_POLL_MS);
    });
    expect(mockThread.mock.calls.length).toBe(polls + 1);
  });
});

describe('ProThreadScreen: earlier messages', () => {
  it('offers to load earlier messages when the page says there are more, and pages back from the oldest shown', async () => {
    mockThread.mockResolvedValueOnce(thread([them(10, 'Ten'), mine(11, 'Eleven')], { hasMore: true }));
    const { press, out, has } = await mount();
    expect(has('Load earlier messages')).toBe(true);
    mockThread.mockResolvedValueOnce(thread([them(8, 'Eight'), them(9, 'Nine')], { hasMore: false }));
    await press('Load earlier messages');
    expect(mockThread).toHaveBeenLastCalledWith('c1', { beforeId: 10, limit: 50 });
    expect(out().indexOf('Eight')).toBeLessThan(out().indexOf('Nine'));
    expect(out().indexOf('Nine')).toBeLessThan(out().indexOf('Ten'));
    expect(has('Load earlier messages')).toBe(false);
  });

  it('keeps the row while there are still older ones', async () => {
    mockThread.mockResolvedValueOnce(thread([them(10, 'Ten')], { hasMore: true }));
    const { press, has } = await mount();
    mockThread.mockResolvedValueOnce(thread([them(9, 'Nine')], { hasMore: true }));
    await press('Load earlier messages');
    expect(has('Load earlier messages')).toBe(true);
    mockThread.mockResolvedValueOnce(thread([them(8, 'Eight')], { hasMore: false }));
    await press('Load earlier messages');
    expect(mockThread).toHaveBeenLastCalledWith('c1', { beforeId: 9, limit: 50 });
  });

  it('has no row when there is nothing older', async () => {
    const { has } = await mount();
    expect(has('Load earlier messages')).toBe(false);
  });

  it('says so with an alert when earlier messages cannot be loaded, and keeps the row', async () => {
    mockThread.mockResolvedValueOnce(thread([them(10, 'Ten')], { hasMore: true }));
    const { press, has, out } = await mount();
    mockThread.mockRejectedValueOnce({ message: 'Network request failed' });
    await press('Load earlier messages');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", 'You seem to be offline. Please try again.');
    expect(has('Load earlier messages')).toBe(true);
    expect(out()).toContain('Ten');
  });
});

describe('ProThreadScreen: states of the connection itself', () => {
  it('shows "This is no longer available." with a way back when the connection is gone', async () => {
    mockThread.mockRejectedValue(new ProError('pro_unavailable'));
    mockConnection.mockRejectedValue(new ProError('pro_unavailable'));
    const { out, press } = await mount();
    expect(out()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows the load error with Try again when the thread cannot be loaded at all', async () => {
    mockThread.mockRejectedValueOnce({ message: 'Network request failed' });
    const { out, press } = await mount();
    expect(out()).toContain("Couldn't load your messages");
    await press('Try again to load your messages');
    expect(out()).toContain('Welcome!');
  });

  it('opens a closed shell as it arrives: no messages, no composer, no reason', async () => {
    mockThread.mockResolvedValue(thread([], { canSend: false }));
    mockConnection.mockResolvedValue(
      connection({ status: 'ended', endedBy: 'them', otherLabel: 'Former client', myRole: 'stylist', actions: {
        canMessage: false, canPropose: false, canRecommend: false, canEnd: false,
        canViewCloset: false, canShare: false, canStopSharing: false, canRename: false,
      } }),
    );
    const { out, tree } = await mount();
    expect(out()).toContain('Former client');
    expect(out()).toContain('This connection has ended.');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(out().toLowerCase()).not.toContain('block');
  });

  it('shows the gone state when it is opened without a connection id', async () => {
    mockParams = {};
    const { out } = await mount();
    expect(out()).toContain('This is no longer available.');
    expect(mockThread).not.toHaveBeenCalled();
  });
});

describe('ProThreadScreen: reporting and blocking', () => {
  it('opens the safety sheet for the connection from the header menu', async () => {
    const { press, safety } = await mount();
    expect(safety().props.visible).toBe(false);
    await press('Report or block Ann');
    expect(safety().props).toMatchObject({
      visible: true, refType: 'connection', refId: 'c1', label: 'Ann', connectionId: 'c1', messageId: undefined,
    });
  });

  it('reports one of the other person\'s messages on a long press, with its id', async () => {
    mockThread.mockResolvedValue(thread([them(7, 'Pay me first'), mine(8, 'Okay')]));
    const { bubble, safety } = await mount();
    await act(async () => {
      bubble('Ann: Pay me first').props.onLongPress();
    });
    expect(safety().props).toMatchObject({ visible: true, refType: 'connection', refId: 'c1', label: 'Ann', connectionId: 'c1', messageId: 7 });
  });

  it('does not make the person\'s own messages reportable', async () => {
    mockThread.mockResolvedValue(thread([mine(8, 'Okay')]));
    const { tree } = await mount();
    expect(tree.root.findAll(n => typeof n.props.onLongPress === 'function')).toHaveLength(0);
  });

  it('offers the same report through the screen reader\'s actions', async () => {
    mockThread.mockResolvedValue(thread([them(7, 'Hello')]));
    const { bubble, safety } = await mount();
    expect(bubble('Ann: Hello').props.accessibilityActions).toEqual([{ name: 'report', label: 'Report this message' }]);
    await act(async () => {
      bubble('Ann: Hello').props.onAccessibilityAction({ nativeEvent: { actionName: 'report' } });
    });
    expect(safety().props).toMatchObject({ visible: true, messageId: 7 });
  });

  it('forgets the message when the menu is used afterwards', async () => {
    mockThread.mockResolvedValue(thread([them(7, 'Hello')]));
    const { bubble, press, safety } = await mount();
    await act(async () => {
      bubble('Ann: Hello').props.onLongPress();
    });
    await act(async () => {
      safety().props.onClose();
    });
    await press('Report or block Ann');
    expect(safety().props.messageId).toBeUndefined();
  });

  it('leaves the thread after a block', async () => {
    const { press, safety } = await mount();
    await press('Report or block Ann');
    await act(async () => {
      safety().props.onBlocked();
    });
    expect(safety().props.visible).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('warns about payment talk in the other person\'s message, with a one-tap Report, and never blocks it', async () => {
    mockThread.mockResolvedValue(thread([them(7, 'can you venmo me a deposit?'), mine(8, 'paypal is fine')]));
    const { out, press, safety } = await mount();
    expect(out()).toContain('can you venmo me a deposit?');
    expect(out().split(PRO_PAYMENT_WARNING)).toHaveLength(2); // once, not for the person's own message
    await press('Report this message');
    expect(safety().props).toMatchObject({ visible: true, refType: 'connection', messageId: 7 });
  });

  it('shows no warning for ordinary messages', async () => {
    mockThread.mockResolvedValue(thread([them(7, 'See you at 3')]));
    const { out, has } = await mount();
    expect(out()).not.toContain(PRO_PAYMENT_WARNING);
    expect(has('Report this message')).toBe(false);
  });

  it('keeps the menu on a thread that has ended', async () => {
    mockThread.mockResolvedValue(thread([], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    const { has } = await mount();
    expect(has('Report or block Ann')).toBe(true);
  });
});

describe('ProThreadScreen: keyboard', () => {
  it('gives the composer its own accessory bar, not the shared Done bar', async () => {
    const { tree, input } = await mount();
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe(PRO_MESSAGE_ACCESSORY_ID);
    expect(input().props.inputAccessoryViewID).toBe(PRO_MESSAGE_ACCESSORY_ID);
    expect(PRO_MESSAGE_ACCESSORY_ID).toBe('smartcloset-pro-message-done');
    expect(PRO_MESSAGE_ACCESSORY_ID).not.toBe(KEYBOARD_DONE_ID);
    expect(input().props.inputAccessoryViewID).not.toBe(KEYBOARD_DONE_ID);
  });

  it('labels the bar "Done"', async () => {
    const { tree } = await mount();
    const done = outermost(tree.root.findAll(n => n.props.accessibilityLabel === 'Done' && typeof n.props.onPress === 'function'));
    expect(done).toHaveLength(1);
  });

  it('has exactly one KeyboardActionBar and no KeyboardDoneBar in the source', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProThreadScreen.tsx'), 'utf8');
    expect(source.match(/<KeyboardActionBar\b/g)).toHaveLength(1);
    expect(source).toMatch(/<KeyboardActionBar nativeID=\{PRO_MESSAGE_ACCESSORY_ID\} label="Done"/);
    expect(source).toMatch(/inputAccessoryViewID=\{PRO_MESSAGE_ACCESSORY_ID\}/);
    expect(source).not.toMatch(/<KeyboardDoneBar\b/);
    expect(source).not.toMatch(/keyboardDoneProps/);
  });

  it('keeps the composer above the keyboard: a keyboard-avoiding screen, with the field outside the scroll view', async () => {
    const { input } = await mount();
    const above: ReactTestInstance[] = [];
    for (let n = input().parent; n; n = n.parent) above.push(n);
    expect(above.find(a => a.type === KeyboardAvoidingView)?.props.behavior).toBe('padding');
    expect(above.find(a => a.type === ScrollView)).toBeUndefined();
  });
});

describe('ProThreadScreen: who can use it', () => {
  it('asks a guest to sign in, reads nothing and offers no route of its own', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { notice, tree } = await mount();
    expect(notice()).toHaveLength(1);
    expect(notice()[0].props.access.state).toBe('guest');
    expect(notice()[0].props.onSignIn).toBeUndefined();
    expect(mockThread).not.toHaveBeenCalled();
    expect(mockConnection).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says professional features are not available on a server without them', async () => {
    mockStatus.mockRejectedValue({ message: 'x', code: 'PGRST202' });
    const { notice } = await mount();
    expect(notice()[0].props.access.state).toBe('not_deployed');
    expect(mockThread).not.toHaveBeenCalled();
  });

  it('shows the load error when the access check itself fails', async () => {
    mockStatus.mockRejectedValueOnce({ message: 'Network request failed' });
    const { notice } = await mount();
    expect(notice()[0].props.access.state).toBe('error');
    expect(mockThread).not.toHaveBeenCalled();
    await act(async () => {
      await notice()[0].props.onRefresh();
    });
    expect(notice()).toHaveLength(0);
  });

  it('does not read an active connection while professional features are paused: the server refuses and the notice says paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockThread.mockRejectedValue(new ProError('pro_disabled'));
    const { notice, out } = await mount();
    expect(notice()).toHaveLength(1);
    expect(notice()[0].props.access.state).toBe('paused');
    expect(out()).not.toContain('Welcome!');
  });

  it('still reads an ended connection while paused, with a note, and keeps the report menu', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockThread.mockResolvedValue(thread([them(1, 'Thanks for everything')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    const { out, has, tree } = await mount();
    expect(out()).toContain('Thanks for everything');
    expect(out()).toContain(PRO_PAUSED_MESSAGE);
    expect(has('Report or block Ann')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('keeps history readable for a suspended person, with a notice and no composer', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    mockThread.mockResolvedValue(thread([them(1, 'Thanks for everything')], { canSend: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    const { out, tree } = await mount();
    expect(out()).toContain(PRO_SUSPENDED_MESSAGE);
    expect(out()).toContain('Thanks for everything');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('keeps the report menu when the server refuses the thread, and passes the safety sheet the label', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    mockThread.mockRejectedValue(new ProError('pro_suspended'));
    const { notice, has, safety } = await mount();
    expect(notice()[0].props.access.state).toBe('suspended');
    expect(has('Report or block Ann')).toBe(true);
    expect(safety().props).toMatchObject({ refType: 'connection', refId: 'c1', label: 'Ann' });
  });

  describe('terms', () => {
    const needsTerms = () => status({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } });

    it('hands the notice what it needs to offer the terms, and opens them from there', async () => {
      mockStatus.mockResolvedValue(needsTerms());
      mockThread.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { notice, terms } = await mount();
      expect(notice()[0].props).toMatchObject({ role: 'client' });
      expect(notice()[0].props.access).toMatchObject({ state: 'ready', client: 'needs_terms' });
      expect(terms()).toHaveLength(0);
      await act(async () => {
        notice()[0].props.onReadTerms();
      });
      expect(terms()).toHaveLength(1);
      expect(terms()[0].props).toMatchObject({ visible: true, role: 'client', needsAdult: false });
    });

    it('loads the thread after the terms are accepted', async () => {
      mockStatus.mockResolvedValue(needsTerms());
      mockThread.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { notice, terms, out } = await mount();
      await act(async () => {
        notice()[0].props.onReadTerms();
      });
      mockStatus.mockResolvedValue(status());
      await act(async () => {
        terms()[0].props.onAccepted();
      });
      expect(terms()).toHaveLength(0);
      expect(out()).toContain('Welcome!');
    });

    it('asks for the 18+ confirmation when the account has not given it', async () => {
      mockStatus.mockResolvedValue(status({ adultConfirmed: false, client: { termsCurrent: true, connections: 1, connectionLimit: 5 } }));
      mockThread.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { notice, terms } = await mount();
      await act(async () => {
        notice()[0].props.onReadTerms();
      });
      expect(terms()[0].props.needsAdult).toBe(true);
    });

    it('opens the terms when a send needs them, and repeats the same message once they are accepted', async () => {
      mockSend.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { type, press, terms, out } = await mount();
      await type('Hello there');
      await press('Send message');
      expect(alertSpy).not.toHaveBeenCalled();
      expect(terms()).toHaveLength(1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      await act(async () => {
        terms()[0].props.onAccepted();
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[1][2]).toBe(mockSend.mock.calls[0][2]);
      expect(terms()).toHaveLength(0);
      expect(out()).toContain('Hello there');
    });

    it('drops the message when the terms are closed', async () => {
      mockSend.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { type, press, terms, input } = await mount();
      await type('Hello there');
      await press('Send message');
      await act(async () => {
        terms()[0].props.onClose();
      });
      expect(terms()).toHaveLength(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(input().props.value).toBe('Hello there');
    });

    it('asks for an update, and opens no terms, when this build\'s terms are not the server\'s', async () => {
      mockStatus.mockResolvedValue(status({ versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: '2099-01', shareText: PRO_SHARE_TEXT_VERSION } }));
      mockSend.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { type, press, terms } = await mount();
      await type('Hello there');
      await press('Send message');
      expect(terms()).toHaveLength(0);
      expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", PRO_UPDATE_REQUIRED_MESSAGE);
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('shows the update notice, and no terms, when the thread is refused for an out-of-date build', async () => {
      mockStatus.mockResolvedValue(status({ versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: '2099-01', shareText: PRO_SHARE_TEXT_VERSION } }));
      mockThread.mockRejectedValue(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { notice, terms } = await mount();
      expect(notice()[0].props.access).toMatchObject({ state: 'ready', client: 'update_required' });
      expect(terms()).toHaveLength(0);
      expect(mockAccept).not.toHaveBeenCalled();
    });
  });
});

describe('ProThreadScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProThreadScreen.tsx'), 'utf8');

  it('navigates nowhere but back', () => {
    expect(source).not.toMatch(/\.navigate\(/);
    expect(source).not.toMatch(/\b(?:nav|screen):\s*'/);
    expect(source).toMatch(/navigation\.goBack\(\)/);
  });

  it('uses no storage key, no console.error and no module-scope side effects of its own', () => {
    expect(source).not.toMatch(/AsyncStorage|@smartcloset_/);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/^(?:setInterval|setTimeout|fetch)\(/m);
  });

  it('imports the shared notice and sheets instead of drawing its own copies', () => {
    expect(source).toMatch(/from '\.\.\/components\/ProAccessNotice'/);
    expect(source).toMatch(/from '\.\.\/components\/ProSafetySheet'/);
    expect(source).toMatch(/from '\.\.\/components\/ProTermsSheet'/);
  });
});
