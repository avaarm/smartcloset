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
// Other streams own these; here they are markers with the props they were given.
const marker = (name: string) => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement(name, props) };
};
jest.mock('../../src/components/ProAccessNotice', () => marker('ProAccessNotice'));
jest.mock('../../src/components/ProStylistProfileSheet', () => marker('ProStylistProfileSheet'));
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));
// This stream's own sheet is tested on its own.
jest.mock('../../src/components/ProInvitesSheet', () => marker('ProInvitesSheet'));

import ProClientsScreen from '../../src/screens/ProClientsScreen';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_BANNER,
  PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';
import type { ProConnectionSummary, ProStatus } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}, stylist: Partial<NonNullable<ProStatus['stylist']>> | null = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: stylist === null
    ? null
    : { termsCurrent: true, accepting: true, approved: true, invitesHeld: false, activeClients: 2, clientLimit: 25, liveInvites: 0, inviteLimit: 10, ...stylist },
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

/** A Button shows up as the component, the Pressable and the host view under it; keep the outermost of each chain. */
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
    tree = renderer.create(<ProClientsScreen />);
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

describe('ProClientsScreen: the list', () => {
  it('reads the stylist\'s connections and lists the clients by the name they chose', async () => {
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana' }), conn({ otherLabel: 'Bea', closetShared: true })]);
    const { text, has } = await mount();
    expect(mockConnections).toHaveBeenCalledWith('stylist');
    expect(text()).toContain('Clients');
    expect(has('Open Ana')).toBe(true);
    expect(has('Open Bea')).toBe(true);
    expect(text()).toContain('Closet shared');
  });

  it('opens a client on a tap', async () => {
    mockConnections.mockResolvedValue([conn({ id: 'conn-9', otherLabel: 'Ana' })]);
    const { press } = await mount();
    await press('Open Ana');
    expect(mockNavigate).toHaveBeenCalledWith('ProClientDetail', { connectionId: 'conn-9' });
  });

  it('puts a dot on a client with something new', async () => {
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana', attention: true }), conn({ otherLabel: 'Bea' })]);
    const { has } = await mount();
    expect(has('Open Ana, new activity')).toBe(true);
    expect(has('Open Bea')).toBe(true);
  });

  it('says there are no clients yet and offers the way to get one', async () => {
    const { text, press, marked } = await mount();
    expect(text()).toContain('No clients yet. Create an invite code and give it to your first client.');
    expect(marked('ProInvitesSheet')[0].props.visible).toBe(false);
    await press('Invite a client');
    expect(marked('ProInvitesSheet')[0].props.visible).toBe(true);
  });

  it('puts ended connections under Past, ten of them and then Show older', async () => {
    const ended = Array.from({ length: 12 }, (_, i) =>
      conn({ otherLabel: `Old ${i}`, status: 'ended', endedBy: 'client', endedAt: '2026-09-01T10:00:00Z' }));
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana' }), ...ended]);
    const { text, has, press } = await mount();
    expect(text()).toContain('Past');
    expect(has('Open Old 0')).toBe(true);
    expect(has('Open Old 9')).toBe(true);
    expect(has('Open Old 10')).toBe(false);
    await press('Show older');
    expect(has('Open Old 11')).toBe(true);
    expect(text()).not.toContain('Show older');
  });

  it('shows the neutral line on an ended connection, never why it ended', async () => {
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Former client', status: 'ended', endedBy: 'system' })]);
    const { text } = await mount();
    expect(text()).toContain('Former client');
    expect(text()).toContain('This connection has ended.');
    expect(text().toLowerCase()).not.toContain('block');
  });

  describe('when the list cannot be read', () => {
    it('replaces the screen with Try again when nothing was loaded, and reads again', async () => {
      mockConnections.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce([conn({ otherLabel: 'Ana' })]);
      const { text, press, has } = await mount();
      expect(text()).toContain('Couldn\'t load your clients');
      expect(text()).not.toContain('No clients');
      await press('Try again to load your clients');
      expect(has('Open Ana')).toBe(true);
    });

    it('keeps the list on screen under a banner when a refresh fails', async () => {
      mockConnections.mockResolvedValueOnce([conn({ otherLabel: 'Ana' })]).mockRejectedValueOnce(new ProError('offline'));
      const { tree, has, text } = await mount();
      const refreshControl = tree.root.findAll(n => typeof n.props.onRefresh === 'function')[0];
      await act(async () => {
        await refreshControl.props.onRefresh();
      });
      expect(has('Open Ana')).toBe(true);
      expect(text()).toContain('Couldn\'t load your clients');
    });

    it('drops an answer that arrives after a newer one', async () => {
      const slow = deferred<ProConnectionSummary[]>();
      mockConnections.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([conn({ otherLabel: 'Fresh' })]);
      const { tree, has } = await mount();
      const refreshControl = tree.root.findAll(n => typeof n.props.onRefresh === 'function')[0];
      await act(async () => {
        await refreshControl.props.onRefresh();
      });
      await act(async () => {
        slow.resolve([conn({ otherLabel: 'Stale' })]);
      });
      expect(has('Open Fresh')).toBe(true);
      expect(has('Open Stale')).toBe(false);
    });
  });
});

