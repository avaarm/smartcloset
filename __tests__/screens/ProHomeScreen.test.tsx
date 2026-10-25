import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, Linking, RefreshControl } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockParams: any = {};
let mockFocus: (() => void) | null = null;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetParams = jest.fn();
// One stable object, as a real navigation prop is.
const mockNav = {
  navigate: (...a: any[]) => mockNavigate(...a),
  goBack: (...a: any[]) => mockGoBack(...a),
  setParams: (...a: any[]) => mockSetParams(...a),
};
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
const mockList = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  listProConnections: (...a: any[]) => mockList(...a),
}));

let mockMode: any = {};
jest.mock('../../src/context/AccountModeContext', () => ({
  useAccountMode: () => mockMode,
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
jest.mock('../../src/components/ProBlockedSheet', () => stub('ProBlockedSheet'));
jest.mock('../../src/components/ProGuidelinesSheet', () => stub('ProGuidelinesSheet'));
jest.mock('../../src/components/ProRedeemSheet', () => stub('ProRedeemSheet'));
jest.mock('../../src/components/ProSafetySheet', () => stub('ProSafetySheet'));
jest.mock('../../src/components/ProStylistProfileSheet', () => stub('ProStylistProfileSheet'));
jest.mock('../../src/components/ProTermsSheet', () => stub('ProTermsSheet'));

import ProHomeScreen from '../../src/screens/ProHomeScreen';
import { ProError } from '../../src/services/proErrors';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import { PRO_INDEPENDENT_LINE } from '../../src/config/proRules';
import type { ProConnectionSummary, ProStatus } from '../../src/types/pro';

// React's act needs setImmediate and microtasks to be real; only the timers the screen uses are faked.
const fakeClock = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

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

const STYLIST = {
  termsCurrent: true, accepting: true, approved: false, invitesHeld: false,
  activeClients: 0, clientLimit: 3, liveInvites: 0, inviteLimit: 1,
};

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

const row = (id: string, over: Partial<ProConnectionSummary> = {}): ProConnectionSummary => ({
  id,
  myRole: 'client',
  otherLabel: `Stylist ${id}`,
  otherHeadline: `Headline ${id}`,
  status: 'active',
  startedAt: '2026-10-01T10:00:00Z',
  lastActivityAt: '2026-10-20T10:00:00Z',
  unread: 0,
  attention: false,
  pendingAppointments: 0,
  closetShared: false,
  ...over,
});

const ended = (id: string) => row(id, { status: 'ended', endedBy: 'stylist', endedAt: '2026-09-01T00:00:00Z' });

// ─── the harness ─────────────────────────────────────────────────────────────

const mounted: renderer.ReactTestRenderer[] = [];

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProHomeScreen />);
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
  const rerender = async () => {
    await act(async () => {
      tree.update(<ProHomeScreen />);
    });
    await settle();
  };
  return { tree, text, has, press, pressable, el, one, call, refocus, rerender };
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = {};
  [mockNavigate, mockGoBack, mockSetParams, mockStatus, mockAccept, mockList].forEach(m => m.mockReset());
  mockMode = {
    currentMode: 'user',
    switchMode: jest.fn(async () => undefined),
    refreshRole: jest.fn(async () => undefined),
  };
  mockStatus.mockResolvedValue(status());
  mockList.mockResolvedValue([]);
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

describe('ProHomeScreen: your stylists', () => {
  it('lists active stylists under "Your stylists" and ended ones under "Past"', async () => {
    mockList.mockResolvedValue([row('a'), row('b', { attention: true, lastMessagePreview: 'See you Thursday' }), ended('z')]);
    const { text, has } = await render();
    expect(mockList).toHaveBeenCalledWith('client');
    expect(text()).toContain('Your stylists');
    expect(text()).toContain('Stylist a');
    expect(text()).toContain('Headline a');
    expect(text()).toContain('See you Thursday');
    expect(text()).toContain('Past');
    expect(text()).toContain('Stylist z');
    expect(text()).toContain('Ended');
    expect(has('Open Stylist a')).toBe(true);
    expect(text().indexOf('Your stylists')).toBeLessThan(text().indexOf('Past'));
  });

  it('opens a connection by id', async () => {
    mockList.mockResolvedValue([row('a'), ended('z')]);
    const { press } = await render();
    await press('Open Stylist a');
    expect(mockNavigate).toHaveBeenCalledWith('ProConnection', { connectionId: 'a' });
    await press('Open Stylist z');
    expect(mockNavigate).toHaveBeenLastCalledWith('ProConnection', { connectionId: 'z' });
  });

  it('shows the last ten ended connections, then the rest on request', async () => {
    mockList.mockResolvedValue([row('a'), ...Array.from({ length: 13 }, (_, i) => ended(`e${i}`))]);
    const { has, press } = await render();
    expect(has('Open Stylist e9')).toBe(true);
    expect(has('Open Stylist e10')).toBe(false);
    await press('Show older');
    expect(has('Open Stylist e12')).toBe(true);
    expect(has('Show older')).toBe(false);
  });

  it('has no "Show older" for ten or fewer', async () => {
    mockList.mockResolvedValue([row('a'), ...Array.from({ length: 10 }, (_, i) => ended(`e${i}`))]);
    const { has } = await render();
    expect(has('Show older')).toBe(false);
  });

  it('says there are no stylists yet, with one way to connect', async () => {
    const { text, has, one, press } = await render();
    expect(text()).toContain('No stylists yet');
    expect(text()).toContain('Ask your stylist for an invite code.');
    expect(has('Connect with a stylist')).toBe(true);
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    await press('Connect with a stylist');
    expect(one('ProRedeemSheet').props.visible).toBe(true);
  });

  it('offers Connect under the list when there are stylists', async () => {
    mockList.mockResolvedValue([row('a')]);
    const { text, press, one } = await render();
    expect(text()).not.toContain('No stylists yet');
    await press('Connect with a stylist');
    expect(one('ProRedeemSheet').props.visible).toBe(true);
  });

  it('says the stylists are independent professionals', async () => {
    const { text } = await render();
    expect(text()).toContain(PRO_INDEPENDENT_LINE);
  });

  it('shows a placeholder while the list loads', async () => {
    const d = deferred<ProConnectionSummary[]>();
    mockList.mockReturnValue(d.promise);
    const { tree, text } = await render();
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading your stylists').length).toBeGreaterThan(0);
    expect(text()).not.toContain('No stylists yet');
    await act(async () => {
      d.resolve([row('a')]);
    });
    await settle();
    expect(text()).toContain('Stylist a');
  });

  it('shows a way to try again when the list cannot be read, and never "No stylists yet"', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'));
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load your stylists");
    expect(text()).not.toContain('No stylists yet');
    mockList.mockResolvedValue([row('a')]);
    await press('Try again to load your stylists');
    expect(text()).toContain('Stylist a');
    expect(text()).not.toContain("Couldn't load your stylists");
  });

  it('keeps the list and shows a banner when a later read fails', async () => {
    mockList.mockResolvedValue([row('a')]);
    const { text, refocus, press } = await render();
    mockList.mockRejectedValueOnce(new Error('offline'));
    await refocus();
    // A quiet read that fails leaves the list as it was.
    expect(text()).toContain('Stylist a');
    expect(text()).not.toContain("Couldn't load your stylists");
    mockList.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await mounted[0].root.findByType(RefreshControl).props.onRefresh();
    });
    await settle();
    expect(text()).toContain('Stylist a');
    expect(text()).toContain("Couldn't load your stylists");
    mockList.mockResolvedValue([row('a'), row('b')]);
    await press('Try again to load your stylists');
    expect(text()).toContain('Stylist b');
  });

  it('reads again whenever the screen comes back, and drops an answer that arrives late', async () => {
    const slow = deferred<ProConnectionSummary[]>();
    mockList.mockReturnValueOnce(slow.promise);
    const { text, refocus } = await render();
    mockList.mockResolvedValue([row('new')]);
    await refocus();
    expect(text()).toContain('Stylist new');
    await act(async () => {
      slow.resolve([row('stale')]);
    });
    await settle();
    expect(text()).toContain('Stylist new');
    expect(text()).not.toContain('Stylist stale');
  });

  it('refreshes by pulling down', async () => {
    const { tree } = await render();
    mockList.mockClear();
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('goes back from the header', async () => {
    const { press } = await render();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('ProHomeScreen: connecting', () => {
  it('opens the connection after "Choose what to share", and reads the list again', async () => {
    const { press, one, call } = await render();
    await press('Connect with a stylist');
    mockList.mockClear();
    mockStatus.mockClear();
    mockList.mockResolvedValue([row('new')]);
    await call(() => one('ProRedeemSheet').props.onConnected('new'));
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('ProConnection', { connectionId: 'new' });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockStatus).toHaveBeenCalled();
  });

  it('reads the list again when the sheet is closed with Done, because a connection may have been made', async () => {
    const { press, one, call, text } = await render();
    await press('Connect with a stylist');
    mockList.mockResolvedValue([row('made')]);
    await call(() => one('ProRedeemSheet').props.onClose());
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(text()).toContain('Stylist made');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hands a stylist the person wants to report or block to the report sheet once the connect sheet has left', async () => {
    const { press, one, call, el } = await render();
    await press('Connect with a stylist');
    fakeClock();
    await call(() => one('ProRedeemSheet').props.onReport('invite-1', 'Maya Chen'));
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    // One modal at a time: the second waits for the first to go.
    expect(el('ProSafetySheet').every(s => s.props.visible === false)).toBe(true);
    await call(() => jest.advanceTimersByTime(800));
    const safety = one('ProSafetySheet');
    expect(safety.props.visible).toBe(true);
    expect(safety.props.refType).toBe('invite');
    expect(safety.props.refId).toBe('invite-1');
    expect(safety.props.inviteId).toBe('invite-1');
    expect(safety.props.label).toBe('Maya Chen');
    expect(safety.props.connectionId).toBeUndefined();
    await call(() => safety.props.onBlocked());
    expect(one('ProSafetySheet').props.visible).toBe(false);
  });

  it('never has two sheets up at once', async () => {
    const { press, one, tree, call } = await render();
    await press('Connect with a stylist');
    await call(() => one('ProRedeemSheet').props.onClose());
    const visible = () => tree.root.findAll(n => typeof n.type === 'string' && /Sheet$/.test(n.type as string) && n.props.visible === true);
    expect(visible()).toHaveLength(0);
  });
});

describe('ProHomeScreen: the Stylist workspace', () => {
  it('offers Become a stylist to someone with no profile', async () => {
    const { press, one, call } = await render();
    expect(one('ProStylistProfileSheet').props.visible).toBe(false);
    await press('Become a stylist');
    expect(one('ProStylistProfileSheet').props.visible).toBe(true);
    mockStatus.mockClear();
    await call(() => one('ProStylistProfileSheet').props.onSaved());
    expect(one('ProStylistProfileSheet').props.visible).toBe(false);
    expect(mockStatus).toHaveBeenCalled();
  });

  it('closes the profile sheet without creating anything', async () => {
    const { press, one, call } = await render();
    await press('Become a stylist');
    await call(() => one('ProStylistProfileSheet').props.onClose());
    expect(one('ProStylistProfileSheet').props.visible).toBe(false);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('opens the workspace for a stylist: the role is read again, then the mode switches', async () => {
    mockStatus.mockResolvedValue(status({ stylist: STYLIST }));
    const { press, has } = await render();
    expect(has('Become a stylist')).toBe(false);
    await press('Open the Stylist workspace');
    expect(mockMode.refreshRole).toHaveBeenCalledTimes(1);
    expect(mockMode.switchMode).toHaveBeenCalledWith('stylist');
    expect(mockMode.refreshRole.mock.invocationCallOrder[0]).toBeLessThan(mockMode.switchMode.mock.invocationCallOrder[0]);
  });

  it('works with a context that has only the first two members', async () => {
    mockMode = { currentMode: 'user', switchMode: jest.fn(async () => undefined) };
    mockStatus.mockResolvedValue(status({ stylist: STYLIST }));
    const { press } = await render();
    await press('Open the Stylist workspace');
    expect(mockMode.switchMode).toHaveBeenCalledWith('stylist');
  });

  it('says so when the mode could not be switched, and lets the person try again', async () => {
    mockMode.switchMode = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    mockStatus.mockResolvedValue(status({ stylist: STYLIST }));
    const { press, text } = await render();
    await press('Open the Stylist workspace');
    expect(text()).toContain("Couldn't open the workspace. Please try again.");
    await press('Open the Stylist workspace');
    expect(mockMode.switchMode).toHaveBeenCalledTimes(2);
  });

  it('offers nothing about the workspace to a stylist whose terms are out of date', async () => {
    mockStatus.mockResolvedValue(status({ stylist: { ...STYLIST, termsCurrent: false } }));
    const { has } = await render();
    expect(has('Open the Stylist workspace')).toBe(false);
    expect(has('Become a stylist')).toBe(false);
  });

  it('offers no way to become a stylist when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({
      versions: { stylistTerms: '2026-11', clientTerms: '2026-10', shareText: '2026-10' },
    }));
    const { has } = await render();
    expect(has('Become a stylist')).toBe(false);
  });
});

describe('ProHomeScreen: the first-run choice', () => {
  it('opens the connect sheet once access has settled, and clears the parameter', async () => {
    mockParams = { open: 'redeem' };
    const d = deferred<ProStatus>();
    mockStatus.mockReturnValue(d.promise);
    const { one } = await render();
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(mockSetParams).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve(status());
    });
    await settle();
    expect(one('ProRedeemSheet').props.visible).toBe(true);
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({ open: undefined });
  });

  it('opens the profile sheet for a new stylist', async () => {
    mockParams = { open: 'stylist_setup' };
    const { one } = await render();
    expect(one('ProStylistProfileSheet').props.visible).toBe(true);
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({ open: undefined });
  });

  it('acts on it once, even if the screen renders again before the parameter is gone', async () => {
    mockParams = { open: 'redeem' };
    const { one, rerender, call } = await render();
    await call(() => one('ProRedeemSheet').props.onClose());
    await rerender();
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledTimes(1);
  });

  it('acts on a new choice that arrives later', async () => {
    mockParams = { open: 'redeem' };
    const { one, rerender, call } = await render();
    await call(() => one('ProRedeemSheet').props.onClose());
    mockParams = {};
    await rerender();
    mockParams = { open: 'redeem' };
    await rerender();
    expect(one('ProRedeemSheet').props.visible).toBe(true);
  });

  it('opens nothing, and still clears the parameter, when the feature is paused', async () => {
    mockParams = { open: 'redeem' };
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const { one } = await render();
    expect(one('ProRedeemSheet').props.visible).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({ open: undefined });
  });

  it('opens nothing for a role this build is older than the server for', async () => {
    mockParams = { open: 'redeem' };
    mockStatus.mockResolvedValue(status({
      versions: { stylistTerms: '2026-10', clientTerms: '2026-11', shareText: '2026-10' },
    }));
    const { one } = await render();
    expect(one('ProRedeemSheet').props.visible).toBe(false);
  });

  it('does not put the terms on top of the sheet it opened for a person who has accepted nothing', async () => {
    mockParams = { open: 'redeem' };
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 0, connectionLimit: 5 }, adultConfirmed: false }));
    const { one, call } = await render();
    expect(one('ProRedeemSheet').props.visible).toBe(true);
    expect(one('ProTermsSheet').props.visible).toBe(false);
    // And once that sheet is closed, the terms do not jump out on their own: they are one tap away.
    await call(() => one('ProRedeemSheet').props.onClose());
    expect(one('ProTermsSheet').props.visible).toBe(false);
  });
});

