import 'react-native';
import React from 'react';
import { FlatList, Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});
const mockCloset = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getClientCloset: (...a: any[]) => mockCloset(...a),
}));

import ProClosetPicker from '../../src/components/ProClosetPicker';
import { ProError } from '../../src/services/proErrors';
import type { ProClosetItem } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProClosetPicker>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const piece = (id: string, over: Partial<ProClosetItem> = {}): ProClosetItem => ({
  id,
  name: `Piece ${id}`,
  category: 'tops',
  hasPhoto: true,
  ...over,
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const mounted: renderer.ReactTestRenderer[] = [];
const render = async (over: Partial<Props> = {}) => {
  const props: Props = {
    visible: true,
    connectionId: 'conn-1',
    selectedIds: [],
    max: 3,
    onDone: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProClosetPicker {...props} />);
  });
  mounted.push(tree);
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProClosetPicker {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const tile = (label: string) =>
    tree.root.findAll(n => n.type === Pressable && n.props.accessibilityLabel === label)[0];
  const press = async (label: string) => {
    const node = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    if (!node) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      node.props.onPress();
    });
  };
  const endReached = async () => {
    await act(async () => {
      tree.root.findByType(FlatList).props.onEndReached({ distanceFromEnd: 0 });
    });
  };
  return { tree, props, update, text, tile, press, endReached };
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
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

