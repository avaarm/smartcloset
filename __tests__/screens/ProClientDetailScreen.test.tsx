import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = { connectionId: 'conn-1' };
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
const mockLooks = jest.fn();
const mockSessions = jest.fn();
const mockEnd = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
  listProLooks: (...a: any[]) => mockLooks(...a),
  listProSessions: (...a: any[]) => mockSessions(...a),
  endProConnection: (...a: any[]) => mockEnd(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
// Other streams own these; here they are markers with the props they were given.
const marker = (name: string) => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement(name, props) };
};
jest.mock('../../src/components/ProAccessNotice', () => marker('ProAccessNotice'));
jest.mock('../../src/components/ProAppointmentRow', () => marker('ProAppointmentRow'));
jest.mock('../../src/components/ProAppointmentSheet', () => marker('ProAppointmentSheet'));
jest.mock('../../src/components/ProLookCard', () => marker('ProLookCard'));
jest.mock('../../src/components/ProSafetySheet', () => marker('ProSafetySheet'));
jest.mock('../../src/components/ProStatusBadge', () => marker('ProStatusBadge'));
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));

import ProClientDetailScreen from '../../src/screens/ProClientDetailScreen';
import { ProError } from '../../src/services/proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION, proClosetNotShared } from '../../src/config/proRules';
import type { ProAppointment, ProConnectionDetail, ProLookSummary, ProStatus } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: { termsCurrent: true, accepting: true, approved: true, invitesHeld: false, activeClients: 1, clientLimit: 25, liveInvites: 0, inviteLimit: 10 },
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

type DetailOver = Partial<Omit<ProConnectionDetail, 'actions' | 'closet'>> & {
  actions?: Partial<ProConnectionDetail['actions']>;
  closet?: Partial<ProConnectionDetail['closet']>;
};
const detail = ({ actions, closet, ...over }: DetailOver = {}): ProConnectionDetail => ({
  id: 'conn-1',
  myRole: 'stylist',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Ana',
  myAlias: null,
  safetyOnly: false,
  stylist: null,
  closet: { shared: true, itemMode: 'all', itemCount: 8, expiresAt: '2027-01-15T10:00:00Z', expiresSoon: false, lastViewedAt: null, views30d: 0, ...closet },
  counts: { looks: 2, upcoming: 1 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: true, canEnd: true, canViewCloset: true,
    canShare: false, canStopSharing: false, canRename: false, ...actions,
  },
  ...over,
});

const look = (id: string, over: Partial<ProLookSummary> = {}): ProLookSummary => ({
  id,
  status: 'sent',
  title: `Look ${id}`,
  itemCount: 2,
  updatedAt: `2026-10-0${id.length}T10:00:00Z`,
  isNew: false,
  ...over,
});

const session = (id: string, over: Partial<ProAppointment> = {}): ProAppointment => ({
  id,
  connectionId: 'conn-1',
  otherLabel: 'Ana',
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

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProClientDetailScreen />);
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
  return { tree, text, byLabel, has, press, marked };
};

