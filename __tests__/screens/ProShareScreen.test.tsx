import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockParams: any = {};
// The latest focus callback, so a test can bring the screen back into focus.
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

// The real service runs, against a fake server behind supabase.rpc, so the arguments checked below are the ones
// that would really be sent.
const mockRpc = jest.fn();
let mockSignedIn = true;
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSignedIn ? { user: { id: 'u1' } } : null } }),
    },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));

const mockOwned = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: (...a: any[]) => mockOwned(...a),
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
jest.mock('../../src/components/ProTermsSheet', () => stub('ProTermsSheet'));
jest.mock('../../src/components/ProItemPicker', () => stub('ProItemPicker'));

import ProShareScreen from '../../src/screens/ProShareScreen';
import { PRO_SHARE_ALL_HINT, PRO_SHARE_TEXT_VERSION, proShareConsent } from '../../src/config/proRules';

const dayText = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

// ─── the fake server ─────────────────────────────────────────────────────────

type Server = {
  status: any;
  connection: any;
  grant: any;
  connectionError: any;
  grantError: any;
  setError: any;
};

const OFF = { scope: 'closet', enabled: false, itemMode: null };
const ON_ALL = {
  scope: 'closet', enabled: true, itemMode: 'all', grantedAt: '2026-10-01T00:00:00Z', expiresAt: '2027-01-20T00:00:00Z',
  expiresSoon: false, textVersion: '2026-10', lastViewedAt: '2026-10-20T09:00:00Z', views30d: 4, events: [],
};
const ON_SELECTED = { ...ON_ALL, itemMode: 'selected', itemIds: ['a', 'b', 'c'] };