describe('ProHomeScreen: the menu', () => {
  it('opens the guidelines and the list of blocked people', async () => {
    const { press, one, call } = await render();
    expect(one('ProGuidelinesSheet').props.visible).toBe(false);
    await press('Stylists menu');
    await press('Professional guidelines');
    expect(one('ProGuidelinesSheet').props.visible).toBe(true);
    await call(() => one('ProGuidelinesSheet').props.onClose());
    await press('Stylists menu');
    await press('Blocked stylists and clients');
    expect(one('ProBlockedSheet').props.visible).toBe(true);
    await call(() => one('ProBlockedSheet').props.onClose());
    expect(one('ProBlockedSheet').props.visible).toBe(false);
  });

  it('closes by tapping outside it', async () => {
    const { press, has } = await render();
    await press('Stylists menu');
    expect(has('Professional guidelines')).toBe(true);
    await press('Close menu');
    expect(has('Professional guidelines')).toBe(false);
  });

  it('opens mail to support, and says where to write when mail cannot be opened', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const { press } = await render();
    await press('Stylists menu');
    await press('Email support');
    expect(open).toHaveBeenCalledWith(SUPPORT_MAILTO);
    open.mockRejectedValue(new Error('no mail'));
    await press('Stylists menu');
    await press('Email support');
    expect(alertSpy).toHaveBeenCalledWith('Could not open Mail', expect.stringContaining('You can reach us at'));
  });
});

