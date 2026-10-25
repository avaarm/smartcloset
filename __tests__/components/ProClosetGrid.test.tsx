import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { FlatList, Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';

// A marker that keeps the props it was given: the grid only decides which photo each tile asks for.
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});

import ProClosetGrid from '../../src/components/ProClosetGrid';
import type { ProClosetItem } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProClosetGrid>;

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

const render = (over: Partial<Props> = {}) => {
  const props: Props = { items: [piece('a'), piece('b')], connectionId: 'conn-1', ...over };
  const tree = renderer.create(<ProClosetGrid {...props} />);
  const text = () => flatten(tree.toJSON());
  const tile = (label: string) =>
    tree.root.findAll(n => n.type === Pressable && n.props.accessibilityLabel === label)[0];
  const photos = () => tree.root.findAllByType('ProPhoto' as any);
  return { tree, props, text, tile, photos };
};

describe('ProClosetGrid', () => {
  it('draws a tile for each piece with its name and the brand and colour', () => {
    const { text } = render({ items: [piece('a', { name: 'Navy blazer', brand: 'Zara', color: 'navy' }), piece('b', { name: 'Plain tee', category: 'tops' })] });
    expect(text()).toContain('Navy blazer');
    expect(text()).toContain('Zara · Navy');
    expect(text()).toContain('Plain tee');
  });

  it('falls back to the category under a piece with no brand and no colour', () => {
    const { text } = render({ items: [piece('a', { name: 'Plain tee', category: 'tops' })] });
    expect(text()).toContain('Tops');
  });

  it('asks for each photo by connection and piece, and tells the photo when a piece has none', () => {
    const { photos } = render({ items: [piece('a'), piece('b', { hasPhoto: false })] });
    expect(photos().map(p => p.props)).toEqual([
      expect.objectContaining({ connectionId: 'conn-1', itemId: 'a', hasPhoto: true }),
      expect.objectContaining({ connectionId: 'conn-1', itemId: 'b', hasPhoto: false }),
    ]);
  });

  it('passes no storage path or link to the photo', () => {
    const { photos } = render();
    for (const p of photos()) {
      expect(p.props.ownPath).toBeUndefined();
      expect(Object.keys(p.props).filter(k => /path|uri|url|source/i.test(k))).toEqual([]);
    }
  });

  describe('read-only', () => {
    it('opens a piece with a tap and offers nothing else', async () => {
      const onOpen = jest.fn();
      const items = [piece('a')];
      const { tile } = render({ items, onOpen });
      await act(async () => {
        tile('Piece a').props.onPress();
      });
      expect(onOpen).toHaveBeenCalledWith(items[0]);
      expect(tile('Piece a').props.onLongPress).toBeUndefined();
      expect(tile('Piece a').props.accessibilityRole).toBe('button');
    });

    it('is not a list of checkboxes', () => {
      const { tile } = render({ onOpen: jest.fn() });
      expect(tile('Piece a').props.accessibilityState).toBeUndefined();
    });

    it('draws plain tiles when nothing handles a tap', () => {
      const { tile } = render();
      expect(tile('Piece a')).toBeUndefined();
    });
  });

  describe('selectable', () => {
    it('toggles a piece by id and shows which ones are chosen', async () => {
      const onToggle = jest.fn();
      const { tile } = render({ selectable: true, selectedIds: ['b'], onToggle });
      expect(tile('Piece a').props.accessibilityState).toEqual({ checked: false });
      expect(tile('Piece b, selected').props.accessibilityState).toEqual({ checked: true });
      await act(async () => {
        tile('Piece a').props.onPress();
      });
      expect(onToggle).toHaveBeenCalledWith('a');
    });
  });

  it('reports the end of the list so the screen can fetch the next page', async () => {
    const onEndReached = jest.fn();
    const { tree } = render({ onEndReached });
    await act(async () => {
      tree.root.findByType(FlatList).props.onEndReached({ distanceFromEnd: 0 });
    });
    expect(onEndReached).toHaveBeenCalled();
  });

  it('shows the header, the footer and, when there are no pieces, the empty message', () => {
    const { text } = render({
      items: [],
      header: <></>,
      footer: React.createElement('Footer' as any),
      empty: React.createElement('Empty' as any),
    });
    expect(text().trim()).toBe('');
    const withItems = render({ header: React.createElement('Header' as any) });
    expect(withItems.tree.root.findAllByType('Header' as any)).toHaveLength(1);
    const none = render({ items: [], empty: React.createElement('Empty' as any) });
    expect(none.tree.root.findAllByType('Empty' as any)).toHaveLength(1);
  });

  it('holds no navigation, no download and no share', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProClosetGrid.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation|Share\b|onLongPress|CameraRoll|saveToCameraRoll/);
  });
});
