import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';

const mockList = jest.fn();
const mockUnblock = jest.fn();
jest.mock('../../src/services/proService', () => ({
  listProBlocks: (...a: any[]) => mockList(...a),
  unblockProMember: (...a: any[]) => mockUnblock(...a),
}));

import ProBlockedSheet from '../../src/components/ProBlockedSheet';
import { ProError } from '../../src/services/proErrors';

type Props = React.ComponentProps<typeof ProBlockedSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const rows = [
  { ref: 'r1', label: 'Ana', blockedAt: '2026-10-20T10:00:00Z' },
  { ref: 'r2', label: 'Former stylist', blockedAt: '2026-10-19T10:00:00Z' },
];

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProBlockedSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProBlockedSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const has = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, press, has, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockList.mockReset().mockResolvedValue(rows);
  mockUnblock.mockReset().mockResolvedValue(undefined);
});

describe('ProBlockedSheet', () => {
  it('lists the people you blocked by label, each with an Unblock button', async () => {
    const { text, has } = await render();
    expect(text()).toContain('Blocked stylists and clients');
    expect(text()).toContain('Ana');
    expect(text()).toContain('Former stylist');
    expect(has('Unblock Ana')).toBe(true);
    expect(has('Unblock Former stylist')).toBe(true);
  });

  it('says so when nobody is blocked', async () => {
    mockList.mockResolvedValue([]);
    const { text } = await render();
    expect(text()).toContain("You haven't blocked any stylists or clients.");
  });

  it('never says "nobody is blocked" while the list is still coming', async () => {
    const pending = deferred();
    mockList.mockReturnValue(pending.promise);
    const { text } = await render();
    expect(text()).not.toContain("You haven't blocked");
    expect(text()).not.toContain('Ana');
    await act(async () => { pending.resolve(rows); });
    expect(text()).toContain('Ana');
  });

  it('unblocks by the opaque reference and takes the row off the list', async () => {
    const { text, press, has } = await render();
    await press('Unblock Ana');
    expect(mockUnblock).toHaveBeenCalledTimes(1);
    expect(mockUnblock).toHaveBeenCalledWith('r1');
    expect(has('Unblock Ana')).toBe(false);
    expect(has('Unblock Former stylist')).toBe(true);
    expect(text()).toContain('Former stylist');
  });

  it('shows the empty line after the last one is unblocked', async () => {
    mockList.mockResolvedValue([rows[0]]);
    const { text, press } = await render();
    await press('Unblock Ana');
    expect(text()).toContain("You haven't blocked any stylists or clients.");
  });

  it('keeps the row and explains in plain words when unblocking fails', async () => {
    mockUnblock.mockRejectedValueOnce(new ProError('pro_unavailable'));
    const { text, press, has } = await render();
    await press('Unblock Ana');
    expect(text()).toContain('This is no longer available.');
    expect(has('Unblock Ana')).toBe(true);

    mockUnblock.mockRejectedValueOnce(new Error('relation "user_blocks" exploded'));
    await press('Unblock Ana');
    expect(text()).toContain("Couldn't unblock this person. Please try again.");
    expect(text()).not.toContain('exploded');

    await press('Unblock Ana');
    expect(has('Unblock Ana')).toBe(false);
    expect(text()).not.toContain("Couldn't unblock");
  });

  it('shows a retry, not "nobody blocked", when the list cannot be loaded, and loads on retry', async () => {
    mockList.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press } = await render();
    expect(text()).toContain("Couldn't load the people you blocked");
    expect(text()).not.toContain("You haven't blocked");

    await press('Try again to load your blocked list');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Ana');
    expect(text()).not.toContain("Couldn't load the people you blocked");
  });

  it('does not log when a guest or a failure leaves the list unloaded', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockList.mockRejectedValue(new ProError('not_authenticated'));
    const { text } = await render();
    expect(text()).toContain("Couldn't load the people you blocked");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('starts again, with a fresh read, each time it opens', async () => {
    const { update, text } = await render();
    mockList.mockResolvedValue([{ ref: 'r3', label: 'Bea', blockedAt: '2026-10-21T10:00:00Z' }]);
    await update({ visible: false });
    await update({ visible: true });
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Bea');
    expect(text()).not.toContain('Ana');
  });

  it('ignores a list or an unblock that finishes after it was closed', async () => {
    const pending = deferred();
    mockUnblock.mockReturnValue(pending.promise);
    const { press, update, text } = await render();
    await press('Unblock Ana');
    await update({ visible: false });
    await act(async () => { pending.resolve(); });
    // Reopen: the list is read again, and the late answer changed nothing on the way.
    await update({ visible: true });
    expect(text()).toContain('Ana');
  });

  it('closes with Done', async () => {
    const { press, props } = await render();
    await press('Done');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('holds no account id, and calls only the pro service', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProBlockedSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/friendService|userId|blocked_id|unblockUser|listSwapBlocks/);
    expect(source).toMatch(/listProBlocks/);
    expect(source).toMatch(/unblockProMember/);
  });
});
