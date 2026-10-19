/**
 * StylePicker: the look of a piece as chips, any number on. It only reports the toggles; the screen keeps the
 * styles in the item's tags.
 */
import 'react-native';
import React from 'react';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import StylePicker from '../../src/components/StylePicker';
import { STYLE_LABELS, STYLE_OPTIONS } from '../../src/utils/styleOptions';

const mount = async (selected: Parameters<typeof StylePicker>[0]['selected'] = []) => {
  const onToggle = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<StylePicker selected={selected} onToggle={onToggle} />);
  });
  const chips = () => tree.root.findAllByType(Pressable);
  const chip = (label: string) => {
    const found = chips().filter(n => n.props.accessibilityLabel === label);
    if (found.length !== 1) throw new Error(`expected one chip "${label}", found ${found.length}`);
    return found[0];
  };
  return { tree, onToggle, chips, chip };
};

describe('StylePicker', () => {
  it('shows a chip for every style, with the style as its text', async () => {
    const { chips, tree } = await mount();
    expect(chips()).toHaveLength(STYLE_OPTIONS.length);
    const text = JSON.stringify(tree.toJSON());
    for (const style of STYLE_OPTIONS) expect(text).toContain(STYLE_LABELS[style]);
  });

  it('lights the chips of the selected styles only, as checkboxes', async () => {
    const { chip } = await mount(['casual', 'boho']);
    expect(chip('Style: Casual').props.accessibilityState).toMatchObject({ checked: true });
    expect(chip('Style: Boho').props.accessibilityState).toMatchObject({ checked: true });
    expect(chip('Style: Classic').props.accessibilityState).toMatchObject({ checked: false });
    expect(chip('Style: Casual').props.accessibilityRole).toBe('checkbox');
  });

  it('reports the style of a tapped chip, lit or not', async () => {
    const { chip, onToggle } = await mount(['casual']);
    await act(async () => chip('Style: Vintage').props.onPress());
    expect(onToggle).toHaveBeenLastCalledWith('vintage');
    await act(async () => chip('Style: Casual').props.onPress());
    expect(onToggle).toHaveBeenLastCalledWith('casual');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('reads a style with its group, so it is not mistaken for an occasion of the same name', async () => {
    const { chip } = await mount();
    expect(chip('Style: Casual')).toBeTruthy();
  });
});
