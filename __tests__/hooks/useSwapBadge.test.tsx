import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const mockGetBadge = jest.fn();
jest.mock('../../src/services/swapService', () => ({ getSwapBadge: (...a: any[]) => mockGetBadge(...a) }));

import { useSwapBadge } from '../../src/hooks/useSwapBadge';

const Probe = ({ enabled }: { enabled: boolean }) => <Text>{String(useSwapBadge(enabled))}</Text>;
const shown = async (enabled: boolean) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe enabled={enabled} />); });
  return (tree.toJSON() as any).children[0] as string;
};

beforeEach(() => mockGetBadge.mockReset());

describe('useSwapBadge', () => {
  it('shows the number of swaps waiting', async () => {
    mockGetBadge.mockResolvedValue(3);
    expect(await shown(true)).toBe('3');
  });

  it('asks for nothing when signed out', async () => {
    expect(await shown(false)).toBe('0');
    expect(mockGetBadge).not.toHaveBeenCalled();
  });

  it('is 0 when the call fails, and says nothing about it', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetBadge.mockRejectedValue(new Error('offline'));
    expect(await shown(true)).toBe('0');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
