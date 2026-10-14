/**
 * The inbox and the thread on top of the real swap service, with a Supabase client that only has `auth`
 * (what the launch and Settings tests do). A guest must see the sign-in state without a single call to the
 * database, and a failing server must show the load error without logging an error.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: { swapId: 's1' } }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));

jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});

import MySwapsScreen from '../../src/screens/MySwapsScreen';
import SwapThreadScreen from '../../src/screens/SwapThreadScreen';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const SCREENS: Array<[string, () => React.ReactElement]> = [
  ['MySwapsScreen', () => <MySwapsScreen />],
  ['SwapThreadScreen', () => <SwapThreadScreen />],
];

let errorSpy: jest.SpyInstance;
const mounted: renderer.ReactTestRenderer[] = [];
const mount = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  mounted.push(tree);
  return flatten(tree.toJSON());
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockGetSession.mockReset();
  mockRpc.mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe.each(SCREENS)('%s with only auth on the Supabase client', (_name, element) => {
  it('shows the sign-in state to a guest and calls nothing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const text = await mount(element());
    expect(text).toContain('Sign in to swap');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the load error, not a crash or a logged error, when the server cannot be reached', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const text = await mount(element());
    expect(text).toMatch(/Couldn't load your swaps?/);
    expect(mockRpc).toHaveBeenCalledWith('get_swap_settings', undefined);
  });

  it('says swaps are not available yet on a server without the swap functions', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_swap_settings' } });
    const text = await mount(element());
    expect(text).toContain('Swaps aren’t available yet');
  });
});
