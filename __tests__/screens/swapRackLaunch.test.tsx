/**
 * The rack's files with the real swap service and Supabase mocked down to auth only, the way the
 * launch smoke tests (App, AppModeGate) load every screen: importing them touches no network and no
 * storage, and a guest gets the sign-in state without a single call or console.error.
 */
import 'react-native';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: any[]) => mockGetSession(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: { listingId: 'l1' } }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
const mockNavigate = jest.fn();
// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const storageCalls = () =>
  (['getItem', 'setItem', 'removeItem', 'multiGet', 'multiSet', 'getAllKeys'] as const).reduce(
    (n, k) => n + ((AsyncStorage as any)[k]?.mock?.calls?.length ?? 0),
    0,
  );

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockNavigate.mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the swap rack at launch', () => {
  it('imports every file without asking Supabase for anything or touching storage', () => {
    jest.isolateModules(() => {
      require('../../src/components/SwapCard');
      require('../../src/components/SwapOfferSheet');
      require('../../src/screens/SwapBoardScreen');
      require('../../src/screens/SwapListingScreen');
    });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(storageCalls()).toBe(0);
  });

  it.each([
    ['the board', () => require('../../src/screens/SwapBoardScreen').default],
    ['a listing', () => require('../../src/screens/SwapListingScreen').default],
  ])('shows %s as "Sign in to swap" to a guest, with no call beyond the session check', async (_name, load) => {
    const Screen = load();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Screen />);
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(flatten(tree.toJSON())).toContain('Sign in to swap');
    expect(mockGetSession).toHaveBeenCalled();
    expect(storageCalls()).toBe(0);

    const signIn = tree.root.find(n => n.props.accessibilityLabel === 'Sign in' && typeof n.props.onPress === 'function');
    await act(async () => {
      signIn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('SignIn');
    await act(async () => {
      tree.unmount();
    });
  });
});