const confirmAlert = async (buttonText: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const button = call[2].find((b: any) => b.text === buttonText);
  await act(async () => {
    await button.onPress();
  });
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockParams = { connectionId: 'conn-1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(detail());
  mockLooks.mockReset().mockResolvedValue([]);
  mockSessions.mockReset().mockResolvedValue([]);
  mockEnd.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

describe('ProClientDetailScreen: an open connection', () => {
  it('shows the name the client chose and reads the connection, the looks and the upcoming sessions', async () => {
    const { text } = await mount();
    expect(mockConnection).toHaveBeenCalledWith('conn-1');
    expect(mockLooks).toHaveBeenCalledWith('conn-1', { limit: 20 });
    expect(mockSessions).toHaveBeenCalledWith({ connectionId: 'conn-1', scope: 'upcoming' });
    expect(text()).toContain('Ana');
    expect(text()).toContain('Connected');
  });

  it('goes to the thread, the closet and the editor', async () => {
    const { press } = await mount();
    await press('Message');
    expect(mockNavigate).toHaveBeenLastCalledWith('ProThread', { connectionId: 'conn-1' });
    await press('Closet');
    expect(mockNavigate).toHaveBeenLastCalledWith('ProClientCloset', { connectionId: 'conn-1' });
    await press('New look');
    expect(mockNavigate).toHaveBeenLastCalledWith('ProLookEditor', { connectionId: 'conn-1' });
  });

  it('says the closet is shared, and until when', async () => {
    const { text } = await mount();
    expect(text()).toContain('Ana has shared their closet until');
  });

  it('disables Closet and says why when the client has not shared it', async () => {
    mockConnection.mockResolvedValue(detail({ actions: { canViewCloset: false }, closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null } }));
    const { text, byLabel } = await mount();
    expect(byLabel('Closet')[0].props.disabled).toBe(true);
    expect(text()).toContain(proClosetNotShared('Ana'));
  });

  it('leaves out New look and Propose a session when the server does not allow them', async () => {
    mockConnection.mockResolvedValue(detail({ actions: { canRecommend: false, canPropose: false } }));
    const { has } = await mount();
    expect(has('New look')).toBe(false);
    expect(has('Propose a session')).toBe(false);
  });

  describe('looks', () => {
    it('lists drafts first, then the rest in the server\'s order, as the stylist\'s own cards', async () => {
      mockLooks.mockResolvedValue([look('a', { status: 'sent' }), look('b', { status: 'draft' }), look('c', { status: 'viewed' })]);
      const { marked } = await mount();
      const cards = marked('ProLookCard');
      expect(cards.map(c => c.props.look.id)).toEqual(['b', 'a', 'c']);
      expect(cards.every(c => c.props.mine === true && c.props.connectionId === 'conn-1')).toBe(true);
    });

    it('opens a draft in the editor and a sent look in its own screen', async () => {
      mockLooks.mockResolvedValue([look('d', { status: 'draft' }), look('s', { status: 'sent' })]);
      const { marked } = await mount();
      await act(async () => {
        marked('ProLookCard')[0].props.onPress();
      });
      expect(mockNavigate).toHaveBeenLastCalledWith('ProLookEditor', { connectionId: 'conn-1', recId: 'd' });
      await act(async () => {
        marked('ProLookCard')[1].props.onPress();
      });
      expect(mockNavigate).toHaveBeenLastCalledWith('ProRecommendation', { recId: 's', connectionId: 'conn-1' });
    });

    it('says there are none yet', async () => {
      const { text } = await mount();
      expect(text()).toContain('No looks yet.');
    });

    it('pages older looks from the last look\'s time', async () => {
      const first = Array.from({ length: 20 }, (_, i) => look(`l${i}`, { updatedAt: `2026-10-${String(30 - i).padStart(2, '0')}T10:00:00Z` }));
      mockLooks.mockResolvedValueOnce(first).mockResolvedValueOnce([look('old', { updatedAt: '2026-09-01T10:00:00Z' })]);
      const { press, marked } = await mount();
      await press('Show older looks');
      expect(mockLooks).toHaveBeenLastCalledWith('conn-1', { before: '2026-10-11T10:00:00Z', limit: 20 });
      expect(marked('ProLookCard')).toHaveLength(21);
    });
  });

  describe('sessions', () => {
    it('lists the upcoming sessions and opens one in the sheet', async () => {
      mockSessions.mockResolvedValue([session('s1')]);
      const { marked } = await mount();
      expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
      await act(async () => {
        marked('ProAppointmentRow')[0].props.onPress();
      });
      expect(marked('ProAppointmentSheet')[0].props).toMatchObject({
        visible: true,
        mode: 'view',
        connectionId: 'conn-1',
        appointment: expect.objectContaining({ id: 's1' }),
      });
    });

    it('opens the sheet to propose a session', async () => {
      const { press, marked } = await mount();
      await press('Propose a session');
      expect(marked('ProAppointmentSheet')[0].props).toMatchObject({ visible: true, mode: 'propose', connectionId: 'conn-1' });
    });

    it('reads the sessions again, and closes the sheet, when something changed', async () => {
      const { press, marked } = await mount();
      await press('Propose a session');
      mockSessions.mockClear();
      await act(async () => {
        marked('ProAppointmentSheet')[0].props.onChanged();
      });
      expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
      expect(mockSessions).toHaveBeenCalledTimes(1);
    });

    it('closes the session sheet before the report sheet opens, never both at once', async () => {
      // act waits on setImmediate, so that one stays real.
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      mockSessions.mockResolvedValue([session('s1')]);
      const { marked } = await mount();
      await act(async () => {
        marked('ProAppointmentRow')[0].props.onPress();
      });
      await act(async () => {
        marked('ProAppointmentSheet')[0].props.onReport(session('s1'));
      });
      expect(marked('ProAppointmentSheet')[0].props.visible).toBe(false);
      expect(marked('ProSafetySheet')).toHaveLength(0);
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(marked('ProSafetySheet')[0].props).toMatchObject({
        visible: true,
        refType: 'appointment',
        refId: 's1',
        label: 'Ana',
        connectionId: 'conn-1',
      });
    });
  });

  describe('the menu', () => {
    it('opens the report sheet for the client, with block offered through the connection', async () => {
      const { press, marked } = await mount();
      await press('Client menu');
      await press('Report or block Ana');
      expect(marked('ProSafetySheet')[0].props).toMatchObject({
        visible: true,
        refType: 'connection',
        refId: 'conn-1',
        label: 'Ana',
        connectionId: 'conn-1',
      });
    });

    it('leaves the screen once the client is blocked', async () => {
      const { press, marked } = await mount();
      await press('Client menu');
      await press('Report or block Ana');
      await act(async () => {
        marked('ProSafetySheet')[0].props.onBlocked();
      });
      expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('asks before ending, then ends and reads the connection again', async () => {
      const { press, text } = await mount();
      await press('Client menu');
      await press('End connection');
      expect(Alert.alert).toHaveBeenCalledWith('End connection', expect.stringContaining('Ana'), expect.any(Array));
      expect(mockEnd).not.toHaveBeenCalled();
      mockConnection.mockResolvedValue(detail({ status: 'ended', endedBy: 'me', actions: { canEnd: false, canMessage: false, canPropose: false, canRecommend: false, canViewCloset: false } }));
      await confirmAlert('End connection');
      expect(mockEnd).toHaveBeenCalledWith('conn-1');
      expect(text()).toContain('You ended this connection.');
    });

    it('says why ending failed and stays', async () => {
      mockEnd.mockRejectedValue(new ProError('offline'));
      const { press } = await mount();
      await press('Client menu');
      await press('End connection');
      await confirmAlert('End connection');
      expect(Alert.alert).toHaveBeenLastCalledWith('Couldn’t end the connection', 'You seem to be offline. Please try again.');
    });

    it('does not offer End connection when the server does not allow it', async () => {
      mockConnection.mockResolvedValue(detail({ actions: { canEnd: false } }));
      const { press, has } = await mount();
      await press('Client menu');
      expect(has('Report or block Ana')).toBe(true);
      expect(has('End connection')).toBe(false);
    });
  });
});

describe('ProClientDetailScreen: an ended connection', () => {
  const ended = (over: DetailOver = {}) => detail({
    status: 'ended',
    endedBy: 'them',
    endedAt: '2026-10-22T10:00:00Z',
    closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null },
    actions: { canMessage: false, canPropose: false, canRecommend: false, canEnd: false, canViewCloset: false },
    ...over,
  });

  it('reads the neutral line, offers the history only, and reads the past sessions', async () => {
    mockConnection.mockResolvedValue(ended());
    mockLooks.mockResolvedValue([look('s', { status: 'sent' })]);
    const { text, has, marked } = await mount();
    expect(text()).toContain('This connection has ended.');
    expect(mockSessions).toHaveBeenCalledWith({ connectionId: 'conn-1', scope: 'past' });
    expect(has('Message')).toBe(true);
    expect(has('Closet')).toBe(false);
    expect(has('New look')).toBe(false);
    expect(has('Propose a session')).toBe(false);
    expect(marked('ProLookCard')).toHaveLength(1);
    expect(text()).toContain('Past sessions');
  });

  it('tells the stylist who ended it that they did', async () => {
    mockConnection.mockResolvedValue(ended({ endedBy: 'me' }));
    const { text } = await mount();
    expect(text()).toContain('You ended this connection.');
  });

  it('does not open a draft on a connection that has ended', async () => {
    mockConnection.mockResolvedValue(ended());
    mockLooks.mockResolvedValue([look('d', { status: 'draft' })]);
    const { marked } = await mount();
    await act(async () => {
      marked('ProLookCard')[0].props.onPress();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a closed shell as a former client with nothing in it, and never says why', async () => {
    mockConnection.mockResolvedValue(ended({ otherLabel: 'Former client', counts: { looks: 0, upcoming: 0 } }));
    const { text, marked } = await mount();
    expect(text()).toContain('Former client');
    expect(marked('ProLookCard')).toHaveLength(0);
    expect(text().toLowerCase()).not.toContain('block');
  });
});

describe('ProClientDetailScreen: only the ways out', () => {
  it('shows no looks, sessions or buttons when the server says safety only, and keeps the menu', async () => {
    mockConnection.mockResolvedValue(detail({ safetyOnly: true, actions: { canMessage: false, canPropose: false, canRecommend: false, canViewCloset: false } }));
    const { has, press, marked } = await mount();
    expect(mockLooks).not.toHaveBeenCalled();
    expect(mockSessions).not.toHaveBeenCalled();
    expect(has('Message')).toBe(false);
    expect(has('New look')).toBe(false);
    expect(marked('ProLookCard')).toHaveLength(0);
    await press('Client menu');
    expect(has('Report or block Ana')).toBe(true);
    expect(has('End connection')).toBe(true);
  });

  it('shows the notice and still reads the connection when the feature is paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockConnection.mockResolvedValue(detail({ safetyOnly: true }));
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe('paused');
    expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
    expect(mockConnection).toHaveBeenCalled();
    expect(has('Client menu')).toBe(true);
  });

  it('treats a stylist whose terms are out of date as safety only, even if the server did not say so', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
    const { has } = await mount();
    expect(has('Message')).toBe(false);
    expect(has('New look')).toBe(false);
  });

  it('opens the terms from the notice when they are not accepted', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }));
    mockStatus.mockResolvedValue(status({ adultConfirmed: false, stylist: { termsCurrent: false, accepting: true, approved: true, invitesHeld: false, activeClients: 1, clientLimit: 25, liveInvites: 0, inviteLimit: 10 } }));
    const { marked } = await mount();
    expect(marked('ProTermsSheet')[0].props.visible).toBe(false);
    await act(async () => {
      marked('ProAccessNotice')[0].props.onReadTerms();
    });
    expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
  });

  it('reads nothing for a guest', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { marked } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe('guest');
    expect(mockConnection).not.toHaveBeenCalled();
  });
});

