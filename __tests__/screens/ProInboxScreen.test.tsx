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
const mockConnections = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  listProConnections: (...a: any[]) => mockConnections(...a),
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
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));

import ProInboxScreen from '../../src/screens/ProInboxScreen';
import { ProError } from '../../src/services/proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SAFETY_ELSEWHERE_NOTE, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../../src/config/proRules';
import type { ProConnectionSummary, ProStatus } from '../../src/types/pro';

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

let counter = 0;
const conn = (over: Partial<ProConnectionSummary> = {}): ProConnectionSummary => {
  counter++;
  return {
    id: `c${counter}`,
    myRole: 'stylist',
    otherLabel: `Client ${counter}`,
    status: 'active',
    startedAt: '2026-10-01T10:00:00Z',
    lastActivityAt: '2026-10-20T10:00:00Z',
    unread: 0,
    attention: false,
    pendingAppointments: 0,
    closetShared: false,
    ...over,
  };
};

const outermost = (nodes: ReactTestInstance[]) =>
  nodes.filter(n => {
    for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
    return true;
  });

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProInboxScreen />);
  });
  mounted.push(tree);
  const text = () => flatten(tree.toJSON());
  const rows = () =>
    outermost(tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Open messages with') && typeof n.props.onPress === 'function'))
      .map(n => n.props.accessibilityLabel as string);
  const press = async (label: string) => {
    const nodes = outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
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
  return { tree, text, rows, press, marked, pullToRefresh };
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  counter = 0;
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnections.mockReset().mockResolvedValue([]);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProInboxScreen', () => {
  it('lists only the clients with messages, the newest message first', async () => {
    mockConnections.mockResolvedValue([
      conn({ otherLabel: 'Quiet' }),
      conn({ otherLabel: 'Old', lastMessagePreview: 'Hi', lastMessageAt: '2026-10-10T10:00:00Z' }),
      conn({ otherLabel: 'New', lastMessagePreview: 'Hello', lastMessageAt: '2026-10-22T10:00:00Z' }),
      conn({ otherLabel: 'Mid', lastMessagePreview: 'Hey', lastMessageAt: '2026-10-15T10:00:00Z' }),
    ]);
    const { rows, text } = await mount();
    expect(mockConnections).toHaveBeenCalledWith('stylist');
    expect(rows()).toEqual(['Open messages with New', 'Open messages with Mid', 'Open messages with Old']);
    expect(text()).toContain('Hello');
    expect(text()).not.toContain('Quiet');
  });

  it('marks the conversations with unread messages', async () => {
    mockConnections.mockResolvedValue([
      conn({ otherLabel: 'Ana', unread: 2, lastMessagePreview: 'Hi', lastMessageAt: '2026-10-22T10:00:00Z' }),
      conn({ otherLabel: 'Bea', unread: 0, lastMessagePreview: 'Hi', lastMessageAt: '2026-10-21T10:00:00Z' }),
    ]);
    const { rows } = await mount();
    expect(rows()).toEqual(['Open messages with Ana, unread', 'Open messages with Bea']);
  });

  it('opens the thread on a tap', async () => {
    mockConnections.mockResolvedValue([conn({ id: 'conn-9', otherLabel: 'Ana', lastMessagePreview: 'Hi', lastMessageAt: '2026-10-22T10:00:00Z' })]);
    const { press } = await mount();
    await press('Open messages with Ana');
    expect(mockNavigate).toHaveBeenCalledWith('ProThread', { connectionId: 'conn-9' });
  });

  it('keeps an ended conversation in the list while its messages last', async () => {
    mockConnections.mockResolvedValue([
      conn({ otherLabel: 'Former client', status: 'ended', endedBy: 'system', lastMessagePreview: 'Bye', lastMessageAt: '2026-10-22T10:00:00Z' }),
    ]);
    const { rows, text } = await mount();
    expect(rows()).toEqual(['Open messages with Former client']);
    expect(text()).toContain('This connection has ended.');
  });

  it('says there are no messages yet, and that nothing is delivered until the app is open', async () => {
    const { text } = await mount();
    expect(text()).toContain('No messages yet');
    mockConnections.mockResolvedValue([conn({ lastMessagePreview: 'Hi', lastMessageAt: '2026-10-22T10:00:00Z' })]);
    const again = await mount();
    expect(again.text()).toContain('next time you open SmartCloset');
  });

  describe('when the list cannot be read', () => {
    it('replaces the screen with Try again when nothing was loaded, and reads again', async () => {
      mockConnections
        .mockRejectedValueOnce(new ProError('offline'))
        .mockResolvedValueOnce([conn({ otherLabel: 'Ana', lastMessagePreview: 'Hi', lastMessageAt: '2026-10-22T10:00:00Z' })]);
      const { text, press, rows } = await mount();
      expect(text()).toContain('Couldn\'t load your messages');
      expect(text()).not.toContain('No messages yet');
      await press('Try again to load your messages');
      expect(rows()).toEqual(['Open messages with Ana']);
    });

    it('keeps the conversations under a banner when a refresh fails', async () => {
      mockConnections
        .mockResolvedValueOnce([conn({ otherLabel: 'Ana', lastMessagePreview: 'Hi', lastMessageAt: '2026-10-22T10:00:00Z' })])
        .mockRejectedValueOnce(new ProError('offline'));
      const { pullToRefresh, rows, text } = await mount();
      await pullToRefresh();
      expect(rows()).toEqual(['Open messages with Ana']);
      expect(text()).toContain('Couldn\'t load your messages');
    });

    it('asks the access state again when a read says what the person may do has changed', async () => {
      mockConnections.mockRejectedValue(new ProError('pro_suspended'));
      await mount();
      expect(mockStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('access', () => {
    it('shows a skeleton while access is read, and reads nothing yet', async () => {
      mockStatus.mockReturnValue(new Promise(() => {}));
      const { tree } = await mount();
      expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
      expect(mockConnections).not.toHaveBeenCalled();
    });

    it.each([
      ['guest', () => mockStatus.mockRejectedValue(new ProError('not_authenticated'))],
      ['paused', () => mockStatus.mockResolvedValue(status({ proEnabled: false }))],
      ['suspended', () => mockStatus.mockResolvedValue(status({ suspended: true }))],
    ] as const)('shows only the notice, and reads nothing, for %s', async (state, arrange) => {
      arrange();
      const { marked, text } = await mount();
      expect(marked('ProAccessNotice')[0].props.access.state).toBe(state);
      expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
      expect(marked('ProAccessNotice')[0].props.safetyNote).toBe(PRO_SAFETY_ELSEWHERE_NOTE);   // this tab lists no connections, so the note points to the Clients tab
      expect(text()).not.toContain('No messages yet');
      expect(mockConnections).not.toHaveBeenCalled();
    });

    it('shows only the notice when this build is older than the server', async () => {
      mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
      await mount();
      expect(mockConnections).not.toHaveBeenCalled();
    });

    it('offers the terms when they are not accepted, and reads the conversations once they are', async () => {
      mockStatus.mockResolvedValue(status({ adultConfirmed: false }, false));
      const { marked } = await mount();
      expect(mockConnections).not.toHaveBeenCalled();
      await act(async () => {
        marked('ProAccessNotice')[0].props.onReadTerms();
      });
      expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
      mockStatus.mockResolvedValue(status());
      await act(async () => {
        marked('ProTermsSheet')[0].props.onAccepted();
      });
      expect(mockConnections).toHaveBeenCalledTimes(1);
    });
  });

  describe('the source', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProInboxScreen.tsx'), 'utf8');

    it('navigates only to the thread', () => {
      const targets = [...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]);
      expect(targets).toEqual(['ProThread']);
    });

    it('stores nothing and has no commerce wording', () => {
      expect(source).not.toMatch(/AsyncStorage|console\.error/);
      expect(source).not.toMatch(/\b(Book|Buy|Checkout|Deposit|Premium|Featured|Verified|Certified|Top rated)\b/);
    });
  });
});
