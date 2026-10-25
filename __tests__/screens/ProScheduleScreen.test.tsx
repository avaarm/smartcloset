import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockSessions = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  listProSessions: (...a: any[]) => mockSessions(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
const marker = (name: string) => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement(name, props) };
};
jest.mock('../../src/components/ProAccessNotice', () => marker('ProAccessNotice'));
jest.mock('../../src/components/ProAppointmentRow', () => marker('ProAppointmentRow'));
jest.mock('../../src/components/ProAppointmentSheet', () => marker('ProAppointmentSheet'));
jest.mock('../../src/components/ProSafetySheet', () => marker('ProSafetySheet'));
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));

import ProScheduleScreen from '../../src/screens/ProScheduleScreen';
import { ProError } from '../../src/services/proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SAFETY_ELSEWHERE_NOTE, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../../src/config/proRules';
import type { ProAppointment, ProStatus } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}, termsCurrent = true): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: { termsCurrent, accepting: true, approved: true, invitesHeld: false, activeClients: 1, clientLimit: 25, liveInvites: 0, inviteLimit: 10 },
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const session = (id: string, over: Partial<ProAppointment> = {}): ProAppointment => ({
  id,
  connectionId: `conn-${id}`,
  otherLabel: `Client ${id}`,
  myRole: 'stylist',
  status: 'confirmed',
  proposedBy: 'client',
  startsAt: '2026-11-01T15:00:00Z',
  durationMinutes: 60,
  mode: 'virtual',
  place: '',
  note: '',
  utcOffsetMinutes: 0,
  canConfirm: false,
  canDecline: false,
  canCancel: true,
  createdAt: '2026-10-20T10:00:00Z',
  ...over,
});

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

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProScheduleScreen />);
  });
  mounted.push(tree);
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
  const has = (label: string) => byLabel(label).length > 0;
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const marked = (name: string) => tree.root.findAllByType(name as any);
  const pullToRefresh = async () => {
    await act(async () => {
      await tree.root.findAll(n => typeof n.props.onRefresh === 'function')[0].props.onRefresh();
    });
  };
  return { tree, text, byLabel, has, press, marked, pullToRefresh };
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockSessions.mockReset().mockResolvedValue([]);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ProScheduleScreen: the segments', () => {
  it('opens on Upcoming and reads the sessions across all clients', async () => {
    mockSessions.mockResolvedValue([session('a'), session('b')]);
    const { marked, text } = await mount();
    expect(mockSessions).toHaveBeenCalledWith({ scope: 'upcoming' });
    expect(text()).toContain('Schedule');
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['a', 'b']);
  });

  it('reads Needs response and Past when they are chosen, and shows only that segment\'s rows', async () => {
    mockSessions
      .mockResolvedValueOnce([session('up')])
      .mockResolvedValueOnce([session('need', { status: 'proposed' })])
      .mockResolvedValueOnce([session('old', { status: 'completed' })]);
    const { press, marked } = await mount();
    await press('Needs response');
    expect(mockSessions).toHaveBeenLastCalledWith({ scope: 'needs_me' });
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['need']);
    await press('Past');
    expect(mockSessions).toHaveBeenLastCalledWith({ scope: 'past' });
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['old']);
  });

  it('leaves out the sessions the person has as a client of another stylist', async () => {
    mockSessions.mockResolvedValue([session('mine'), session('theirs', { myRole: 'client', proposedBy: 'stylist' })]);
    const { marked } = await mount();
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['mine']);
  });

  it('marks the chosen segment', async () => {
    const { byLabel, press } = await mount();
    expect(byLabel('Upcoming')[0].props.accessibilityState).toEqual({ selected: true });
    await press('Past');
    expect(byLabel('Past')[0].props.accessibilityState).toEqual({ selected: true });
    expect(byLabel('Upcoming')[0].props.accessibilityState).toEqual({ selected: false });
  });

  it('does not show the old segment\'s rows while the new one loads', async () => {
    const slow = deferred<ProAppointment[]>();
    mockSessions.mockResolvedValueOnce([session('up')]).mockReturnValueOnce(slow.promise);
    const { press, marked, tree } = await mount();
    await press('Past');
    expect(marked('ProAppointmentRow')).toHaveLength(0);
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    await act(async () => {
      slow.resolve([session('old')]);
    });
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['old']);
  });

  it('drops an answer for a segment that is no longer chosen', async () => {
    const slow = deferred<ProAppointment[]>();
    mockSessions.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([session('old')]);
    const { press, marked } = await mount();
    await press('Past');
    await act(async () => {
      slow.resolve([session('late-upcoming')]);
    });
    expect(marked('ProAppointmentRow').map(r => r.props.appointment.id)).toEqual(['old']);
  });

  it.each([
    ['Upcoming', 'No upcoming sessions'],
    ['Needs response', 'Nothing is waiting for your answer'],
    ['Past', 'No past sessions yet'],
  ] as const)('says so when %s is empty', async (segment, words) => {
    const { press, text } = await mount();
    if (segment !== 'Upcoming') await press(segment);
    expect(text()).toContain(words);
  });
});