const statusJson = (over: any = {}) => ({
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

const connectionJson = (over: any = {}) => ({
  connectionId: 'c1',
  myRole: 'client',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  endedAt: null,
  otherLabel: 'Maya Chen',
  myAlias: 'Ava',
  safetyOnly: false,
  stylist: null,
  closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 0, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: false, canEnd: true, canViewCloset: false,
    canShare: true, canStopSharing: false, canRename: true,
  },
  ...over,
});

let server: Server;

const piecesIn = (g: any) => (g.itemMode === 'selected' ? (g.itemIds ?? []).length : 12);

const applySet = (args: any) => {
  if (!args.p_enabled) {
    server.grant = { ...OFF };
  } else {
    const keep = server.grant.enabled && !args.p_renew ? server.grant.expiresAt : '2027-01-25T00:00:00Z';
    server.grant = {
      ...ON_ALL,
      itemMode: args.p_item_mode,
      itemIds: args.p_item_mode === 'selected' ? args.p_item_ids : undefined,
      expiresAt: keep,
      expiresSoon: false,
    };
  }
  server.connection = connectionJson({
    closet: {
      shared: server.grant.enabled,
      itemMode: server.grant.itemMode,
      itemCount: server.grant.enabled ? piecesIn(server.grant) : null,
      expiresAt: server.grant.expiresAt ?? null,
      expiresSoon: false,
      lastViewedAt: null,
      views30d: 0,
    },
    actions: { ...connectionJson().actions, canStopSharing: server.grant.enabled },
  });
  return server.grant;
};

const ok = (data: any) => ({ data, error: null });
const fail = (message: string, details?: string) => ({ data: null, error: { message, details } });

const callsOf = (fn: string) => mockRpc.mock.calls.filter(c => c[0] === fn).map(c => c[1]);

// ─── the harness ─────────────────────────────────────────────────────────────

const mounted: renderer.ReactTestRenderer[] = [];

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProShareScreen />);
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
  const isDisabled = (label: string) => Boolean(pressable(label).props.disabled);
  const flip = async (value: boolean) => {
    await act(async () => {
      await tree.root.findByType(Switch).props.onValueChange(value);
    });
    await settle();
  };
  const hasSwitch = () => tree.root.findAllByType(Switch).length > 0;
  const el = (name: string) => tree.root.findAll(n => (n.type as any) === name);
  const picker = () => el('ProItemPicker')[0];
  const notice = () => el('ProAccessNotice')[0];
  const terms = () => el('ProTermsSheet')[0];
  const done = async (ids: string[]) => {
    await act(async () => {
      picker().props.onDone(ids);
    });
    await settle();
  };
  return { tree, text, has, press, pressable, isDisabled, flip, hasSwitch, picker, notice, terms, done };
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = { connectionId: 'c1' };
  mockSignedIn = true;
  [mockNavigate, mockGoBack, mockRpc, mockOwned].forEach(m => m.mockReset());
  server = {
    status: statusJson(),
    connection: connectionJson(),
    grant: { ...OFF },
    connectionError: null,
    grantError: null,
    setError: null,
  };
  mockRpc.mockImplementation(async (fn: string, args: any) => {
    switch (fn) {
      case 'get_pro_status': return ok(server.status);
      case 'get_pro_connection': return server.connectionError ? fail(server.connectionError) : ok(server.connection);
      case 'get_pro_grant': return server.grantError ? fail(server.grantError) : ok(server.grant);
      case 'set_pro_grant': return server.setError ? fail(server.setError.message, server.setError.details) : ok(applySet(args));
      default: return fail(`unexpected call ${fn}`);
    }
  });
  mockOwned.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` })));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProShareScreen: sharing is off', () => {
  it('names the stylist and shows the consent text, with the switch off and no choice yet', async () => {
    const { text, hasSwitch, tree, has } = await render();
    expect(text()).toContain('What Maya Chen can see');
    expect(text()).toContain(proShareConsent('Maya Chen'));
    expect(text()).toContain('Not shared');
    expect(hasSwitch()).toBe(true);
    expect(tree.root.findByType(Switch).props.value).toBe(false);
    expect(has('Only pieces I choose')).toBe(false);
    expect(has('All my pieces')).toBe(false);
    expect(has('Share my closet')).toBe(false);
    expect(callsOf('set_pro_grant')).toHaveLength(0);
  });

  it('says the three things that cannot be taken back or are easy to miss', async () => {
    const { text } = await render();
    expect(text()).toContain("We can't take back what your stylist has already seen.");
    expect(text()).toContain('Photos can show more than the clothes');
    expect(text()).toContain('Sharing ends after 90 days unless you renew it');
    expect(text()).toContain("They won't see your wishlist");
  });

  it('has no default choice: both are unselected and "Share my closet" stays disabled', async () => {
    const { flip, pressable, isDisabled, text } = await render();
    await flip(true);
    expect(pressable('Only pieces I choose').props.accessibilityState.selected).toBe(false);
    expect(pressable('All my pieces').props.accessibilityState.selected).toBe(false);
    expect(isDisabled('Share my closet')).toBe(true);
    expect(text()).toContain(PRO_SHARE_ALL_HINT);
    expect(text()).toContain('Choose one to continue.');
    expect(callsOf('set_pro_grant')).toHaveLength(0);
  });

  it('lists "Only pieces I choose" first', async () => {
    const { flip, tree } = await render();
    await flip(true);
    const labels = tree.root
      .findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function', { deep: false })
      .map(n => n.props.accessibilityLabel);
    expect(labels).toEqual(['Only pieces I choose', 'All my pieces']);
  });

  it('shares everything: says how many pieces, then sends the build\'s text version and no piece ids', async () => {
    const { flip, press, isDisabled, text, pressable } = await render();
    await flip(true);
    await press('All my pieces');
    expect(pressable('All my pieces').props.accessibilityState.selected).toBe(true);
    expect(isDisabled('Share my closet')).toBe(false);
    expect(text()).toContain("You'll share 12 pieces with Maya Chen right now.");
    await press('Share my closet');
    expect(callsOf('set_pro_grant')).toEqual([
      { p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: PRO_SHARE_TEXT_VERSION },
    ]);
    expect(text()).toContain('All your pieces are shared.');
    expect(text()).toContain('Sharing is on');
  });

  it('shares chosen pieces: the picker opens, nothing is sent until the choice is confirmed', async () => {
    const { flip, press, picker, done, text, isDisabled } = await render();
    await flip(true);
    expect(picker().props.visible).toBe(false);
    await press('Only pieces I choose');
    expect(picker().props.visible).toBe(true);
    expect(picker().props.selectedIds).toEqual([]);
    await done(['a', 'b']);
    expect(picker().props.visible).toBe(false);
    expect(text()).toContain('2 pieces chosen');
    expect(text()).toContain("You'll share 2 pieces with Maya Chen right now.");
    expect(callsOf('set_pro_grant')).toHaveLength(0);
    expect(isDisabled('Share my closet')).toBe(false);
    await press('Share my closet');
    expect(callsOf('set_pro_grant')).toEqual([
      {
        p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: ['a', 'b'],
        p_text_version: PRO_SHARE_TEXT_VERSION,
      },
    ]);
    expect(text()).toContain('2 pieces you chose are shared.');
  });

  it('keeps "Share my closet" disabled when the picker is closed with nothing chosen', async () => {
    const { flip, press, done, isDisabled, text } = await render();
    await flip(true);
    await press('Only pieces I choose');
    await done([]);
    expect(isDisabled('Share my closet')).toBe(true);
    expect(text()).toContain('Choose one to continue.');
  });

  it('can be cancelled without sending anything', async () => {
    const { flip, press, tree, has } = await render();
    await flip(true);
    await press('All my pieces');
    await press('Cancel');
    expect(has('All my pieces')).toBe(false);
    expect(tree.root.findByType(Switch).props.value).toBe(false);
    expect(callsOf('set_pro_grant')).toHaveLength(0);
  });

  it('is closed again by flipping the switch back', async () => {
    const { flip, has } = await render();
    await flip(true);
    expect(has('All my pieces')).toBe(true);
    await flip(false);
    expect(has('All my pieces')).toBe(false);
    expect(callsOf('set_pro_grant')).toHaveLength(0);
  });

  it('shows "Update SmartCloset to change sharing" when the server has moved on, and nothing is shared', async () => {
    server.setError = { message: 'stale_consent_text' };
    const { flip, press, text, isDisabled } = await render();
    await flip(true);
    await press('All my pieces');
    await press('Share my closet');
    expect(text()).toContain('Update SmartCloset to change sharing.');
    expect(callsOf('set_pro_grant')).toHaveLength(1);
    expect(isDisabled('Share my closet')).toBe(false);
  });

  it('says a chosen piece is gone and counts the closet again', async () => {
    server.setError = { message: 'item_not_found', details: '1' };
    const { flip, press, done, text } = await render();
    await flip(true);
    await press('Only pieces I choose');
    await done(['a']);
    mockOwned.mockClear();
    await press('Share my closet');
    expect(text()).toContain("One of those pieces isn't in your closet any more.");
    expect(mockOwned).toHaveBeenCalledTimes(1);
  });

  it('shows a plain line for any other refusal and keeps the choice for another try', async () => {
    server.setError = { message: 'pro_rate_limited', details: 'grant_day' };
    const { flip, press, text, isDisabled } = await render();
    await flip(true);
    await press('All my pieces');
    await press('Share my closet');
    expect(text()).toContain("You're going a bit fast. Please wait a moment.");
    expect(isDisabled('Share my closet')).toBe(false);
    server.setError = null;
    await press('Share my closet');
    expect(callsOf('set_pro_grant')).toHaveLength(2);
    expect(text()).toContain('All your pieces are shared.');
  });

  it('opens the terms when a write needs them, and repeats the write once they are agreed', async () => {
    server.setError = { message: 'pro_terms_required', details: 'client' };
    const { flip, press, terms } = await render();
    await flip(true);
    await press('All my pieces');
    expect(terms().props.visible).toBe(false);
    await press('Share my closet');
    expect(terms().props.visible).toBe(true);
    expect(terms().props.role).toBe('client');
    expect(callsOf('set_pro_grant')).toHaveLength(1);
    server.setError = null;
    await act(async () => {
      terms().props.onAccepted();
    });
    await settle();
    expect(callsOf('set_pro_grant')).toHaveLength(2);
    expect(terms().props.visible).toBe(false);
  });

  it('does not repeat the write when the terms are dismissed', async () => {
    server.setError = { message: 'pro_terms_required', details: 'client' };
    const { flip, press, terms } = await render();
    await flip(true);
    await press('All my pieces');
    await press('Share my closet');
    await act(async () => {
      terms().props.onClose();
    });
    await settle();
    expect(terms().props.visible).toBe(false);
    expect(callsOf('set_pro_grant')).toHaveLength(1);
  });
});

describe('ProShareScreen: an empty closet', () => {
  it('says there is nothing to share and offers Add clothing', async () => {
    mockOwned.mockResolvedValue([]);
    const { text, press, tree } = await render();
    expect(text()).toContain('You have no pieces to share yet');
    expect(tree.root.findByType(Switch).props.disabled).toBe(true);
    await press('Add clothing');
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing');
  });

  it('counts the closet again when the person comes back with something added', async () => {
    mockOwned.mockResolvedValue([]);
    const { text, tree } = await render();
    expect(text()).toContain('You have no pieces to share yet');
    mockOwned.mockResolvedValue([{ id: 'x' }]);
    await act(async () => {
      mockFocus!();
    });
    await settle();
    expect(text()).not.toContain('You have no pieces to share yet');
    expect(tree.root.findByType(Switch).props.disabled).toBe(false);
  });

  it('reads a closet that has pieces once per visit, not on every return', async () => {
    const { tree } = await render();
    expect(mockOwned).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockFocus!();
    });
    await settle();
    expect(mockOwned).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType(Switch).props.disabled).toBe(false);
  });

  it('reads the closet again on a return when the last read failed', async () => {
    mockOwned.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(mockOwned).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockFocus!();
    });
    await settle();
    expect(mockOwned).toHaveBeenCalledTimes(2);
  });

  it('does not decide the closet is empty when it could not be counted', async () => {
    mockOwned.mockRejectedValue(new Error('offline'));
    const { text, flip, has } = await render();
    expect(text()).not.toContain('You have no pieces to share yet');
    await flip(true);
    expect(has('All my pieces')).toBe(true);
  });
});

describe('ProShareScreen: sharing is on', () => {
  beforeEach(() => {
    server.grant = { ...ON_ALL };
    server.connection = connectionJson({
      closet: { shared: true, itemMode: 'all', itemCount: 12, expiresAt: ON_ALL.expiresAt, expiresSoon: false, lastViewedAt: ON_ALL.lastViewedAt, views30d: 4 },
      actions: { ...connectionJson().actions, canStopSharing: true },
    });
  });

  it('shows what is shared, when it ends, and when the closet was last looked at', async () => {
    const { text, tree } = await render();
    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(text()).toContain('All your pieces are shared.');
    expect(text()).toContain(`Sharing ends on ${dayText(ON_ALL.expiresAt)}.`);
    expect(text()).toContain(`Last viewed ${dayText(ON_ALL.lastViewedAt)}.`);
    expect(text()).toContain('Closet pages viewed in the last 30 days: 4.');
  });

  it('says "Not viewed yet" before the first look', async () => {
    server.grant = { ...ON_ALL, lastViewedAt: undefined, views30d: 0 };
    const { text } = await render();
    expect(text()).toContain('Not viewed yet.');
  });

  it('does not show the consent again while sharing is on', async () => {
    const { text } = await render();
    expect(text()).not.toContain('Let Maya Chen see my closet');
  });

  it('stops at once: no confirmation, no text version, nothing but the connection and the switch', async () => {
    const { press, text, tree } = await render();
    await press('Stop sharing');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(callsOf('set_pro_grant')).toEqual([{ p_connection: 'c1', p_scope: 'closet', p_enabled: false }]);
    expect(text()).toContain('Not shared');
    expect(tree.root.findByType(Switch).props.value).toBe(false);
  });

  it('stops by flipping the switch off, in the same way', async () => {
    const { flip } = await render();
    await flip(false);
    expect(callsOf('set_pro_grant')).toEqual([{ p_connection: 'c1', p_scope: 'closet', p_enabled: false }]);
  });

  it('shows a failure to stop and keeps the button', async () => {
    server.setError = { message: 'pro_rate_limited', details: 'grant_day' };
    const { press, text, has } = await render();
    await press('Stop sharing');
    expect(text()).toContain("You're going a bit fast.");
    expect(has('Stop sharing')).toBe(true);
  });

  it('changes the pieces of a live grant without renewing it', async () => {
    server.grant = { ...ON_SELECTED };
    const { press, picker, done, text } = await render();
    await press("Change what's shared");
    expect(text()).toContain('The end date stays the same.');
    expect(text()).toContain('3 pieces chosen');
    await press('Only pieces I choose');
    expect(picker().props.selectedIds).toEqual(['a', 'b', 'c']);
    await done(['a', 'd']);
    await press('Save changes');
    const [call] = callsOf('set_pro_grant');
    expect(call).toEqual({
      p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: ['a', 'd'],
      p_text_version: PRO_SHARE_TEXT_VERSION,
    });
    expect(call.p_renew).toBeUndefined();
    expect(text()).toContain(`Sharing ends on ${dayText(ON_ALL.expiresAt)}.`);
  });

  it('switches a live grant between all and chosen pieces', async () => {
    const { press, text } = await render();
    await press("Change what's shared");
    expect(text()).toContain("You'll share 12 pieces with Maya Chen right now.");
    await press('Cancel');
    expect(text()).toContain('All your pieces are shared.');
    expect(callsOf('set_pro_grant')).toHaveLength(0);
  });

  it('shows a warning in the last days and "Keep sharing" renews with the same pieces', async () => {
    server.grant = { ...ON_SELECTED, expiresSoon: true };
    const { text, press } = await render();
    expect(text()).toContain(`Your stylist's access ends on ${dayText(ON_ALL.expiresAt)}. Keep sharing?`);
    await press('Keep sharing');
    expect(callsOf('set_pro_grant')).toEqual([
      {
        p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: ['a', 'b', 'c'],
        p_text_version: PRO_SHARE_TEXT_VERSION, p_renew: true,
      },
    ]);
    expect(text()).not.toContain('Keep sharing?');
  });

  it('renews "all pieces" without piece ids', async () => {
    server.grant = { ...ON_ALL, expiresSoon: true };
    const { press } = await render();
    await press('Keep sharing');
    expect(callsOf('set_pro_grant')).toEqual([
      { p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: PRO_SHARE_TEXT_VERSION, p_renew: true },
    ]);
  });

  it('has no "Keep sharing" until the last days', async () => {
    const { has } = await render();
    expect(has('Keep sharing')).toBe(false);
  });

  it('shows the log of what happened, newest first, and the rest on request', async () => {
    const events = [
      { event: 'renewed', at: '2026-10-20T00:00:00Z' },
      { event: 'changed', itemMode: 'selected', itemCount: 3, at: '2026-10-15T00:00:00Z' },
      { event: 'granted', itemMode: 'all', at: '2026-10-10T00:00:00Z' },
      { event: 'revoked', at: '2026-10-09T00:00:00Z' },
      { event: 'granted', itemMode: 'all', at: '2026-10-08T00:00:00Z' },
      { event: 'expired', at: '2026-10-07T00:00:00Z' },
      { event: 'mystery', at: '2026-10-06T00:00:00Z' },
    ];
    server.grant = { ...ON_ALL, events };
    const { text, press } = await render();
    expect(text()).toContain('History');
    expect(text()).toContain(`Sharing renewed on ${dayText('2026-10-20T00:00:00Z')}`);
    expect(text()).toContain('Sharing changed (3 pieces)');
    expect(text()).not.toContain('Sharing ended');
    await press('Show all');
    expect(text()).toContain('Sharing ended');
    expect(text()).not.toContain('mystery');
  });
});