describe('ProClientDetailScreen: when it cannot be read', () => {
  it('says this is no longer available, with Back, for a connection that is gone', async () => {
    mockConnection.mockRejectedValue(new ProError('pro_unavailable'));
    const { text, press } = await mount();
    expect(text()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('does not show a connection the person has as a client: that page is read from Home', async () => {
    mockConnection.mockResolvedValue(detail({ myRole: 'client' }));
    const { text, has } = await mount();
    expect(text()).toContain('This is no longer available.');
    expect(has('Message')).toBe(false);
    expect(mockLooks).not.toHaveBeenCalled();
  });

  it('shows Try again when the first read fails, and reads again', async () => {
    mockConnection.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce(detail());
    const { text, press } = await mount();
    expect(text()).toContain('Couldn’t load this client');
    await press('Try again to load your client');
    expect(text()).toContain('Connected');
  });

  it('keeps what was on screen under a banner when a re-read fails, and reads again from the banner', async () => {
    mockLooks.mockResolvedValue([look('a')]);
    const { press, text, marked } = await mount();
    // Ending a connection reads it again; here that read fails.
    await press('Client menu');
    await press('End connection');
    mockConnection.mockRejectedValueOnce(new ProError('offline'));
    await confirmAlert('End connection');
    expect(mockEnd).toHaveBeenCalledWith('conn-1');
    expect(text()).toContain('Couldn’t refresh this client');
    expect(text()).toContain('Ana');
    expect(marked('ProLookCard')).toHaveLength(1);
    await press('Try again to load your client');
    expect(text()).not.toContain('Couldn’t refresh this client');
  });

  it('asks the access state again when a read says what the person may do has changed', async () => {
    mockConnection.mockRejectedValue(new ProError('pro_suspended'));
    await mount();
    expect(mockStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProClientDetailScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProClientDetailScreen.tsx'), 'utf8');

  it('navigates only within the Clients stack', () => {
    const targets = new Set([...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]));
    expect([...targets].sort()).toEqual(['ProClientCloset', 'ProLookEditor', 'ProRecommendation', 'ProThread']);
  });

  it('stores nothing and has no commerce wording', () => {
    expect(source).not.toMatch(/AsyncStorage|console\.error/);
    expect(source).not.toMatch(/\b(Book|Buy|Checkout|Deposit|Premium|Featured|Verified|Certified|Top rated)\b/);
  });
});
