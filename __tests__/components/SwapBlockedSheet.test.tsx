import 'react-native';
import React from 'react';
import { ActivityIndicator } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockList = jest.fn();
const mockUnblock = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  listSwapBlocks: (...a: any[]) => mockList(...a),
  unblockSwapMember: (...a: any[]) => mockUnblock(...a),
}));

import SwapBlockedSheet from '../../src/components/SwapBlockedSheet';
import { SwapError } from '../../src/services/swapErrors';

type Props = React.ComponentProps<typeof SwapBlockedSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const blocks = [
  { ref: 'ref-aaa', label: 'Velvet Otter', blockedAt: '2026-10-01T10:00:00Z' },
  { ref: 'ref-bbb', label: 'Bea', blockedAt: '2026-10-02T10:00:00Z' },
];

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapBlockedSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapBlockedSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, press, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  mockList.mockReset().mockResolvedValue(blocks);
  mockUnblock.mockReset().mockResolvedValue(undefined);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('SwapBlockedSheet', () => {
  it('lists the people blocked from swaps, each with Unblock', async () => {
    const { text, tree } = await render();
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Blocked swap members');
    expect(text()).toContain('Velvet Otter');
    expect(text()).toContain('Bea');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Unblock Velvet Otter' && n.props.onPress)).not.toHaveLength(0);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Unblock Bea' && n.props.onPress)).not.toHaveLength(0);
  });

  it('never shows the opaque reference', async () => {
    const { text } = await render();
    expect(text()).not.toContain('ref-aaa');
    expect(text()).not.toContain('ref-bbb');
  });

  it('says so when nobody is blocked', async () => {
    mockList.mockResolvedValue([]);
    const { text } = await render();
    expect(text()).toContain('You haven’t blocked anyone from swaps.');
  });

  it('shows a spinner, not the empty text, while the list is on its way', async () => {
    const pending = deferred();
    mockList.mockReturnValue(pending.promise);
    const { text, tree } = await render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(text()).not.toContain('You haven’t blocked anyone');
    await act(async () => {
      pending.resolve([]);
    });
    expect(text()).toContain('You haven’t blocked anyone from swaps.');
  });

  it('does not load while it is closed, and loads each time it opens', async () => {
    const { update } = await render({ visible: false });
    expect(mockList).not.toHaveBeenCalled();
    await update({ visible: true });
    expect(mockList).toHaveBeenCalledTimes(1);
    await update({ visible: false });
    await update({ visible: true });
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('unblocks by reference and takes that row off the list', async () => {
    const { text, press } = await render();
    await press('Unblock Velvet Otter');
    expect(mockUnblock).toHaveBeenCalledTimes(1);
    expect(mockUnblock).toHaveBeenCalledWith('ref-aaa');
    expect(text()).not.toContain('Velvet Otter');
    expect(text()).toContain('Bea');
  });

  it('keeps the row and explains when unblocking fails', async () => {
    mockUnblock.mockRejectedValue({ message: 'Network request failed' });
    const { text, press } = await render();
    await press('Unblock Bea');
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');
    expect(text()).toContain('Bea');

    mockUnblock.mockRejectedValue(new Error('function exploded'));
    await press('Unblock Bea');
    expect(text()).toContain('Couldn’t unblock this person. Please try again.');
    expect(text()).not.toContain('exploded');
  });

  it('explains a failed load in plain words, quietly', async () => {
    mockList.mockRejectedValue(new SwapError('not_authenticated'));
    const { text } = await render();
    expect(text()).toContain('Sign in to swap.');
    expect(text()).not.toContain('You haven’t blocked anyone');

    mockList.mockRejectedValue(new Error('boom'));
    const again = await render();
    expect(again.text()).toContain('Couldn’t load the people you blocked. Please try again.');
    expect(again.text()).not.toContain('boom');
  });

  it('does not show a list that finishes loading after the sheet was closed and reopened', async () => {
    const first = deferred();
    mockList.mockReturnValueOnce(first.promise);
    const { text, update } = await render();
    await update({ visible: false });
    mockList.mockResolvedValueOnce([{ ref: 'ref-ccc', label: 'Cleo', blockedAt: '2026-10-03T10:00:00Z' }]);
    await update({ visible: true });
    expect(text()).toContain('Cleo');
    await act(async () => {
      first.resolve(blocks);
    });
    expect(text()).toContain('Cleo');
    expect(text()).not.toContain('Velvet Otter');
  });

  it('Done closes the sheet', async () => {
    const { press, props } = await render();
    await press('Done');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
