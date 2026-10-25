import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';

// A marker that keeps the props it was given: the sheet only decides which photo to ask for.
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});

import ProClosetItemSheet from '../../src/components/ProClosetItemSheet';
import type { ProClosetItem } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProClosetItemSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const full: ProClosetItem = {
  id: 'item-1',
  name: 'Navy blazer',
  category: 'outerwear',
  subcategory: 'blazer',
  color: 'navy',
  brand: 'Zara',
  season: ['fall', 'winter'],
  pattern: 'solid',
  material: 'wool',
  materials: [{ name: 'Wool', percentage: 80 }, { name: 'Polyester', percentage: 20 }],
  size: 'M',
  condition: 'like_new',
  hasPhoto: true,
};

const render = (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, connectionId: 'conn-1', item: full, onClose: jest.fn(), ...over };
  const tree = renderer.create(<ProClosetItemSheet {...props} />);
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, props, text, press };
};

describe('ProClosetItemSheet', () => {
  it('shows the piece\'s name and every fact the server returned', () => {
    const { text } = render();
    const t = text();
    expect(t).toContain('Navy blazer');
    for (const [label, value] of [
      ['Category', 'Outerwear'], ['Subcategory', 'Blazer'], ['Color', 'Navy'], ['Brand', 'Zara'], ['Size', 'M'],
      ['Condition', 'Like new'], ['Pattern', 'Solid'], ['Material', 'Wool'], ['Season', 'Fall, Winter'],
      ['Materials', '80% Wool, 20% Polyester'],
    ]) {
      expect(t).toContain(label);
      expect(t).toContain(value);
    }
  });

  it('leaves out a fact the server did not return', () => {
    const { text } = render({ item: { id: 'i2', name: 'Plain tee', category: 'tops', hasPhoto: false } });
    expect(text()).toContain('Plain tee');
    expect(text()).toContain('Category');
    for (const label of ['Subcategory', 'Color', 'Brand', 'Size', 'Condition', 'Pattern', 'Materials', 'Season']) {
      expect(text()).not.toContain(label);
    }
  });

  it('reads odd closet text safely: a plain-word season, bare material names, junk entries', () => {
    const { text } = render({
      item: { id: 'i3', name: 'Scarf', category: 'accessories', hasPhoto: true, season: 'winter', materials: ['Silk', { name: 'Cotton' }, 7, null, { percentage: 5 }] },
    });
    expect(text()).toContain('Winter');
    expect(text()).toContain('Silk, Cotton');
  });

  it('asks for the large photo by connection and piece, with no path or link', () => {
    const { tree } = render();
    const photo = tree.root.findByType('ProPhoto' as any);
    expect(photo.props).toMatchObject({ connectionId: 'conn-1', itemId: 'item-1', hasPhoto: true });
    expect(Object.keys(photo.props).filter(k => /path|uri|url|source/i.test(k))).toEqual([]);
  });

  it('draws nothing while there is no piece', () => {
    const { tree, text } = render({ item: null });
    expect(text()).toBe('');
    expect(tree.root.findAllByType('ProPhoto' as any)).toHaveLength(0);
  });

  it('is closed by the Close button', async () => {
    const { press, props } = render();
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('offers Report or block only when the host can answer it, and reports through the host', async () => {
    expect(render().tree.root.findAll(n => n.props.accessibilityLabel === 'Report or block')).toHaveLength(0);
    const onReport = jest.fn();
    const { press, props } = render({ onReport });
    await press('Report or block');
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();          // the host closes this sheet before it opens the next
  });

  it('has nothing to save, share or copy', () => {
    const { text, tree } = render();
    expect(text()).not.toMatch(/\b(Save|Share|Copy|Download)\b/);
    expect(tree.root.findAll(n => n.props.selectable === true)).toHaveLength(0);
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProClosetItemSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation|Share\b|Clipboard|Linking|CameraRoll/);
  });
});