describe('ProClientsScreen: the stylist', () => {
  it('offers Invite and My profile, and opens the sheets', async () => {
    const { press, marked } = await mount();
    expect(marked('ProInvitesSheet')[0].props.visible).toBe(false);
    await press('Invite');
    expect(marked('ProInvitesSheet')[0].props.visible).toBe(true);
    await press('My profile');
    expect(marked('ProStylistProfileSheet')[0].props.visible).toBe(true);
  });

  it('closes the profile sheet and reads the role again once the profile is saved', async () => {
    const { press, marked } = await mount();
    await press('My profile');
    mockStatus.mockClear();
    await act(async () => {
      marked('ProStylistProfileSheet')[0].props.onSaved();
    });
    expect(marked('ProStylistProfileSheet')[0].props.visible).toBe(false);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('reads the role again when the invites sheet closes, so a held or full account shows', async () => {
    const { press, marked } = await mount();
    await press('Invite');
    mockStatus.mockClear();
    await act(async () => {
      marked('ProInvitesSheet')[0].props.onClose();
    });
    expect(marked('ProInvitesSheet')[0].props.visible).toBe(false);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('shows the probation line and the counts while the stylist is new', async () => {
    mockStatus.mockResolvedValue(status({}, { approved: false, activeClients: 1, clientLimit: 3, liveInvites: 1, inviteLimit: 1 }));
    const { text } = await mount();
    expect(text()).toContain(PRO_STYLIST_BANNER);
    expect(text()).toContain('1 of 3 clients, 1 of 1 live invite.');
  });

  it('shows no probation line once approved', async () => {
    const { text } = await mount();
    expect(text()).not.toContain(PRO_STYLIST_BANNER);
  });

  it('says in plain words when invites are paused', async () => {
    mockStatus.mockResolvedValue(status({}, { invitesHeld: true }));
    const { text } = await mount();
    expect(text()).toContain('Your invites are paused while we review your profile.');
  });
});

describe('ProClientsScreen: access', () => {
  it('shows a skeleton while access is read, and reads no connections yet', async () => {
    mockStatus.mockReturnValue(new Promise(() => {}));
    const { text, tree } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(text()).not.toContain('No clients');
    expect(mockConnections).not.toHaveBeenCalled();
  });

  it('shows only the notice for a guest, with no sign-in route and no reads', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe('guest');
    expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
    expect(marked('ProAccessNotice')[0].props.onSignIn).toBeUndefined();
    expect(has('Invite')).toBe(false);
    expect(mockConnections).not.toHaveBeenCalled();
  });

  it('shows only the notice when this server has no professional features', async () => {
    mockStatus.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' });
    const { marked } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe('not_deployed');
    expect(mockConnections).not.toHaveBeenCalled();
  });

  it.each([
    ['paused', status({ proEnabled: false })],
    ['suspended', status({ suspended: true })],
  ] as const)('keeps the clients listed when the feature is %s, so every one can still be opened and ended', async (state, st) => {
    mockStatus.mockResolvedValue(st);
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana' })]);
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe(state);
    expect(has('Open Ana')).toBe(true);
    expect(has('Invite')).toBe(false);
    expect(has('My profile')).toBe(false);
  });

  it('keeps the clients listed, without Invite, when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana' })]);
    const { has } = await mount();
    expect(has('Open Ana')).toBe(true);
    expect(has('Invite')).toBe(false);
    expect(has('My profile')).toBe(false);
  });

  it('opens the terms by itself when they are not accepted, and reads the role again once they are', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }, { termsCurrent: false }));
    mockConnections.mockResolvedValue([conn({ otherLabel: 'Ana' })]);
    const { marked, has } = await mount();
    const sheet = marked('ProTermsSheet')[0];
    expect(sheet.props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
    expect(has('Invite')).toBe(false);
    expect(has('Open Ana')).toBe(true);
    mockStatus.mockClear();
    await act(async () => {
      sheet.props.onAccepted();
    });
    expect(marked('ProTermsSheet')[0].props.visible).toBe(false);
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('can reopen the terms after they were dismissed', async () => {
    mockStatus.mockResolvedValue(status({}, { termsCurrent: false }));
    const { marked, tree } = await mount();
    await act(async () => {
      marked('ProTermsSheet')[0].props.onClose();
    });
    expect(marked('ProTermsSheet')[0].props.visible).toBe(false);
    const notice = marked('ProAccessNotice')[0];
    await act(async () => {
      notice.props.onReadTerms();
    });
    expect(tree.root.findAllByType('ProTermsSheet' as any)[0].props.visible).toBe(true);
  });

  it('asks for the profile when a stylist workspace has none', async () => {
    mockStatus.mockResolvedValue(status({}, null));
    const { text, press, marked } = await mount();
    expect(text()).toContain('Set up your stylist profile first.');
    await press('Set up profile');
    expect(marked('ProStylistProfileSheet')[0].props.visible).toBe(true);
  });

  it('asks the access state again when a read says what the person may do has changed', async () => {
    mockConnections.mockRejectedValue(new ProError('pro_disabled'));
    await mount();
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });
});

describe('ProClientsScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProClientsScreen.tsx'), 'utf8');

  it('navigates only to the client\'s page, and never to a sign-in route the stylist tab does not have', () => {
    const targets = [...source.matchAll(/\.navigate\(\s*'(\w+)'/g)].map(m => m[1]);
    expect(targets).toEqual(['ProClientDetail']);
  });

  it('stores nothing and has no commerce wording', () => {
    expect(source).not.toMatch(/AsyncStorage|console\.error/);
    expect(source).not.toMatch(/\b(Book|Buy|Checkout|Deposit|Premium|Featured|Verified|Certified|Top rated)\b/);
  });
});
