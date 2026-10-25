import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { FlatList, Pressable } from 'react-native';
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
const mockCloset = jest.fn();
const mockConnection = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getClientCloset: (...a: any[]) => mockCloset(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
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
jest.mock('../../src/components/ProPhoto', () => marker('ProPhoto'));
jest.mock('../../src/components/ProAccessNotice', () => marker('ProAccessNotice'));
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));
jest.mock('../../src/components/ProClosetItemSheet', () => marker('ProClosetItemSheet'));
jest.mock('../../src/components/ProSafetySheet', () => marker('ProSafetySheet'));

import ProClientClosetScreen from '../../src/screens/ProClientClosetScreen';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION, PRO_CLOSET_ASK_HINT, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION, proClosetNotSharedTitle,
} from '../../src/config/proRules';
import type { ProClosetItem, ProConnectionDetail, ProStatus } from '../../src/types/pro';

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

const detail = (over: Partial<ProConnectionDetail> = {}): ProConnectionDetail => ({
  id: 'conn-1',
  myRole: 'stylist',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Ana',
  myAlias: null,
  safetyOnly: false,
  stylist: null,
  closet: { shared: true, itemMode: 'all', itemCount: 4, expiresAt: '2027-01-15T10:00:00Z', expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 0, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: true, canEnd: true, canViewCloset: true,
    canShare: false, canStopSharing: false, canRename: false,
  },
  ...over,
});