describe('ProShareScreen: only the way out', () => {
  beforeEach(() => {
    server.grant = { ...ON_SELECTED };
    server.connection = connectionJson({
      safetyOnly: true,
      closet: { shared: true, itemMode: 'selected', itemCount: 3, expiresAt: ON_ALL.expiresAt, expiresSoon: true, lastViewedAt: null, views30d: 0 },
      actions: { ...connectionJson().actions, canMessage: false, canPropose: false, canShare: false, canStopSharing: true },
    });
  });

  const expectOnlyStop = async (h: Awaited<ReturnType<typeof render>>) => {
    expect(h.hasSwitch()).toBe(false);
    expect(h.has('Share my closet')).toBe(false);
    expect(h.has('Keep sharing')).toBe(false);
    expect(h.has("Change what's shared")).toBe(false);
    expect(h.has('Stop sharing')).toBe(true);
    await h.press('Stop sharing');
    expect(callsOf('set_pro_grant')).toEqual([{ p_connection: 'c1', p_scope: 'closet', p_enabled: false }]);
  };

  it('offers Stop sharing when the feature is paused', async () => {
    server.status = statusJson({ proEnabled: false });
    const h = await render();
    expect(h.notice().props.access.state).toBe('paused');
    await expectOnlyStop(h);
  });

  it('offers Stop sharing when the account is suspended', async () => {
    server.status = statusJson({ suspended: true });
    const h = await render();
    expect(h.notice().props.access.state).toBe('suspended');
    await expectOnlyStop(h);
  });

  it('offers Stop sharing when this build is older than the server (update required) and records nothing', async () => {
    server.status = statusJson({ versions: { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: '2026-11' } });
    const h = await render();
    expect(h.notice().props.access.state).toBe('ready');
    expect(h.notice().props.access.client).toBe('update_required');
    await expectOnlyStop(h);
    expect(mockRpc.mock.calls.map(c => c[0])).not.toContain('accept_pro_terms');
  });

  it('offers Stop sharing when the terms are out of date, with the terms sheet opening by itself', async () => {
    server.status = statusJson({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } });
    const h = await render();
    expect(h.notice().props.access.client).toBe('needs_terms');
    expect(h.terms().props.visible).toBe(true);
    expect(h.terms().props.role).toBe('client');
    expect(typeof h.notice().props.onReadTerms).toBe('function');
    await expectOnlyStop(h);
  });

  it('reopens the terms from the notice after they were dismissed', async () => {
    server.status = statusJson({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } });
    const h = await render();
    await act(async () => {
      h.terms().props.onClose();
    });
    expect(h.terms().props.visible).toBe(false);
    await act(async () => {
      h.notice().props.onReadTerms();
    });
    expect(h.terms().props.visible).toBe(true);
  });

  it('asks for the adult confirmation in the terms when it is missing', async () => {
    server.status = statusJson({ adultConfirmed: false, client: { termsCurrent: true, connections: 1, connectionLimit: 5 } });
    const h = await render();
    expect(h.terms().props.visible).toBe(true);
    expect(h.terms().props.needsAdult).toBe(true);
  });

  it('shows the summary of what is shared under the notice, with the date', async () => {
    server.status = statusJson({ proEnabled: false });
    const { text } = await render();
    expect(text()).toContain('3 pieces you chose are shared.');
    expect(text()).toContain(`Sharing ends on ${dayText(ON_ALL.expiresAt)}.`);
  });

  it('shows nothing to stop when nothing is shared', async () => {
    server.status = statusJson({ proEnabled: false });
    server.grant = { ...OFF };
    server.connection = connectionJson({ safetyOnly: true });
    const { has } = await render();
    expect(has('Stop sharing')).toBe(false);
  });
});

