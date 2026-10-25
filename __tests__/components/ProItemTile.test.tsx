import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Image, Pressable, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ProItemTile from '../../src/components/ProItemTile';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

type Props = React.ComponentProps<typeof ProItemTile>;

const base = (over: Partial<Props> = {}): Props => ({
  name: 'Blue denim jacket',
  accessibilityLabel: 'Blue denim jacket',
  ...over,
});

const render = (over: Partial<Props> = {}) => {
  const props = base(over);
  const tree = renderer.create(<ProItemTile {...props} />);
  return { tree, props, text: () => flatten(tree.toJSON()) };
};

// A stand-in for a ProPhoto element: the tile only sees a React element.
const Photo: React.FC<{ style?: any; label?: string }> = ({ label = 'photo' }) => <Image source={{ uri: 'https://x/y' }} accessibilityLabel={label} />;

describe('ProItemTile', () => {
  it('shows the name and the subtitle', () => {
    const { text } = render({ subtitle: 'Outerwear, blue' });
    expect(text()).toContain('Blue denim jacket');
    expect(text()).toContain('Outerwear, blue');
  });

  it('leaves out an absent subtitle', () => {
    const { tree } = render();
    expect(tree.root.findAllByType(Text)).toHaveLength(1);
  });

  it('shows the photo element it is given, told to fill the square', () => {
    const { tree } = render({ photo: <Photo /> });
    const photo = tree.root.findByType(Photo);
    const style = ([] as any[]).concat(photo.props.style).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...style)).toMatchObject({ width: '100%', height: '100%' });
  });

  it('keeps a size the photo element already has', () => {
    const { tree } = render({ photo: <Photo style={{ width: 50 }} /> });
    const photo = tree.root.findByType(Photo);
    const style = ([] as any[]).concat(photo.props.style).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...style).width).toBe(50);
  });

  it('shows a placeholder, and no image, when there is no photo element', () => {
    const { tree } = render();
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('is a plain labelled group with no press when it has no handler', () => {
    const { tree } = render();
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
    const group = tree.root.findAll(n => n.props.accessibilityLabel === 'Blue denim jacket' && n.props.accessible)[0];
    expect(group).toBeDefined();
  });

  it('is a button that presses when it has a handler and no selection', () => {
    const onPress = jest.fn();
    const { tree } = render({ onPress });
    const button = tree.root.findByType(Pressable);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toBeUndefined();
    act(() => { button.props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a checkbox when it takes part in a selection, checked only when selected', () => {
    const onPress = jest.fn();
    const off = render({ onPress, selected: false });
    const offButton = off.tree.root.findByType(Pressable);
    expect(offButton.props.accessibilityRole).toBe('checkbox');
    expect(offButton.props.accessibilityState).toEqual({ checked: false });

    const on = render({ onPress, selected: true });
    const onButton = on.tree.root.findByType(Pressable);
    expect(onButton.props.accessibilityState).toEqual({ checked: true });
  });

  it('marks a selected tile with a check, and an unselected one with none', () => {
    const icons = (selected: boolean) =>
      render({ onPress: jest.fn(), selected }).tree.root.findAll(n => (n.type as any) === 'Icon' && n.props.name === 'checkmark');
    expect(icons(true)).toHaveLength(1);
    expect(icons(false)).toHaveLength(0);
  });

  it('uses the label the caller gave, whatever the name', () => {
    const { tree } = render({ onPress: jest.fn(), selected: true, accessibilityLabel: 'Blue denim jacket, selected' });
    expect(tree.root.findByType(Pressable).props.accessibilityLabel).toBe('Blue denim jacket, selected');
  });

  it('knows no path, id, navigation or photo service', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProItemTile.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation|proPhotoUrls|imageUrls|connectionId|itemId|AsyncStorage/);
  });
});