const piece = (id: string, over: Partial<ProClosetItem> = {}): ProClosetItem => ({
  id,
  name: `Piece ${id}`,
  category: 'tops',
  hasPhoto: true,
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
    tree = renderer.create(<ProClientClosetScreen />);
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
  const tile = (label: string) => tree.root.findAll(n => n.type === Pressable && n.props.accessibilityLabel === label)[0];
  const marked = (name: string) => tree.root.findAllByType(name as any);
  const endReached = async () => {
    await act(async () => {
      tree.root.findByType(FlatList).props.onEndReached({ distanceFromEnd: 0 });
    });
  };
  const pullToRefresh = async () => {
    await act(async () => {
      await tree.root.findAll(n => typeof n.props.onRefresh === 'function')[0].props.onRefresh();
    });
  };
  return { tree, text, byLabel, has, press, tile, marked, endReached, pullToRefresh };
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockParams = { connectionId: 'conn-1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(detail());
  mockCloset.mockReset().mockResolvedValue({ items: [piece('a'), piece('b'), piece('c'), piece('d')], total: 4 });
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProClientClosetScreen: the closet', () => {
  it('reads the first page of 60 and shows the pieces, the count and when sharing ends', async () => {
    const { text, marked } = await mount();
    expect(mockCloset).toHaveBeenCalledWith('conn-1', { offset: 0, limit: 60 });
    expect(text()).toContain('Ana’s closet');
    expect(text()).toContain('4 pieces');
    expect(text()).toContain('Shared until');
    expect(text()).toContain('Piece a');
    expect(marked('ProPhoto').map(p => p.props.itemId)).toEqual(['a', 'b', 'c', 'd']);
    expect(marked('ProPhoto')[0].props.connectionId).toBe('conn-1');
  });

  it('says "1 piece" for one', async () => {
    mockCloset.mockResolvedValue({ items: [piece('a')], total: 1 });
    const { text } = await mount();
    expect(text()).toContain('1 piece');
    expect(text()).not.toContain('1 pieces');
  });

  it('opens a piece in the read-only sheet', async () => {
    const { tile, marked } = await mount();
    expect(marked('ProClosetItemSheet')[0].props.visible).toBe(false);
    await act(async () => {
      tile('Piece b').props.onPress();
    });
    expect(marked('ProClosetItemSheet')[0].props).toMatchObject({
      visible: true,
      connectionId: 'conn-1',
      item: expect.objectContaining({ id: 'b' }),
    });
    await act(async () => {
      marked('ProClosetItemSheet')[0].props.onClose();
    });
    expect(marked('ProClosetItemSheet')[0].props.visible).toBe(false);
  });

  it('still shows the closet, under a plain title, when the connection cannot be read', async () => {
    mockConnection.mockRejectedValue(new ProError('offline'));
    const { text } = await mount();
    expect(text()).toContain('Closet');
    expect(text()).not.toContain('’s closet');
    expect(text()).toContain('Piece a');
  });

  it('says there is nothing when the grant has no pieces', async () => {
    mockCloset.mockResolvedValue({ items: [], total: 0 });
    const { text } = await mount();
    expect(text()).toContain('No pieces are shared yet.');
  });

  it('goes back and nowhere else', async () => {
    const { press } = await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  describe('paging', () => {
    it('asks for the next page after the pieces it has and merges by id', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 4 })
        .mockResolvedValueOnce({ items: [piece('b'), piece('c'), piece('d')], total: 4 });
      const { endReached, marked } = await mount();
      await endReached();
      expect(mockCloset).toHaveBeenLastCalledWith('conn-1', { offset: 2, limit: 60 });
      expect(marked('ProPhoto').map(p => p.props.itemId)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('does not ask again once it has every piece', async () => {
      const { endReached } = await mount();
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(1);
    });

    it('stops asking when a page brings nothing new', async () => {
      mockCloset.mockResolvedValue({ items: [piece('a'), piece('b')], total: 9 });
      const { endReached } = await mount();
      await endReached();
      await endReached();
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(2);
    });

    it('says why a page failed and offers Try again without retrying by itself', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 4 })
        .mockRejectedValueOnce(new ProError('closet_page_limit'))
        .mockResolvedValueOnce({ items: [piece('c'), piece('d')], total: 4 });
      const { endReached, text, press, marked } = await mount();
      await endReached();
      expect(text()).toContain('You\'ve looked at a lot of pieces today. Try again tomorrow.');
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(2);
      await press('Try again');
      expect(marked('ProPhoto')).toHaveLength(4);
    });
  });

  describe('when sharing stops', () => {
    it('replaces the grid with the explanation, using the client\'s name', async () => {
      mockCloset.mockRejectedValue(new ProError('closet_not_shared'));
      const { text, marked, press } = await mount();
      expect(text()).toContain(proClosetNotSharedTitle('Ana'));
      expect(text()).toContain(PRO_CLOSET_ASK_HINT);
      expect(marked('ProPhoto')).toHaveLength(0);
      await press('Back');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('uses a plain line when the name is not known', async () => {
      mockCloset.mockRejectedValue(new ProError('closet_not_shared'));
      mockConnection.mockRejectedValue(new ProError('offline'));
      const { text } = await mount();
      expect(text()).toContain("They haven't shared their closet");
    });

    it('drops every piece on screen the moment a refresh says the grant is gone', async () => {
      const { pullToRefresh, text, marked } = await mount();
      expect(marked('ProPhoto')).toHaveLength(4);
      mockCloset.mockRejectedValue(new ProError('closet_not_shared'));
      await pullToRefresh();
      expect(marked('ProPhoto')).toHaveLength(0);
      expect(text()).not.toContain('Piece a');
      expect(text()).toContain("hasn't shared their closet");
    });

    it('says this is no longer available for a connection that has ended', async () => {
      mockCloset.mockRejectedValue(new ProError('pro_unavailable'));
      const { text } = await mount();
      expect(text()).toContain('This is no longer available.');
    });

    it('drops the pieces when a page says the grant is gone', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 4 })
        .mockRejectedValue(new ProError('closet_not_shared'));
      const { endReached, text, marked } = await mount();
      await endReached();
      expect(marked('ProPhoto')).toHaveLength(0);
      expect(text()).toContain("hasn't shared their closet");
    });
  });

  describe('when the closet cannot be read', () => {
    it('shows Try again for a failed first read, and reads again', async () => {
      mockCloset.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce({ items: [piece('a')], total: 1 });
      const { text, press } = await mount();
      expect(text()).toContain('Couldn’t load the closet');
      await press('Try again to load your closet');
      expect(text()).toContain('Piece a');
    });

    it('keeps the pieces under a banner when a pull to refresh fails', async () => {
      const { pullToRefresh, text, marked } = await mount();
      mockCloset.mockRejectedValueOnce(new ProError('offline'));
      await pullToRefresh();
      expect(marked('ProPhoto')).toHaveLength(4);
      expect(text()).toContain('Couldn’t refresh the closet');
    });

    it('drops an answer that arrives after a newer one', async () => {
      const slow = deferred<{ items: ProClosetItem[]; total: number }>();
      const { tree, marked } = await mount();
      const onRefresh = () => tree.root.findAll(n => typeof n.props.onRefresh === 'function')[0].props.onRefresh();
      mockCloset.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ items: [piece('fresh')], total: 1 });
      let first!: Promise<void>;
      await act(async () => {
        first = onRefresh();
      });
      await act(async () => {
        await onRefresh();
      });
      await act(async () => {
        slow.resolve({ items: [piece('stale')], total: 1 });
        await first;
      });
      expect(marked('ProPhoto').map(p => p.props.itemId)).toEqual(['fresh']);
    });
  });
});