describe('ProHomeScreen: when the person cannot use it (yet)', () => {
  it('shows a placeholder while access loads and reads nothing', async () => {
    const d = deferred<ProStatus>();
    mockStatus.mockReturnValue(d.promise);
    const { tree } = await render();
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading your stylists').length).toBeGreaterThan(0);
    expect(mockList).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve(status());
    });
    await settle();
  });

  it('asks a guest to sign in, and reads nothing', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { one, call, has } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('guest');
    await call(() => one('ProAccessNotice').props.onSignIn());
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    expect(mockList).not.toHaveBeenCalled();
    expect(has('Stylists menu')).toBe(false);
    expect(has('Connect with a stylist')).toBe(false);
  });

  it('says so, and reads nothing, on a server without the feature', async () => {
    mockStatus.mockRejectedValue(new ProError('not_deployed'));
    const { one, has } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('not_deployed');
    expect(mockList).not.toHaveBeenCalled();
    expect(has('Stylists menu')).toBe(false);
  });

  it('offers to try again when access cannot be read', async () => {
    mockStatus.mockRejectedValueOnce(new ProError('offline'));
    const { one, call } = await render();
    expect(one('ProAccessNotice').props.access.state).toBe('error');
    mockStatus.mockResolvedValue(status());
    await call(() => one('ProAccessNotice').props.onRefresh());
    expect(mockList).toHaveBeenCalled();
  });

  const expectWaysOutOnly = async (h: Awaited<ReturnType<typeof render>>) => {
    expect(h.text()).toContain('Stylist a');
    expect(h.text()).toContain('Stylist z');
    expect(h.has('Connect with a stylist')).toBe(false);
    expect(h.has('Become a stylist')).toBe(false);
    expect(h.has('Open the Stylist workspace')).toBe(false);
    expect(h.text()).not.toContain('No stylists yet');
    // Rows open: a connection can always be reached to stop sharing, end, report or block.
    await h.press('Open Stylist a');
    expect(mockNavigate).toHaveBeenCalledWith('ProConnection', { connectionId: 'a' });
  };

  beforeEach(() => {
    mockList.mockResolvedValue([row('a'), ended('z')]);
  });

  it('keeps the list when the feature is paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.state).toBe('paused');
    await expectWaysOutOnly(h);
    expect(h.has('Stylists menu')).toBe(true);
  });

  it('keeps the list when the account is suspended', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.state).toBe('suspended');
    await expectWaysOutOnly(h);
  });

  it('keeps the list, and records nothing, when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2026-11', clientTerms: '2026-11', shareText: '2026-11' } }));
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.client).toBe('update_required');
    await expectWaysOutOnly(h);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('keeps the list when the terms are out of date, and opens them by itself', async () => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } }));
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.client).toBe('needs_terms');
    expect(h.one('ProTermsSheet').props.visible).toBe(true);
    expect(h.one('ProTermsSheet').props.role).toBe('client');
    expect(h.one('ProTermsSheet').props.needsAdult).toBe(false);
    await expectWaysOutOnly(h);
  });

  it('lets the person close the terms and open them again from the notice', async () => {
    mockStatus.mockResolvedValue(status({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } }));
    const h = await render();
    await h.call(() => h.one('ProTermsSheet').props.onClose());
    expect(h.one('ProTermsSheet').props.visible).toBe(false);
    await h.call(() => h.one('ProAccessNotice').props.onReadTerms());
    expect(h.one('ProTermsSheet').props.visible).toBe(true);
  });

  it('asks for the 18+ confirmation in the terms when it is missing, and reloads when they are agreed', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }));
    const h = await render();
    expect(h.one('ProTermsSheet').props.needsAdult).toBe(true);
    mockStatus.mockClear();
    mockStatus.mockResolvedValue(status());
    await h.call(() => h.one('ProTermsSheet').props.onAccepted());
    expect(mockStatus).toHaveBeenCalled();
    expect(h.one('ProTermsSheet').props.visible).toBe(false);
    expect(h.has('Connect with a stylist')).toBe(true);
  });

  it('shows the notice and nothing else when the list is empty', async () => {
    mockList.mockResolvedValue([]);
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const h = await render();
    expect(h.one('ProAccessNotice').props.access.state).toBe('paused');
    expect(h.text()).not.toContain('No stylists yet');
    expect(h.has('Connect with a stylist')).toBe(false);
  });

  it('asks again what the person may do when the list says the feature has changed', async () => {
    mockStatus.mockResolvedValue(status());
    mockList.mockRejectedValue(new ProError('pro_disabled'));
    await render();
    expect(mockStatus.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('ProHomeScreen: wording and navigation', () => {
  it('renders no commerce wording and no price', async () => {
    mockList.mockResolvedValue([row('a', { attention: true, lastMessagePreview: 'Thanks!' }), ended('z')]);
    const { text } = await render();
    expect(text()).not.toMatch(/\b(book|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    expect(text()).not.toMatch(/\$\d/);
  });

  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProHomeScreen.tsx'), 'utf8');

  it('navigates only to ProConnection and SignIn', () => {
    const targets = new Set([...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]));
    expect([...targets].sort()).toEqual(['ProConnection', 'SignIn']);
    expect(source).not.toMatch(/\b(nav|screen):\s*'/);
  });

  it('never logs an error or stores anything, and has no text field', () => {
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/AsyncStorage/);
    expect(source).not.toMatch(/<(TextInput|Input)\b/);
  });
});
