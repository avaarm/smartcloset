import 'react-native';
import React from 'react';
import { Alert, Linking, RefreshControl } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = {};
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockSettings = jest.fn();
const mockList = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  listMySwaps: (...a: any[]) => mockList(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
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
// SW4 owns this file; here it is only a marker with its props.
jest.mock(
  '../../src/components/MyPiecesList',
  () => {
    const R = require('react');
    return { __esModule: true, default: (props: any) => R.createElement('MyPiecesList', props) };
  },
);
jest.mock('../../src/components/SwapBlockedSheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('SwapBlockedSheet', props) };
});
jest.mock('../../src/components/SwapGuidelinesSheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('SwapGuidelinesSheet', props) };
});

import MySwapsScreen from '../../src/screens/MySwapsScreen';
import { SwapError } from '../../src/services/swapErrors';
import {
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS_VERSION,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/swapRules';
import { SUPPORT_MAILTO } from '../../src/config/legal';
import type { SwapSummary } from '../../src/types/swap';

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

let counter = 0;
const swap = (over: Partial<SwapSummary> = {}): SwapSummary => {
  counter++;
  return {
    id: `s${counter}`,
    status: 'accepted',
    role: 'proposer',
    pairKind: 'friends',
    otherLabel: 'Bea',
    bucket: 'in_progress',
    attention: false,
    giveNames: ['Blue blazer'],
    getNames: ['Linen shirt'],
    thumbPath: `t${counter}.jpg`,
    iDone: false,
    theyDone: false,
    createdAt: '2026-10-01T10:00:00Z',
    lastEventAt: '2026-10-02T10:00:00Z',
    expiresAt: '2026-10-31T10:00:00Z',
    ...over,
  };
};

/** Pressable shows up as two instances (memo and forwardRef) and Button wraps one; keep the outermost of each chain. */
const outermost = (nodes: ReactTestInstance[]) =>
  nodes.filter(n => {
    for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
    return true;
  });

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<MySwapsScreen />);
  });
  mounted.push(tree);
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const rows = () =>
    outermost(
      tree.root.findAll(
        n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Open swap with') && typeof n.props.onPress === 'function',
      ),
    );
  return { tree, text, press, byLabel, rows };
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  counter = 0;
  mockParams = {};
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockSettings.mockReset().mockResolvedValue(settings());
  mockList.mockReset().mockResolvedValue([]);
  mockAccept.mockReset().mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('MySwapsScreen: the inbox', () => {
  it('groups swaps in the order Needs you, Finishing touches, In progress, Waiting on them, Past swaps', async () => {
    mockList.mockResolvedValue([
      swap({ bucket: 'past', status: 'completed' }),
      swap({ bucket: 'waiting', status: 'proposed' }),
      swap({ bucket: 'in_progress' }),
      swap({ bucket: 'finishing', status: 'completed', iDone: true }),
      swap({ bucket: 'needs_you', status: 'proposed', role: 'recipient' }),
    ]);
    const { text } = await mount();
    const order = ['Needs you', 'Finishing touches', 'In progress', 'Waiting on them', 'Past swaps'].map(t => text().indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('leaves out a section with nothing in it', async () => {
    mockList.mockResolvedValue([swap({ bucket: 'in_progress' })]);
    const { text } = await mount();
    expect(text()).toContain('In progress');
    expect(text()).not.toContain('Needs you');
    expect(text()).not.toContain('Past swaps');
  });

  it('shows each row with the swap title, the other member, a status and a thumbnail', async () => {
    mockList.mockResolvedValue([
      swap({ giveNames: ['Blue blazer'], getNames: ['Linen shirt', 'Hat'], otherLabel: 'Velvet Otter', thumbPath: 'thumb.jpg', status: 'proposed', role: 'recipient', bucket: 'needs_you' }),
    ]);
    const { text, tree } = await mount();
    expect(text()).toContain('Blue blazer for Linen shirt and 1 more');
    expect(text()).toContain('Velvet Otter');
    expect(text()).toContain('Waiting for your answer');
    expect(tree.root.findAllByType('SwapPhoto' as any)[0].props.path).toBe('thumb.jpg');
  });

  it('puts a dot on a swap with something new, and only on that one', async () => {
    mockList.mockResolvedValue([swap({ attention: true, otherLabel: 'Bea' }), swap({ attention: false, otherLabel: 'Cy' })]);
    const { tree, rows } = await mount();
    expect(tree.root.findAll(n => n.props.testID === 'swap-attention-dot' && typeof n.type === 'string')).toHaveLength(1);
    const labels = rows().map(r => r.props.accessibilityLabel as string);
    expect(labels.some(l => l.includes('Bea') && l.endsWith('new activity'))).toBe(true);
    expect(labels.some(l => l.includes('Cy') && !l.includes('new activity'))).toBe(true);
  });

  it('shows ten past swaps and the rest after "Show older"', async () => {
    mockList.mockResolvedValue(Array.from({ length: 13 }, (_, i) => swap({ bucket: 'past', status: 'completed', otherLabel: `Member ${i + 1}` })));
    const { rows, press, text, byLabel } = await mount();
    expect(rows()).toHaveLength(10);
    expect(text()).toContain('Show older');
    expect(text()).not.toContain('Member 11');
    await press('Show older');
    expect(rows()).toHaveLength(13);
    expect(text()).toContain('Member 13');
    expect(byLabel('Show older')).toHaveLength(0);
  });

  it('does not offer "Show older" for ten or fewer', async () => {
    mockList.mockResolvedValue(Array.from({ length: 10 }, () => swap({ bucket: 'past', status: 'completed' })));
    const { text } = await mount();
    expect(text()).not.toContain('Show older');
  });

  it('calls a swap with a blocked member what it is: a neutral past row with no photo', async () => {
    mockList.mockResolvedValue([
      swap({ bucket: 'past', status: 'cancelled', closedReason: 'unavailable', otherLabel: 'Swap member', thumbPath: undefined }),
    ]);
    const { text, tree } = await mount();
    expect(text()).toContain('Swap member');
    expect(text()).toContain('No longer available');
    expect(tree.root.findAllByType('SwapPhoto' as any)[0].props.path).toBeUndefined();
    expect(text().toLowerCase()).not.toContain('block');
  });

  it('marks a row that needs finishing', async () => {
    mockList.mockResolvedValue([swap({ bucket: 'finishing', status: 'completed', iDone: true })]);
    const { text } = await mount();
    expect(text()).toContain('Finishing touches');
    expect(text()).toContain('Tap to finish up');
  });

  it('opens the thread when a row is tapped', async () => {
    mockList.mockResolvedValue([swap({ id: 'abc', otherLabel: 'Bea' })]);
    const { rows } = await mount();
    await act(async () => {
      rows()[0].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('SwapThread', { swapId: 'abc' });
  });

  it('says there is no push: updates arrive next time the app opens', async () => {
    mockList.mockResolvedValue([swap()]);
    const { text } = await mount();
    expect(text()).toContain('You’ll see updates next time you open SmartCloset.');
  });

  it('shows the empty state with a way to the swap board', async () => {
    const { text, press } = await mount();
    expect(text()).toContain('No swaps yet');
    await press('Browse the swap board');
    expect(mockNavigate).toHaveBeenCalledWith('SwapBoard');
  });

  it('shows a skeleton while the list loads, not the empty state', async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { text, tree } = await mount();
    expect(text()).not.toContain('No swaps yet');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading swaps').length).toBeGreaterThan(0);
  });

  it('shows "Couldn’t load your swaps" with Try again when nothing is on screen, and recovers', async () => {
    mockList.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press } = await mount();
    expect(text()).toContain('Couldn\'t load your swaps');
    expect(text()).not.toContain('No swaps yet');
    mockList.mockResolvedValueOnce([swap({ otherLabel: 'Bea' })]);
    await press('Try again to load your swaps');
    expect(text()).toContain('Bea');
    expect(text()).not.toContain('Couldn\'t load your swaps');
  });

  it('keeps the list and shows a banner when a refresh fails', async () => {
    mockList.mockResolvedValueOnce([swap({ otherLabel: 'Bea' })]);
    const { text, tree } = await mount();
    // Offline, the settings call fails too; that must not replace the list with a full-screen error.
    mockSettings.mockRejectedValue({ message: 'Network request failed' });
    mockList.mockRejectedValueOnce({ message: 'Network request failed' });
    const refresh = tree.root.findByType(RefreshControl);
    await act(async () => {
      await refresh.props.onRefresh();
    });
    expect(text()).toContain('Bea');
    expect(text()).toContain('Couldn\'t load your swaps');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('reloads on pull to refresh', async () => {
    mockList.mockResolvedValue([swap({ otherLabel: 'Bea' })]);
    const { tree, text } = await mount();
    mockList.mockResolvedValue([swap({ otherLabel: 'Bea' }), swap({ otherLabel: 'Cy' })]);
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(text()).toContain('Cy');
  });

  it('goes back from the header', async () => {
    const { press } = await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('MySwapsScreen: My pieces', () => {
  it('starts on Swaps and switches to the member’s pieces', async () => {
    const { tree, press } = await mount();
    expect(tree.root.findAllByType('MyPiecesList' as any)).toHaveLength(0);
    await press('My pieces');
    expect(tree.root.findAllByType('MyPiecesList' as any)).toHaveLength(1);
    await press('Swaps');
    expect(tree.root.findAllByType('MyPiecesList' as any)).toHaveLength(0);
  });

  it('opens on the pieces segment when asked to', async () => {
    mockParams = { segment: 'pieces' };
    const { tree } = await mount();
    expect(tree.root.findAllByType('MyPiecesList' as any)).toHaveLength(1);
  });

  it('reloads the swaps when the pieces change (withdrawing a piece ends offers for it)', async () => {
    mockParams = { segment: 'pieces' };
    const { tree } = await mount();
    const before = mockList.mock.calls.length;
    await act(async () => {
      tree.root.findByType('MyPiecesList' as any).props.onChanged();
    });
    expect(mockList.mock.calls.length).toBe(before + 1);
  });
});

describe('MySwapsScreen: who can use it', () => {
  it('asks a guest to sign in and reads nothing', async () => {
    mockSettings.mockRejectedValue(new SwapError('not_authenticated'));
    const { text, press } = await mount();
    expect(text()).toContain('Sign in to swap');
    await press('Sign in');
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('says swaps are paused when the server switch is off', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    const { text } = await mount();
    expect(text()).toContain('Swaps are paused');
    expect(text()).toContain(SWAP_PAUSED_MESSAGE);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('says swaps are not available yet on a server without the functions', async () => {
    mockSettings.mockRejectedValue({ message: 'x', code: 'PGRST202' });
    const { text } = await mount();
    expect(text()).toContain('Swaps aren’t available yet');
    expect(text()).toContain(SWAP_NOT_DEPLOYED_MESSAGE);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('asks for an update when the server’s terms are newer than this build’s, and records nothing', async () => {
    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2099-01', termsCurrent: false }));
    const { text, tree } = await mount();
    expect(text()).toContain(SWAP_UPDATE_REQUIRED_MESSAGE);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
    expect(text()).not.toContain('I agree');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Swap menu')).toHaveLength(0);
  });

  it('says swaps are being updated when this build is ahead of the server', async () => {
    mockSettings.mockResolvedValue(settings({ currentTermsVersion: '2000-01', termsCurrent: false }));
    const { text } = await mount();
    expect(text()).toContain(SWAP_SERVER_BEHIND_MESSAGE);
    expect(text()).not.toContain('I agree');
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('opens the terms by itself when they are not accepted, and reloads after "I agree"', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false }));
    const { text, press } = await mount();
    expect(text()).toContain('Read the swap terms to get started');
    expect(text()).toContain('I agree');
    expect(mockList).not.toHaveBeenCalled();

    mockSettings.mockResolvedValue(settings());
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalled();
    expect(text()).not.toContain('Read the swap terms to get started');
  });

  it('lets the member close the terms and open them again', async () => {
    mockSettings.mockResolvedValue(settings({ termsCurrent: false, termsAccepted: false }));
    const { text, press } = await mount();
    await press('Not now');
    expect(text()).not.toContain('I agree');
    await press('Read the swap terms');
    expect(text()).toContain('I agree');
  });

  it('keeps history readable for a suspended member', async () => {
    mockSettings.mockResolvedValue(settings({ suspended: true }));
    mockList.mockResolvedValue([swap({ bucket: 'past', status: 'cancelled', closedReason: 'unavailable', otherLabel: 'Swap member' })]);
    const { text } = await mount();
    expect(text()).toContain('Swapping is paused on your account');
    expect(text()).toContain('Email support');
    expect(text()).toContain('Swap member');
  });

  it('shows the load error when the access check itself fails', async () => {
    mockSettings.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press } = await mount();
    expect(text()).toContain('Couldn\'t load your swaps');
    mockSettings.mockResolvedValue(settings());
    await press('Try again to load your swaps');
    expect(text()).toContain('No swaps yet');
  });

  it('shows a skeleton while access is being checked', async () => {
    mockSettings.mockReturnValue(new Promise(() => {}));
    const { text, tree } = await mount();
    expect(text()).not.toContain('Sign in to swap');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading swaps').length).toBeGreaterThan(0);
  });

  it('follows the server when a read says swaps went away after the access check passed', async () => {
    mockList.mockRejectedValueOnce(new SwapError('swaps_disabled'));
    mockSettings.mockResolvedValueOnce(settings());
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    const { text } = await mount();
    expect(text()).toContain('Swaps are paused');
  });
});

describe('MySwapsScreen: the menu', () => {
  it('opens the guidelines and the blocked members one at a time', async () => {
    const { tree, press } = await mount();
    expect(tree.root.findByType('SwapGuidelinesSheet' as any).props.visible).toBe(false);
    await press('Swap menu');
    await press('Swap guidelines');
    expect(tree.root.findByType('SwapGuidelinesSheet' as any).props.visible).toBe(true);
    expect(tree.root.findByType('SwapBlockedSheet' as any).props.visible).toBe(false);

    await act(async () => {
      tree.root.findByType('SwapGuidelinesSheet' as any).props.onClose();
    });
    await press('Swap menu');
    await press('Blocked swap members');
    expect(tree.root.findByType('SwapBlockedSheet' as any).props.visible).toBe(true);
    expect(tree.root.findByType('SwapGuidelinesSheet' as any).props.visible).toBe(false);
  });

  it('emails support, and says where to write if Mail cannot open', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    const { press } = await mount();
    await press('Swap menu');
    await press('Email support');
    expect(open).toHaveBeenCalledWith(SUPPORT_MAILTO);

    open.mockRejectedValue(new Error('no mail'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await press('Swap menu');
    await press('Email support');
    expect(alert).toHaveBeenCalledWith('Could not open Mail', expect.stringContaining('@'));
  });

  it('closes the menu once a row is chosen', async () => {
    const { press, byLabel } = await mount();
    await press('Swap menu');
    expect(byLabel('Swap guidelines')).toHaveLength(1);
    await press('Swap guidelines');
    expect(byLabel('Swap guidelines')).toHaveLength(0);
  });
});