describe('ProClientClosetScreen: access', () => {
  it('shows a skeleton while access is read, and reads no closet yet', async () => {
    mockStatus.mockReturnValue(new Promise(() => {}));
    const { tree } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(mockCloset).not.toHaveBeenCalled();
  });

  it.each([
    ['guest', () => mockStatus.mockRejectedValue(new ProError('not_authenticated'))],
    ['paused', () => mockStatus.mockResolvedValue(status({ proEnabled: false }))],
    ['suspended', () => mockStatus.mockResolvedValue(status({ suspended: true }))],
  ] as const)('shows only the notice, and reads nothing, for %s', async (state, arrange) => {
    arrange();
    const { marked } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe(state);
    expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
    expect(mockCloset).not.toHaveBeenCalled();
    expect(mockConnection).not.toHaveBeenCalled();
  });

  it('shows only the notice when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
    const { marked } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe('ready');
    expect(mockCloset).not.toHaveBeenCalled();
  });

  it('offers the terms when they are not accepted, and reads the closet once they are', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }, false));
    const { marked } = await mount();
    expect(mockCloset).not.toHaveBeenCalled();
    await act(async () => {
      marked('ProAccessNotice')[0].props.onReadTerms();
    });
    expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
    mockStatus.mockResolvedValue(status());
    await act(async () => {
      marked('ProTermsSheet')[0].props.onAccepted();
    });
    expect(mockCloset).toHaveBeenCalledTimes(1);
  });

  it('asks the access state again when a read says what the person may do has changed', async () => {
    mockCloset.mockRejectedValue(new ProError('pro_disabled'));
    await mount();
    expect(mockStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProClientClosetScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProClientClosetScreen.tsx'), 'utf8');

  it('navigates nowhere except back', () => {
    expect(source).not.toMatch(/\.navigate\(/);
  });

  it('stores nothing, saves nothing and shares nothing', () => {
    expect(source).not.toMatch(/AsyncStorage|console\.error|Share\b|Clipboard|CameraRoll|imageUrls|signStoragePaths/);
  });
});

describe('ProClientClosetScreen: the way out (Report or block)', () => {
  it('has Report or block in the header, named after the client, and it opens the safety sheet for the connection', async () => {
    const { press, marked, has } = await mount();
    expect(has('Report or block Ana')).toBe(true);
    expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
    await press('Report or block Ana');
    expect(marked('ProSafetySheet')[0].props).toMatchObject({
      visible: true, refType: 'connection', refId: 'conn-1', connectionId: 'conn-1', label: 'Ana',
    });
    await act(async () => {
      marked('ProSafetySheet')[0].props.onClose();
    });
    expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
  });

  it('leaves the screen after a block', async () => {
    const { press, marked } = await mount();
    await press('Report or block Ana');
    await act(async () => {
      marked('ProSafetySheet')[0].props.onBlocked();
    });
    expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('is there when the name is not known, and when the closet is not shared, and when features are paused', async () => {
    mockConnection.mockRejectedValue(new ProError('offline'));
    const first = await mount();
    expect(first.has('Report or block')).toBe(true);
    await first.press('Report or block');
    expect(first.marked('ProSafetySheet')[0].props.label).toBe('this client');

    mockConnection.mockResolvedValue(detail());
    mockCloset.mockRejectedValue(new ProError('closet_not_shared'));
    const second = await mount();
    expect(second.has('Report or block Ana')).toBe(true);

    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    const third = await mount();
    expect(third.has('Report or block')).toBe(true);                       // nothing is read while paused, so there is no name yet
  });

  it('offers Report or block on a piece: the piece sheet leaves first, then the safety sheet comes', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });   // so async act can still settle
    try {
      const { tile, marked } = await mount();
      await act(async () => {
        tile('Piece b').props.onPress();
      });
      expect(typeof marked('ProClosetItemSheet')[0].props.onReport).toBe('function');
      await act(async () => {
        marked('ProClosetItemSheet')[0].props.onReport();
      });
      expect(marked('ProClosetItemSheet')[0].props.visible).toBe(false);       // sheets are never nested
      expect(marked('ProSafetySheet')[0].props.visible).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(marked('ProSafetySheet')[0].props).toMatchObject({ visible: true, refType: 'connection', refId: 'conn-1', connectionId: 'conn-1' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not open the safety sheet after the screen has gone', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const { tile, marked, tree } = await mount();
      await act(async () => {
        tile('Piece b').props.onPress();
      });
      await act(async () => {
        marked('ProClosetItemSheet')[0].props.onReport();
      });
      act(() => {
        tree.unmount();
      });
      mounted.splice(mounted.indexOf(tree), 1);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