describe('ProScheduleScreen: a session', () => {
  it('opens in the sheet to be answered or cancelled', async () => {
    mockSessions.mockResolvedValue([session('a', { status: 'proposed', canConfirm: true, canDecline: true })]);
    const { marked } = await mount();
    expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
    await act(async () => {
      marked('ProAppointmentRow')[0].props.onPress();
    });
    expect(marked('ProAppointmentSheet')[0].props).toMatchObject({
      visible: true,
      mode: 'view',
      connectionId: 'conn-a',
      appointment: expect.objectContaining({ id: 'a' }),
    });
  });

  it('reads the list again, and closes the sheet, when a session was changed', async () => {
    mockSessions.mockResolvedValue([session('a')]);
    const { marked } = await mount();
    await act(async () => {
      marked('ProAppointmentRow')[0].props.onPress();
    });
    mockSessions.mockClear();
    await act(async () => {
      marked('ProAppointmentSheet')[0].props.onChanged();
    });
    expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
    expect(mockSessions).toHaveBeenCalledTimes(1);
  });

  it('leads to the client in the Clients tab and to the thread', async () => {
    mockSessions.mockResolvedValue([session('a', { otherLabel: 'Ana' })]);
    const { press } = await mount();
    await press('Open client Ana');
    expect(mockNavigate).toHaveBeenLastCalledWith('Clients', { screen: 'ProClientDetail', params: { connectionId: 'conn-a' } });
    await press('Message Ana');
    expect(mockNavigate).toHaveBeenLastCalledWith('ProThread', { connectionId: 'conn-a' });
  });

  it('closes the session sheet before the report sheet opens, never both at once', async () => {
    // act waits on setImmediate, so that one stays real.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    mockSessions.mockResolvedValue([session('a', { otherLabel: 'Ana' })]);
    const { marked } = await mount();
    await act(async () => {
      marked('ProAppointmentRow')[0].props.onPress();
    });
    await act(async () => {
      marked('ProAppointmentSheet')[0].props.onReport(session('a', { otherLabel: 'Ana' }));
    });
    expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
    expect(marked('ProSafetySheet')).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(marked('ProSafetySheet')[0].props).toMatchObject({
      visible: true,
      refType: 'appointment',
      refId: 'a',
      label: 'Ana',
      connectionId: 'conn-a',
    });
  });

  it('reads the list again once the person behind a session was blocked', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    mockSessions.mockResolvedValue([session('a')]);
    const { marked } = await mount();
    await act(async () => {
      marked('ProAppointmentSheet')[0].props.onReport(session('a'));
    });
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    mockSessions.mockClear();
    await act(async () => {
      marked('ProSafetySheet')[0].props.onBlocked();
    });
    expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
    expect(mockSessions).toHaveBeenCalledTimes(1);
  });
});

describe('ProScheduleScreen: when the list cannot be read', () => {
  it('replaces the screen with Try again when nothing was loaded, and reads again', async () => {
    mockSessions.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce([session('a')]);
    const { text, press, marked } = await mount();
    expect(text()).toContain('Couldn\'t load your sessions');
    await press('Try again to load your sessions');
    expect(marked('ProAppointmentRow')).toHaveLength(1);
  });

  it('keeps the rows under a banner when a refresh fails', async () => {
    mockSessions.mockResolvedValueOnce([session('a')]).mockRejectedValueOnce(new ProError('offline'));
    const { pullToRefresh, marked, text } = await mount();
    await pullToRefresh();
    expect(marked('ProAppointmentRow')).toHaveLength(1);
    expect(text()).toContain('Couldn\'t load your sessions');
  });

  it('asks the access state again when a read says what the person may do has changed', async () => {
    mockSessions.mockRejectedValue(new ProError('pro_disabled'));
    await mount();
    expect(mockStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProScheduleScreen: access', () => {
  it('shows a skeleton while access is read, and reads no sessions yet', async () => {
    mockStatus.mockReturnValue(new Promise(() => {}));
    const { tree } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(mockSessions).not.toHaveBeenCalled();
  });

  it.each([
    ['guest', () => mockStatus.mockRejectedValue(new ProError('not_authenticated'))],
    ['paused', () => mockStatus.mockResolvedValue(status({ proEnabled: false }))],
    ['suspended', () => mockStatus.mockResolvedValue(status({ suspended: true }))],
  ] as const)('shows only the notice, and reads nothing, for %s', async (state, arrange) => {
    arrange();
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe(state);
    expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
    expect(marked('ProAccessNotice')[0].props.safetyNote).toBe(PRO_SAFETY_ELSEWHERE_NOTE);   // this tab lists no connections, so the note points to the Clients tab
    expect(has('Past')).toBe(false);
    expect(mockSessions).not.toHaveBeenCalled();
    expect(marked('ProAppointmentSheet')).toHaveLength(0);
  });

  it('shows only the notice when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
    const { has } = await mount();
    expect(has('Past')).toBe(false);
    expect(mockSessions).not.toHaveBeenCalled();
  });

  it('offers the terms when they are not accepted, and reads the sessions once they are', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }, false));
    const { marked } = await mount();
    expect(mockSessions).not.toHaveBeenCalled();
    await act(async () => {
      marked('ProAccessNotice')[0].props.onReadTerms();
    });
    expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
    mockStatus.mockResolvedValue(status());
    await act(async () => {
      marked('ProTermsSheet')[0].props.onAccepted();
    });
    expect(mockSessions).toHaveBeenCalledTimes(1);
  });
});

describe('ProScheduleScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProScheduleScreen.tsx'), 'utf8');

  it('navigates only to the thread and, nested, to the client\'s page', () => {
    const targets = [...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]);
    expect([...new Set(targets)].sort()).toEqual(['Clients', 'ProThread']);
    expect(source).toMatch(/screen: 'ProClientDetail'/);
  });

  it('stores nothing and has no commerce wording', () => {
    expect(source).not.toMatch(/AsyncStorage|console\.error/);
    expect(source).not.toMatch(/\b(Book|Buy|Checkout|Deposit|Premium|Featured|Verified|Certified|Top rated)\b/);
  });
});
