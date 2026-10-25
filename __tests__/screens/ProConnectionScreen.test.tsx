import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, RefreshControl, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockParams: any = {};
let mockFocus: (() => void) | null = null;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
// One stable object, as a real navigation prop is.
const mockNav = { navigate: (...a: any[]) => mockNavigate(...a), goBack: (...a: any[]) => mockGoBack(...a) };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNav,
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => {
      mockFocus = cb;
      useEffect(cb, [cb]);
    },
  };
});

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockGetConnection = jest.fn();
const mockLooks = jest.fn();
const mockSessions = jest.fn();
const mockSetGrant = jest.fn();
const mockEnd = jest.fn();
const mockAlias = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getProConnection: (...a: any[]) => mockGetConnection(...a),
  listProLooks: (...a: any[]) => mockLooks(...a),
  listProSessions: (...a: any[]) => mockSessions(...a),
  setProGrant: (...a: any[]) => mockSetGrant(...a),
  endProConnection: (...a: any[]) => mockEnd(...a),
  setProAlias: (...a: any[]) => mockAlias(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});

// Other streams' components, as plain markers that show the props they were given.
const stub = (name: string) => {
  const R = require('react');
  const C = (props: any) => R.createElement(name, props);
  return { __esModule: true, default: C, [name]: C };
};
jest.mock('../../src/components/ProAccessNotice', () => stub('ProAccessNotice'));
jest.mock('../../src/components/ProAppointmentRow', () => stub('ProAppointmentRow'));
jest.mock('../../src/components/ProAppointmentSheet', () => stub('ProAppointmentSheet'));
jest.mock('../../src/components/ProLookCard', () => stub('ProLookCard'));
jest.mock('../../src/components/ProSafetySheet', () => stub('ProSafetySheet'));
jest.mock('../../src/components/ProStylistCard', () => stub('ProStylistCard'));
jest.mock('../../src/components/ProTermsSheet', () => stub('ProTermsSheet'));

import ProConnectionScreen from '../../src/screens/ProConnectionScreen';
import { ProError } from '../../src/services/proErrors';
import { PRO_SAFETY_TIPS } from '../../src/config/proRules';
import type { ProAppointment, ProConnectionDetail, ProLookSummary, ProStatus } from '../../src/types/pro';

// React's act needs setImmediate and microtasks to be real; only the timers the screen uses are faked.
const fakeClock = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

const dayText = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

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
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

// ─── fixtures ────────────────────────────────────────────────────────────────

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: '2026-10', clientTerms: '2026-10', shareText: '2026-10' },
  stylist: null,
  client: { termsCurrent: true, connections: 1, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const detail = (over: Partial<ProConnectionDetail> = {}): ProConnectionDetail => ({
  id: 'c1',
  myRole: 'client',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Maya Chen',
  myAlias: 'Ava',
  safetyOnly: false,
  stylist: {
    name: 'Maya Chen', headline: 'Capsule wardrobes', bio: 'Ten years in retail.', services: ['wardrobe_audit'],
    languages: ['en'], ratesText: 'From 80 per session',
  },
  closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 0, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: false, canEnd: true, canViewCloset: false,
    canShare: true, canStopSharing: false, canRename: true,
  },
  ...over,
});

const SHARED = {
  shared: true, itemMode: 'selected' as const, itemCount: 3, expiresAt: '2027-01-20T00:00:00Z', expiresSoon: false,
  lastViewedAt: '2026-10-20T09:00:00Z', views30d: 4,
};

const look = (id: string, over: Partial<ProLookSummary> = {}): ProLookSummary => ({
  id,
  status: 'sent',
  title: `Look ${id}`,
  itemCount: 2,
  sentAt: '2026-10-10T00:00:00Z',
  updatedAt: `2026-10-${String(10 + (Number(id.replace(/\D/g, '')) % 18)).padStart(2, '0')}T00:00:00Z`,
  isNew: false,
  ...over,
});