describe('ProShareScreen: states', () => {
  it('shows a placeholder while access loads', async () => {
    let release!: () => void;
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_pro_status') await new Promise<void>(res => { release = res; });
      return ok(statusJson());
    });
    const { tree } = await render();
    expect(tree.root.findAll(n => (n.type as any) === 'Skeleton').length).toBeGreaterThan(0);
    await act(async () => {
      release();
    });
    await settle();
  });

  it('shows the notice for a guest and calls nothing', async () => {
    mockSignedIn = false;
    const { notice } = await render();
    expect(notice().props.access.state).toBe('guest');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the notice, and does not read the connection, on a server without the feature', async () => {
    mockRpc.mockImplementation(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    const { notice } = await render();
    expect(notice().props.access.state).toBe('not_deployed');
    expect(mockRpc.mock.calls.map(c => c[0])).toEqual(['get_pro_status']);
  });

  it('shows the notice with a way to try again when access cannot be read', async () => {
    mockRpc.mockImplementation(async () => { throw new TypeError('Network request failed'); });
    const { notice } = await render();
    expect(notice().props.access.state).toBe('error');
    expect(typeof notice().props.onRefresh).toBe('function');
  });

  it('says a connection is gone, with a way back', async () => {
    server.connectionError = 'pro_unavailable';
    const { text, press } = await render();
    expect(text()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('says the same when there is no connection to read', async () => {
    mockParams = {};
    const { text } = await render();
    expect(text()).toContain('This is no longer available.');
    expect(callsOf('get_pro_grant')).toHaveLength(0);
  });

  it('does not show the sharing page for the stylist side of a connection', async () => {
    server.connection = connectionJson({ myRole: 'stylist' });
    const { text, hasSwitch } = await render();
    expect(text()).toContain('This is no longer available.');
    expect(hasSwitch()).toBe(false);
  });

  it('shows a way to try again when the settings cannot be read, and reads again', async () => {
    server.grantError = 'boom';
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load your sharing settings");
    server.grantError = null;
    await press('Try again to load your sharing settings');
    expect(text()).toContain('What Maya Chen can see');
  });

  it('shows a connection that has ended as nothing shared, with who ended it', async () => {
    server.connection = connectionJson({ status: 'ended', endedBy: 'me', endedAt: '2026-10-10T00:00:00Z' });
    const { text, hasSwitch } = await render();
    expect(text()).toContain('Nothing is shared');
    expect(text()).toContain('You ended this connection.');
    expect(hasSwitch()).toBe(false);
  });

  it('reads the connection and the grant by name, and the sign-in once', async () => {
    await render();
    expect(callsOf('get_pro_connection')).toEqual([{ p_connection: 'c1' }]);
    expect(callsOf('get_pro_grant')).toEqual([{ p_connection: 'c1' }]);
  });

  it('goes back from the header', async () => {
    const { press } = await render();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('renders no commerce wording and no price, in any step', async () => {
    server.grant = { ...ON_ALL, expiresSoon: true, events: [{ event: 'granted', itemMode: 'all', at: '2026-10-01T00:00:00Z' }] };
    const live = await render();
    const forbidden = /\b(book|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i;
    expect(live.text()).not.toMatch(forbidden);
    expect(live.text()).not.toMatch(/\$\d/);
    server.grant = { ...OFF };
    const setup = await render();
    await setup.flip(true);
    await setup.press('All my pieces');
    expect(setup.text()).not.toMatch(forbidden);
    expect(setup.text()).not.toMatch(/\$\d/);
  });
});

describe('ProShareScreen source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProShareScreen.tsx'), 'utf8');

  it('navigates only to AddClothing and never logs an error', () => {
    const targets = [...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]);
    expect(targets).toEqual(['AddClothing']);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/AsyncStorage/);
  });

  it('has no text field, so it needs no keyboard accessory', () => {
    expect(source).not.toMatch(/<(TextInput|Input)\b/);
  });
});