describe('ProClosetPicker', () => {
  it('reads the first page of the shared closet when it opens, and not before', async () => {
    const { text } = await render({ visible: false });
    expect(mockCloset).not.toHaveBeenCalled();
    expect(text()).toBe('');
  });

  it('shows the pieces of the first page, 60 at a time', async () => {
    const { text } = await render();
    expect(mockCloset).toHaveBeenCalledWith('conn-1', { offset: 0, limit: 60 });
    expect(text()).toContain('Piece a');
    expect(text()).toContain('Piece d');
    expect(text()).toContain('0 of 3 selected');
  });

  it('marks the pieces that are already in the look', async () => {
    const { tile } = await render({ selectedIds: ['b'], selectedItems: [piece('b')] });
    expect(tile('Piece b, selected').props.accessibilityState).toEqual({ checked: true });
    expect(tile('Piece a').props.accessibilityState).toEqual({ checked: false });
  });

  it('picks and unpicks pieces, and counts them', async () => {
    const { press, text } = await render();
    await press('Piece a');
    await press('Piece c');
    expect(text()).toContain('2 of 3 selected');
    await press('Piece a, selected');
    expect(text()).toContain('1 of 3 selected');
  });

  it('stops at the most a look can hold and says so', async () => {
    const { press, text } = await render({ max: 2 });
    await press('Piece a');
    await press('Piece b');
    await press('Piece c');
    expect(text()).toContain('2 of 2 selected');
    expect(text()).toContain('You can pick up to 2 pieces.');
    await press('Piece b, selected');
    expect(text()).not.toContain('You can pick up to 2 pieces.');
  });

  it('hands back the chosen pieces in the order they were picked, including the ones already in the look', async () => {
    const { press, props } = await render({ selectedIds: ['z'], selectedItems: [piece('z', { name: 'Old piece' })] });
    await press('Piece c');
    await press('Piece a');
    await press('Add to look');
    const given = (props.onDone as jest.Mock).mock.calls[0][0] as ProClosetItem[];
    expect(given.map(i => i.id)).toEqual(['z', 'c', 'a']);
    expect(given[0].name).toBe('Old piece');
  });

  it('drops a chosen id it has no details for rather than inventing a piece', async () => {
    const { press, props } = await render({ selectedIds: ['unseen'] });
    await press('Piece a');
    await press('Add to look');
    expect((props.onDone as jest.Mock).mock.calls[0][0].map((i: ProClosetItem) => i.id)).toEqual(['a']);
  });

  it('is cancelled by Cancel without handing anything back', async () => {
    const { press, props } = await render();
    await press('Piece a');
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onDone).not.toHaveBeenCalled();
  });

  describe('paging', () => {
    it('asks for the next page after the pieces it has and merges by id', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 4 })
        .mockResolvedValueOnce({ items: [piece('b'), piece('c'), piece('d')], total: 4 });
      const { endReached, tree } = await render();
      await endReached();
      expect(mockCloset).toHaveBeenLastCalledWith('conn-1', { offset: 2, limit: 60 });
      expect(tree.root.findAllByType('ProPhoto' as any).map(p => p.props.itemId)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('does not ask again once it has every piece', async () => {
      const { endReached } = await render();
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(1);
    });

    it('stops asking when a page brings nothing new', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 5 })
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 5 });
      const { endReached } = await render();
      await endReached();
      await endReached();
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(2);
    });

    it('offers Try again after a failed page, and does not retry by itself', async () => {
      mockCloset
        .mockResolvedValueOnce({ items: [piece('a'), piece('b')], total: 4 })
        .mockRejectedValueOnce(new ProError('closet_page_limit'))
        .mockResolvedValueOnce({ items: [piece('c'), piece('d')], total: 4 });
      const { endReached, press, text } = await render();
      await endReached();
      expect(text()).toContain('Couldn’t load more. Try again');
      await endReached();
      expect(mockCloset).toHaveBeenCalledTimes(2);
      await press('Couldn’t load more. Try again');
      expect(text()).toContain('Piece d');
    });
  });

  describe('when the closet cannot be read', () => {
    it('says so in words when it is not shared, and offers nothing to pick', async () => {
      mockCloset.mockRejectedValue(new ProError('closet_not_shared'));
      const { text, tree } = await render();
      expect(text()).toContain('They haven\'t shared their closet.');
      expect(tree.root.find(n => n.props.accessibilityLabel === 'Add to look' && typeof n.props.onPress === 'function').props.disabled).toBe(true);
    });

    it('offers Try again after any other failure', async () => {
      mockCloset.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce({ items: [piece('a')], total: 1 });
      const { text, press } = await render();
      expect(text()).toContain('Couldn’t load the closet');
      await press('Try again to load your closet');
      expect(text()).toContain('Piece a');
    });

    it('says there is nothing when the grant has no pieces', async () => {
      mockCloset.mockResolvedValue({ items: [], total: 0 });
      const { text } = await render();
      expect(text()).toContain('No pieces are shared yet.');
    });
  });

  describe('opening and closing', () => {
    it('forgets the choice and reads again when it is reopened', async () => {
      const { update, press, text } = await render();
      await press('Piece a');
      expect(text()).toContain('1 of 3 selected');
      await update({ visible: false });
      await update({ visible: true });
      expect(mockCloset).toHaveBeenCalledTimes(2);
      expect(text()).toContain('0 of 3 selected');
    });

    it('ignores a page that arrives after the sheet was closed', async () => {
      const slow = deferred<{ items: ProClosetItem[]; total: number }>();
      mockCloset.mockReturnValue(slow.promise);
      const { update, text } = await render();
      await update({ visible: false });
      await act(async () => {
        slow.resolve({ items: [piece('late')], total: 1 });
      });
      expect(text()).toBe('');
    });

    it('ignores a page that arrives for an earlier opening after the sheet was reopened', async () => {
      const slow = deferred<{ items: ProClosetItem[]; total: number }>();
      mockCloset.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ items: [piece('fresh')], total: 1 });
      const { update, text } = await render();
      await update({ visible: false });
      await update({ visible: true });
      await act(async () => {
        slow.resolve({ items: [piece('late')], total: 1 });
      });
      expect(text()).toContain('Piece fresh');
      expect(text()).not.toContain('Piece late');
    });

    it('reads again for another connection', async () => {
      const { update } = await render();
      await update({ connectionId: 'conn-2' });
      expect(mockCloset).toHaveBeenLastCalledWith('conn-2', { offset: 0, limit: 60 });
    });
  });
});
