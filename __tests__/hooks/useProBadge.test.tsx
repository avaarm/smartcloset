import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const mockGetBadge = jest.fn();
jest.mock('../../src/services/proService', () => ({ getProBadge: (...a: any[]) => mockGetBadge(...a) }));

import { useProBadge } from '../../src/hooks/useProBadge';

const Probe = ({ enabled }: { enabled: boolean }) => <Text>{String(useProBadge(enabled))}</Text>;
const shown = async (enabled: boolean) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe enabled={enabled} />); });
  return { tree, text: () => (tree.toJSON() as any).children[0] as string };
};

beforeEach(() => mockGetBadge.mockReset());

describe('useProBadge', () => {
  it('shows the number of things waiting', async () => {
    mockGetBadge.mockResolvedValue(3);
    expect((await shown(true)).text()).toBe('3');
  });

  it('asks for nothing when signed out or when the build does not show the feature', async () => {
    expect((await shown(false)).text()).toBe('0');
    expect(mockGetBadge).not.toHaveBeenCalled();
  });

  it('goes back to 0 when it is switched off', async () => {
    mockGetBadge.mockResolvedValue(3);
    const { tree, text } = await shown(true);
    expect(text()).toBe('3');
    await act(async () => { tree.update(<Probe enabled={false} />); });
    expect(text()).toBe('0');
  });

  it('asks again when it is switched on', async () => {
    mockGetBadge.mockResolvedValue(2);
    const { tree, text } = await shown(false);
    await act(async () => { tree.update(<Probe enabled />); });
    expect(text()).toBe('2');
    expect(mockGetBadge).toHaveBeenCalledTimes(1);
  });

  it('is 0 when the call fails, and says nothing about it', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetBadge.mockRejectedValue(new Error('offline'));
    expect((await shown(true)).text()).toBe('0');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it('does not set state after the screen is gone', async () => {
    let release!: (n: number) => void;
    mockGetBadge.mockReturnValue(new Promise<number>(r => { release = r; }));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { tree } = await shown(true);
    tree.unmount();
    await act(async () => { release(9); });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