const session = (id: string, over: Partial<ProAppointment> = {}): ProAppointment => ({
  id,
  connectionId: 'c1',
  otherLabel: 'Maya Chen',
  myRole: 'client',
  status: 'confirmed',
  proposedBy: 'client',
  startsAt: '2099-01-01T15:00:00Z',
  durationMinutes: 60,
  mode: 'virtual',
  place: 'video call',
  note: '',
  utcOffsetMinutes: 0,
  canConfirm: false,
  canDecline: false,
  canCancel: true,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

// ─── the harness ─────────────────────────────────────────────────────────────

const mounted: renderer.ReactTestRenderer[] = [];

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProConnectionScreen />);
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
  const el = (name: string) => tree.root.findAll(n => (n.type as any) === name);
  const one = (name: string) => {
    const nodes = el(name);
    if (nodes.length !== 1) throw new Error(`Expected one ${name}, found ${nodes.length}`);
    return nodes[0];
  };
  const call = async (fn: () => void) => {
    await act(async () => {
      fn();
    });
    await settle();
  };
  const refocus = async () => {
    await act(async () => {
      mockFocus!();
    });
    await settle();
  };
  return { tree, text, has, press, pressable, el, one, call, refocus };
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
let nextId = 0;

beforeEach(() => {
  // A new connection id per case: the first-visit memory of the stylist card is kept for the whole run of the app.
  mockParams = { connectionId: `c${++nextId}` };
  [mockNavigate, mockGoBack, mockStatus, mockAccept, mockGetConnection, mockLooks, mockSessions, mockSetGrant, mockEnd, mockAlias]
    .forEach(m => m.mockReset());
  mockStatus.mockResolvedValue(status());
  mockGetConnection.mockImplementation(async () => detail({ id: mockParams.connectionId }));
  mockLooks.mockResolvedValue([]);
  mockSessions.mockResolvedValue([]);
  mockSetGrant.mockResolvedValue({ scope: 'closet', enabled: false, itemMode: null });
  mockEnd.mockResolvedValue(undefined);
  mockAlias.mockResolvedValue(undefined);
  mockAccept.mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  jest.useRealTimers();
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProConnectionScreen: the page', () => {
  it('reads the connection, then the looks and the two lists of sessions', async () => {
    const { text } = await render();
    const id = mockParams.connectionId;
    expect(mockGetConnection).toHaveBeenCalledWith(id);
    expect(mockLooks).toHaveBeenCalledWith(id, { limit: 20 });
    expect(mockSessions).toHaveBeenCalledWith({ connectionId: id, scope: 'needs_me' });
    expect(mockSessions).toHaveBeenCalledWith({ connectionId: id, scope: 'upcoming' });
    expect(text()).toContain('Maya Chen');
  });

  it('shows the stylist whole on the first visit and collapsed after that', async () => {
    mockParams = { connectionId: 'visit-1' };
    const first = await render();
    expect(first.one('ProStylistCard').props.compact).toBe(false);
    expect(first.one('ProStylistCard').props.stylist.name).toBe('Maya Chen');
    expect(first.has('Show less about Maya Chen')).toBe(true);
    act(() => first.tree.unmount());
    mounted.pop();

    const second = await render();
    expect(second.one('ProStylistCard').props.compact).toBe(true);
    await second.press('Show more about Maya Chen');
    expect(second.one('ProStylistCard').props.compact).toBe(false);
  });

  it('says nothing is shared, and leads to the sharing page', async () => {
    const { text, press } = await render();
    expect(text()).toContain("Maya Chen can't see your closet.");
    await press('Choose what to share');
    expect(mockNavigate).toHaveBeenCalledWith('ProShare', { connectionId: mockParams.connectionId });
  });

  it('shows what is shared, the end date and how much it was looked at', async () => {
    mockGetConnection.mockResolvedValue(detail({
      closet: SHARED,
      actions: { ...detail().actions, canStopSharing: true },
    }));
    const { text, press, has } = await render();
    expect(text()).toContain('3 pieces you chose are shared.');
    expect(text()).toContain(`Sharing ends on ${dayText(SHARED.expiresAt)}.`);
    expect(text()).toContain(`Last viewed ${dayText(SHARED.lastViewedAt)}.`);
    expect(text()).toContain('Closet pages viewed in the last 30 days: 4.');
    expect(has('Choose what to share')).toBe(false);
    await press('Change');
    expect(mockNavigate).toHaveBeenCalledWith('ProShare', { connectionId: expect.any(String) });
  });

  it('says "All your pieces are shared." for an all grant and "Not viewed yet." before the first look', async () => {
    mockGetConnection.mockResolvedValue(detail({
      closet: { ...SHARED, itemMode: 'all', itemCount: 12, lastViewedAt: null, views30d: 0 },
      actions: { ...detail().actions, canStopSharing: true },
    }));
    const { text } = await render();
    expect(text()).toContain('All your pieces are shared.');
    expect(text()).toContain('Not viewed yet.');
  });

  it('warns in the last days of a grant', async () => {
    mockGetConnection.mockResolvedValue(detail({
      closet: { ...SHARED, expiresSoon: true },
      actions: { ...detail().actions, canStopSharing: true },
    }));
    const { text } = await render();
    expect(text()).toContain(`Your stylist's access ends on ${dayText(SHARED.expiresAt)}. Keep sharing?`);
  });

  it('stops sharing at once: no confirmation, only the connection, the scope and the switch', async () => {
    mockGetConnection.mockResolvedValue(detail({
      closet: SHARED,
      actions: { ...detail().actions, canStopSharing: true },
    }));
    const { press } = await render();
    mockGetConnection.mockClear();
    await press('Stop sharing');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockSetGrant).toHaveBeenCalledWith(mockParams.connectionId, { enabled: false });
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
  });

  it('shows why stopping failed and keeps the button', async () => {
    mockGetConnection.mockResolvedValue(detail({ closet: SHARED, actions: { ...detail().actions, canStopSharing: true } }));
    mockSetGrant.mockRejectedValue(new ProError('pro_rate_limited', 'x', 'grant_day'));
    const { press, text, has } = await render();
    await press('Stop sharing');
    expect(text()).toContain("You're going a bit fast. Please wait a moment.");
    expect(has('Stop sharing')).toBe(true);
  });

  it('opens the thread from Message', async () => {
    const { press } = await render();
    await press('Message');
    expect(mockNavigate).toHaveBeenCalledWith('ProThread', { connectionId: mockParams.connectionId });
  });

  it('offers no Message when the server says the person cannot message', async () => {
    mockGetConnection.mockResolvedValue(detail({ actions: { ...detail().actions, canMessage: false } }));
    const { has } = await render();
    expect(has('Message')).toBe(false);
  });

  it('shows the safety tips collapsed, and opens them', async () => {
    const { text, press } = await render();
    expect(text()).toContain('Meeting safely');
    expect(text()).not.toContain(PRO_SAFETY_TIPS[0]);
    await press('Meeting safely');
    for (const tip of PRO_SAFETY_TIPS) expect(text()).toContain(tip);
    await press('Meeting safely');
    expect(text()).not.toContain(PRO_SAFETY_TIPS[0]);
  });

  it('goes back from the header', async () => {
    const { press } = await render();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('reads again when the screen comes back into focus, and on pull to refresh', async () => {
    const { refocus, tree } = await render();
    mockGetConnection.mockClear();
    await refocus();
    expect(mockGetConnection).toHaveBeenCalledTimes(1);
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    await settle();
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
  });

  it('drops an answer that arrives after a newer one', async () => {
    const slow = deferred<ProConnectionDetail>();
    mockGetConnection.mockReturnValueOnce(slow.promise);
    const { refocus, text } = await render();
    mockGetConnection.mockResolvedValue(detail({ otherLabel: 'Second Name' }));
    await refocus();
    expect(text()).toContain('Second Name');
    await act(async () => {
      slow.resolve(detail({ otherLabel: 'Stale Name' }));
    });
    await settle();
    expect(text()).toContain('Second Name');
    expect(text()).not.toContain('Stale Name');
  });
});

describe('ProConnectionScreen: looks', () => {
  it('lists the looks and opens one', async () => {
    mockLooks.mockResolvedValue([look('l1', { isNew: true }), look('l2')]);
    const { el, text } = await render();
    expect(text()).toContain('Looks');
    const cards = el('ProLookCard');
    expect(cards).toHaveLength(2);
    expect(cards[0].props.mine).toBe(false);
    await act(async () => {
      cards[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ProRecommendation', { recId: 'l1', connectionId: mockParams.connectionId });
  });

  it('says there are no looks yet', async () => {
    const { text } = await render();
    expect(text()).toContain('No looks yet. Your stylist will send them here.');
  });

  it('pages older looks in twenty at a time and does not repeat one', async () => {
    const page = Array.from({ length: 20 }, (_, i) => look(`l${i}`, { updatedAt: `2026-09-${String(30 - i).padStart(2, '0')}T00:00:00Z` }));
    mockLooks.mockResolvedValueOnce(page);
    const { press, el, has } = await render();
    expect(el('ProLookCard')).toHaveLength(20);
    mockLooks.mockResolvedValueOnce([page[19], look('older', { updatedAt: '2026-08-01T00:00:00Z' })]);
    await press('Show older looks');
    expect(mockLooks).toHaveBeenLastCalledWith(mockParams.connectionId, { before: page[19].updatedAt, limit: 20 });
    expect(el('ProLookCard')).toHaveLength(21);
    expect(has('Show older looks')).toBe(false);
  });

  it('shows a banner, not a blank page, when looks and sessions cannot be read', async () => {
    mockLooks.mockRejectedValue(new Error('offline'));
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load your looks and sessions");
    expect(text()).toContain('Maya Chen');
    expect(text()).not.toContain('No looks yet');
    mockLooks.mockResolvedValue([look('l1')]);
    await press('Try again to load your looks and sessions');
    expect(text()).not.toContain("Couldn't load your looks and sessions");
  });
});

describe('ProConnectionScreen: sessions', () => {
  it('puts the ones that wait for an answer first, and does not repeat them', async () => {
    const waiting = session('s1', { status: 'proposed', proposedBy: 'stylist', canConfirm: true, canDecline: true });
    const later = session('s2');
    mockSessions.mockImplementation(async (opts: any) => (opts.scope === 'needs_me' ? [waiting] : [waiting, later]));
    const { text, el } = await render();
    expect(text()).toContain('Needs your answer');
    expect(el('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['s1', 's2']);
  });

  it('says there are no sessions yet', async () => {
    const { text } = await render();
    expect(text()).toContain('No sessions yet.');
  });

  it('opens a session to read and answer it', async () => {
    const upcoming = session('s2');
    mockSessions.mockImplementation(async (opts: any) => (opts.scope === 'upcoming' ? [upcoming] : []));
    const { el, one, call } = await render();
    expect(one('ProAppointmentSheet').props.visible).toBe(false);
    await call(() => el('ProAppointmentRow')[0].props.onPress());
    const sheet = one('ProAppointmentSheet');
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.mode).toBe('view');
    expect(sheet.props.appointment.id).toBe('s2');
  });

  it('requests a session in propose mode for this connection, and reads the sessions again when it changes', async () => {
    const { press, one, call } = await render();
    await press('Request a session');
    const sheet = one('ProAppointmentSheet');
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.mode).toBe('propose');
    expect(sheet.props.connectionId).toBe(mockParams.connectionId);
    expect(sheet.props.appointment).toBeUndefined();
    mockSessions.mockClear();
    await call(() => sheet.props.onChanged());
    expect(mockSessions).toHaveBeenCalledTimes(2);
    await call(() => one('ProAppointmentSheet').props.onClose());
    expect(one('ProAppointmentSheet').props.visible).toBe(false);
    expect(one('ProAppointmentSheet').props.mode).toBe('propose');
  });

  it('does not offer a request when the server says it cannot be made', async () => {
    mockGetConnection.mockResolvedValue(detail({ actions: { ...detail().actions, canPropose: false } }));
    const { has } = await render();
    expect(has('Request a session')).toBe(false);
  });

  it('hands a reported session to the report sheet once the session sheet has left', async () => {
    const upcoming = session('s2');
    mockSessions.mockImplementation(async (opts: any) => (opts.scope === 'upcoming' ? [upcoming] : []));
    const { el, one, call } = await render();
    await call(() => el('ProAppointmentRow')[0].props.onPress());
    fakeClock();
    await call(() => one('ProAppointmentSheet').props.onReport(upcoming));
    expect(one('ProAppointmentSheet').props.visible).toBe(false);
    // The target is known, but the second modal waits for the first to go.
    const waiting = el('ProSafetySheet')[0];
    expect(waiting.props.visible).toBe(false);
    await call(() => jest.advanceTimersByTime(800));
    const safety = one('ProSafetySheet');
    expect(safety.props.visible).toBe(true);
    expect(safety.props.refType).toBe('appointment');
    expect(safety.props.refId).toBe('s2');
    expect(safety.props.label).toBe('Maya Chen');
    expect(safety.props.connectionId).toBe(mockParams.connectionId);
  });
});

describe('ProConnectionScreen: report, block, end, rename', () => {
  it('opens the report and block menu for this connection from the header', async () => {
    const { press, one, call, el } = await render();
    expect(el('ProSafetySheet')).toHaveLength(0);
    await press('Report or block Maya Chen');
    const safety = one('ProSafetySheet');
    expect(safety.props.visible).toBe(true);
    expect(safety.props.refType).toBe('connection');
    expect(safety.props.refId).toBe(mockParams.connectionId);
    expect(safety.props.connectionId).toBe(mockParams.connectionId);
    expect(safety.props.label).toBe('Maya Chen');
    await call(() => safety.props.onClose());
    expect(one('ProSafetySheet').props.visible).toBe(false);
  });

  it('leaves the page after a block, because the connection is a closed shell', async () => {
    const { press, one, call } = await render();
    await press('Report or block Maya Chen');
    await call(() => one('ProSafetySheet').props.onBlocked());
    expect(one('ProSafetySheet').props.visible).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('asks before ending, in the words of the design, and does nothing on Cancel', async () => {
    const { press } = await render();
    await press('End connection');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('End connection?');
    expect(message).toBe("You'll stop sharing with Maya Chen and your connection ends. This can't be undone.");
    expect(buttons.map((b: any) => b.text)).toEqual(['Cancel', 'End connection']);
    expect(buttons[1].style).toBe('destructive');
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('ends the connection when confirmed and shows who ended it', async () => {
    const { press, text, call, has } = await render();
    await press('End connection');
    mockGetConnection.mockResolvedValue(detail({
      status: 'ended', endedBy: 'me', endedAt: new Date().toISOString(),
      actions: { ...detail().actions, canMessage: false, canPropose: false, canEnd: false, canShare: false, canRename: false },
    }));
    const confirm = alertSpy.mock.calls[0][2][1];
    await call(() => confirm.onPress());
    expect(mockEnd).toHaveBeenCalledWith(mockParams.connectionId);
    expect(text()).toContain('You ended this connection.');
    expect(has('End connection')).toBe(false);
  });

  it('shows why ending failed', async () => {
    mockEnd.mockRejectedValue(new ProError('pro_rate_limited', 'x', 'end_day'));
    const { press, text, call } = await render();
    await press('End connection');
    await call(() => alertSpy.mock.calls[0][2][1].onPress());
    expect(text()).toContain("You're going a bit fast.");
  });

  it('shows the name this client chose, and renames it', async () => {
    const { text, press, tree, call } = await render();
    expect(text()).toContain('Name shown to Maya Chen');
    expect(text()).toContain('Ava');
    await press('Rename');
    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('Ava');
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.maxLength).toBe(30);
    await call(() => input.props.onChangeText('  Ava L  '));
    await press('Save name');
    expect(mockAlias).toHaveBeenCalledWith(mockParams.connectionId, 'Ava L');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('saves the new name from the Return key', async () => {
    const { press, tree, call } = await render();
    await press('Rename');
    await call(() => tree.root.findByType(TextInput).props.onChangeText('Bea'));
    await call(() => tree.root.findByType(TextInput).props.onSubmitEditing());
    expect(mockAlias).toHaveBeenCalledWith(mockParams.connectionId, 'Bea');
  });

  it('refuses a name that is too short or too long without asking the server', async () => {
    const { press, tree, call, text } = await render();
    await press('Rename');
    await call(() => tree.root.findByType(TextInput).props.onChangeText('A'));
    await press('Save name');
    expect(text()).toContain('Choose a name of 2 to 30 characters.');
    expect(mockAlias).not.toHaveBeenCalled();
  });

  it('keeps the typed name and shows the reason when the server refuses it', async () => {
    mockAlias.mockRejectedValue(new ProError('text_not_allowed', 'x', 'alias', 'contact'));
    const { press, tree, call, text } = await render();
    await press('Rename');
    await call(() => tree.root.findByType(TextInput).props.onChangeText('call 555 1234'));
    await press('Save name');
    expect(text()).toContain("Links and contact details can't go here.");
    expect(tree.root.findByType(TextInput).props.value).toBe('call 555 1234');
  });

  it('opens the terms when renaming needs them, and repeats the rename once they are agreed', async () => {
    mockAlias.mockRejectedValueOnce(new ProError('pro_terms_required', 'x', 'client'));
    const { press, tree, call, one } = await render();
    await press('Rename');
    await call(() => tree.root.findByType(TextInput).props.onChangeText('Bea'));
    await press('Save name');
    expect(one('ProTermsSheet').props.visible).toBe(true);
    expect(one('ProTermsSheet').props.role).toBe('client');
    expect(mockAlias).toHaveBeenCalledTimes(1);
    await call(() => one('ProTermsSheet').props.onAccepted());
    expect(mockAlias).toHaveBeenCalledTimes(2);
    expect(one('ProTermsSheet').props.visible).toBe(false);
  });

  it('does not show a rename when the server says it cannot be done', async () => {
    mockGetConnection.mockResolvedValue(detail({ actions: { ...detail().actions, canRename: false } }));
    const { has } = await render();
    expect(has('Rename')).toBe(false);
  });
});

describe('ProConnectionScreen: an ended connection', () => {
  const ended = (over: Partial<ProConnectionDetail> = {}) =>
    detail({
      status: 'ended',
      endedBy: 'them',
      endedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      stylist: null,
      actions: {
        canMessage: false, canPropose: false, canRecommend: false, canEnd: false, canViewCloset: false,
        canShare: false, canStopSharing: false, canRename: false,
      },
      ...over,
    });

  it('says who ended it, in neutral words, and offers nothing that changes anything', async () => {
    mockGetConnection.mockResolvedValue(ended());
    const { text, has } = await render();
    expect(text()).toContain('This connection has ended.');
    expect(text().toLowerCase()).not.toContain('blocked');
    for (const label of ['End connection', 'Choose what to share', 'Stop sharing', 'Request a session', 'Rename', 'Save name', 'Message']) {
      expect(has(label)).toBe(false);
    }
  });

  it('says "You ended this connection." to the person who ended it', async () => {
    mockGetConnection.mockResolvedValue(ended({ endedBy: 'me' }));
    const { text } = await render();
    expect(text()).toContain('You ended this connection.');
  });

  it('keeps the looks and the past sessions readable, and asks for the past ones only', async () => {
    mockGetConnection.mockResolvedValue(ended());
    mockLooks.mockResolvedValue([look('l1')]);
    mockSessions.mockImplementation(async (opts: any) => (opts.scope === 'past' ? [session('s9', { status: 'cancelled', canCancel: false })] : []));
    const { el } = await render();
    expect(el('ProLookCard')).toHaveLength(1);
    expect(el('ProAppointmentRow')).toHaveLength(1);
    expect(mockSessions.mock.calls.map(c => c[0].scope)).toEqual(['past']);
    await act(async () => {
      el('ProLookCard')[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ProRecommendation', { recId: 'l1', connectionId: mockParams.connectionId });
    expect(el('ProAppointmentRow')[0].props.appointment.status).toBe('cancelled');
  });

  it('offers the earlier messages for thirty days, and not after', async () => {
    mockGetConnection.mockResolvedValue(ended());
    const recent = await render();
    await recent.press('View messages');
    expect(mockNavigate).toHaveBeenCalledWith('ProThread', { connectionId: mockParams.connectionId });
    act(() => recent.tree.unmount());
    mounted.pop();

    mockParams = { connectionId: 'old-one' };
    mockGetConnection.mockResolvedValue(ended({ endedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() }));
    const old = await render();
    expect(old.has('View messages')).toBe(false);
  });

  it('reads history even when the feature is paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockGetConnection.mockResolvedValue(ended({ safetyOnly: true }));
    mockLooks.mockResolvedValue([look('l1')]);
    const { el } = await render();
    expect(mockLooks).toHaveBeenCalled();
    expect(el('ProLookCard')).toHaveLength(1);
  });

  it('shows nothing under a closed shell but the sentence', async () => {
    mockGetConnection.mockResolvedValue(ended({ otherLabel: 'Former stylist' }));
    const { text, el } = await render();
    expect(text()).toContain('Former stylist');
    expect(el('ProLookCard')).toHaveLength(0);
    expect(text()).not.toContain('No looks yet');
    expect(text()).not.toContain('No sessions yet');
  });
});

describe('ProConnectionScreen: only the way out', () => {
  const shared = () =>
    detail({
      safetyOnly: true,
      stylist: null,
      closet: SHARED,
      actions: {
        canMessage: false, canPropose: false, canRecommend: false, canEnd: true, canViewCloset: false,
        canShare: false, canStopSharing: true, canRename: false,
      },
    });

  const expectWaysOut = async (h: Awaited<ReturnType<typeof render>>) => {
    expect(h.has('Stop sharing')).toBe(true);
    expect(h.has('End connection')).toBe(true);
    expect(h.has('Report or block Maya Chen')).toBe(true);
    for (const label of ['Message', 'Change', 'Choose what to share', 'Request a session', 'Rename']) {
      expect(h.has(label)).toBe(false);
    }
    expect(h.el('ProStylistCard')).toHaveLength(0);
    expect(mockLooks).not.toHaveBeenCalled();
    expect(mockSessions).not.toHaveBeenCalled();
    await h.press('Stop sharing');
    expect(mockSetGrant).toHaveBeenCalledWith(mockParams.connectionId, { enabled: false });
    await h.press('End connection');
    expect(alertSpy).toHaveBeenCalledTimes(1);
  };

  it('keeps Stop sharing, End connection and Report or block when the feature is paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockGetConnection.mockResolvedValue(shared());
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.state).toBe('paused');
    await expectWaysOut(h);
  });

  it('keeps them when the account is suspended', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    mockGetConnection.mockResolvedValue(shared());
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.state).toBe('suspended');
    await expectWaysOut(h);
  });

  it('keeps them, and records nothing, when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: '2026-11' } }));
    mockGetConnection.mockResolvedValue(shared());
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.client).toBe('update_required');
    await expectWaysOut(h);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('keeps them when the terms are out of date, and opens the terms by itself', async () => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } }));
    mockGetConnection.mockResolvedValue(shared());
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.client).toBe('needs_terms');
    expect(typeof h.one('ProAccessNotice').props.onReadTerms).toBe('function');
    expect(h.one('ProTermsSheet').props.visible).toBe(true);
    expect(h.one('ProTermsSheet').props.role).toBe('client');
    await act(async () => {
      h.one('ProTermsSheet').props.onClose();
    });
    expect(h.one('ProTermsSheet').props.visible).toBe(false);
    await act(async () => {
      h.one('ProAccessNotice').props.onReadTerms();
    });
    expect(h.one('ProTermsSheet').props.visible).toBe(true);
    await h.press('Stop sharing');
    expect(mockSetGrant).toHaveBeenCalledWith(mockParams.connectionId, { enabled: false });
  });

  it('follows the server when it says the ways out only although the screen thought all was well', async () => {
    mockGetConnection.mockResolvedValue(shared());
    const h = await render();
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1);
    expect(h.has('Message')).toBe(false);
    expect(mockLooks).not.toHaveBeenCalled();
  });
});

describe('ProConnectionScreen: states', () => {
  it('shows a placeholder while access loads', async () => {
    const d = deferred<ProStatus>();
    mockStatus.mockReturnValue(d.promise);
    const { el } = await render();
    expect(el('Skeleton').length).toBeGreaterThan(0);
    expect(mockGetConnection).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve(status());
    });
    await settle();
  });

  it('shows the notice for a guest and calls nothing else', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { one } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('guest');
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('shows the notice on a server without the feature, and reads nothing else', async () => {
    mockStatus.mockRejectedValue(new ProError('not_deployed'));
    const { one } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('not_deployed');
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('shows the notice with a way to try again when access cannot be read', async () => {
    mockStatus.mockRejectedValue(new ProError('offline'));
    const { one } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('error');
    expect(typeof one('ProAccessNotice').props.onRefresh).toBe('function');
  });

  it('says a connection is gone, with a way back', async () => {
    mockGetConnection.mockRejectedValue(new ProError('pro_unavailable'));
    const { text, press } = await render();
    expect(text()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('says the same when there is no connection to read', async () => {
    mockParams = {};
    const { text } = await render();
    expect(text()).toContain('This is no longer available.');
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('does not show the stylist\'s side of a connection', async () => {
    mockGetConnection.mockResolvedValue(detail({ myRole: 'stylist' }));
    const { text } = await render();
    expect(text()).toContain('This is no longer available.');
  });

  it('shows a way to try again when the connection cannot be read, and reads again', async () => {
    mockGetConnection.mockRejectedValueOnce(new Error('offline'));
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load your connection");
    await press('Try again to load your connection');
    expect(text()).toContain('Maya Chen');
  });

  it('keeps the page and shows a banner when a later read fails', async () => {
    const { text, refocus } = await render();
    mockGetConnection.mockRejectedValueOnce(new Error('offline'));
    await refocus();
    expect(text()).toContain('Maya Chen');
    expect(text()).toContain("Couldn't load your connection");
  });

  it('asks again what the person may do when the server says the feature is paused', async () => {
    const { refocus } = await render();
    mockStatus.mockClear();
    mockGetConnection.mockRejectedValueOnce(new ProError('pro_disabled'));
    await refocus();
    expect(mockStatus).toHaveBeenCalled();
  });
});

describe('ProConnectionScreen: wording and navigation', () => {
  it('renders no commerce wording and no price', async () => {
    mockGetConnection.mockResolvedValue(detail({ closet: { ...SHARED, expiresSoon: true }, actions: { ...detail().actions, canStopSharing: true } }));
    mockLooks.mockResolvedValue([look('l1')]);
    const { text, press } = await render();
    await press('Meeting safely');
    expect(text()).not.toMatch(/\b(book|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    expect(text()).not.toMatch(/\$\d/);
  });

  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProConnectionScreen.tsx'), 'utf8');

  it('navigates only to ProShare, ProRecommendation and ProThread', () => {
    const targets = new Set([...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]));
    expect([...targets].sort()).toEqual(['ProRecommendation', 'ProShare', 'ProThread']);
    expect(source).not.toMatch(/\b(nav|screen):\s*'/);
  });

  it('never logs an error or stores anything', () => {
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/AsyncStorage/);
  });

  it('has one single-line field, with a Return key', () => {
    const fields = [...source.matchAll(/<(Input|TextInput)\b[\s\S]*?\/>/g)];
    expect(fields).toHaveLength(1);
    expect(fields[0][0]).toMatch(/returnKeyType="done"/);
    expect(fields[0][0]).not.toMatch(/multiline/);
  });
});
