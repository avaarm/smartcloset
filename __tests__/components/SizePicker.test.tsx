/**
 * SizePicker: a labelled group of chips for each way a size is written for the category, a tap on the lit chip
 * clears it, and a small field takes any size the chips don't offer. The size stays one short string.
 */
import 'react-native';
import React, { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import SizePicker, { MAX_SIZE_LENGTH, OTHER_SIZE_LABEL } from '../../src/components/SizePicker';
import { sizeGroupsFor } from '../../src/utils/sizeOptions';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const mount = async (category: string, initial = '') => {
  const box: { value: string; onChange: jest.Mock } = { value: initial, onChange: jest.fn() };
  const Host = ({ cat }: { cat: string }) => {
    const [value, setValue] = useState(initial);
    box.value = value;
    return (
      <SizePicker
        category={cat}
        value={value}
        onChange={next => {
          box.onChange(next);
          setValue(next);
        }}
      />
    );
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Host cat={category} />);
  });
  const chip = (label: string) => {
    const found = tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
    if (found.length !== 1) throw new Error(`expected one chip "${label}", found ${found.length}`);
    return found[0];
  };
  const tap = (label: string) => act(async () => chip(label).props.onPress());
  const isOn = (label: string) => !!chip(label).props.accessibilityState.selected;
  const other = () => tree.root.findByType(TextInput);
  const type = (text: string) => act(async () => other().props.onChangeText(text));
  const setCategory = (cat: string) =>
    act(async () => {
      tree.update(<Host cat={cat} />);
    });
  return { tree, box, chip, tap, isOn, other, type, setCategory, text: () => flatten(tree.toJSON()) };
};

describe('SizePicker', () => {
  it('offers a labelled group for each kind of size of the category', async () => {
    const tops = await mount('tops');
    expect(tops.text()).toContain('Letter');
    expect(tops.text()).toContain('Numeric (US)');
    expect(tops.text()).not.toContain('Waist (in)');

    const bottoms = await mount('bottoms');
    expect(bottoms.text()).toContain('Waist (in)');

    const shoes = await mount('shoes');
    expect(shoes.text()).toContain('Shoe (US)');
    expect(shoes.text()).toContain('Shoe (EU)');
    expect(shoes.text()).not.toContain('Letter');
  });

  it('has a chip for every offered size of the category, and the Other size field', async () => {
    const { tree, other } = await mount('hats');
    const labels = tree.root.findAllByType(Pressable).map(n => n.props.accessibilityLabel);
    for (const group of sizeGroupsFor('hats')) {
      for (const size of group.sizes) expect(labels).toContain(size === group.label ? size : `${group.label} ${size}`);
    }
    expect(other().props.accessibilityLabel).toBe(OTHER_SIZE_LABEL);
  });

  it('reads each chip with its group, so "8" is not ambiguous', async () => {
    const { chip } = await mount('bottoms');
    expect(chip('Letter M')).toBeTruthy();
    expect(chip('Numeric (US) 8')).toBeTruthy();
    expect(chip('Waist (in) 30')).toBeTruthy();
  });

  it('writes the size of a tapped chip, and clears it when the lit chip is tapped again', async () => {
    const { tap, isOn, box } = await mount('tops');
    expect(isOn('Letter M')).toBe(false);
    await tap('Letter M');
    expect(box.value).toBe('M');
    expect(isOn('Letter M')).toBe(true);
    await tap('Letter L');
    expect(box.value).toBe('L');
    expect(isOn('Letter M')).toBe(false);
    await tap('Letter L');
    expect(box.value).toBe('');
    expect(isOn('Letter L')).toBe(false);
  });

  it('lights the chip of an offered size whatever its case, and leaves the Other field empty', async () => {
    const { isOn, other } = await mount('tops', 'xl');
    expect(isOn('Letter XL')).toBe(true);
    expect(isOn('Letter L')).toBe(false);
    expect(other().props.value).toBe('');
  });

  it('puts a size the chips do not offer in the Other field and lights no chip', async () => {
    const { tree, other } = await mount('tops', 'EU 38');
    expect(other().props.value).toBe('EU 38');
    const lit = tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityState?.selected);
    expect(lit).toHaveLength(0);
  });

  it('writes what is typed in the Other field, 20 characters at most, as one string', async () => {
    const { type, box, other } = await mount('tops');
    expect(other().props.maxLength).toBe(MAX_SIZE_LENGTH);
    expect(MAX_SIZE_LENGTH).toBe(20);
    await type('W30 L32');
    expect(box.value).toBe('W30 L32');
    await type('x'.repeat(40));
    expect(box.value).toHaveLength(20);
  });

  it('lights the chip as a matching size is typed, without wiping what was typed', async () => {
    const { type, other, isOn } = await mount('tops');
    await type('xl');
    expect(isOn('Letter XL')).toBe(true);
    expect(other().props.value).toBe('xl');
  });

  it('takes a chip over the Other field, and follows a size set from outside', async () => {
    const { type, tap, other, isOn, box } = await mount('tops');
    await type('EU 38');
    await tap('Numeric (US) 8');
    expect(box.value).toBe('8');
    expect(other().props.value).toBe('');
    expect(isOn('Numeric (US) 8')).toBe(true);
    // Clearing the lit chip leaves nothing behind in the field.
    await tap('Numeric (US) 8');
    expect(other().props.value).toBe('');
  });

  it('shows the groups of the new category when it changes, keeping a size that does not fit as a typed one', async () => {
    const { tap, setCategory, text, other, isOn } = await mount('tops');
    await tap('Letter M');
    await setCategory('shoes');
    expect(text()).toContain('Shoe (US)');
    expect(text()).not.toContain('Letter');
    // "M" is not a shoe size: it is kept, in the field.
    expect(other().props.value).toBe('M');
    await tap('Shoe (US) 9.5');
    expect(isOn('Shoe (US) 9.5')).toBe(true);
    expect(other().props.value).toBe('');
  });

  it('gives the Other field a Done key that closes the keyboard, and no number pad', async () => {
    const { other } = await mount('tops');
    expect(other().props.returnKeyType).toBe('done');
    expect(other().props.blurOnSubmit).toBe(true);
    expect(other().props.keyboardType).toBeUndefined();
    expect(other().props.autoCorrect).toBe(false);
  });

  it('marks a group as a radio group and each chip as a radio', async () => {
    const { tree, chip } = await mount('tops');
    expect(chip('Letter M').props.accessibilityRole).toBe('radio');
    const groups = tree.root.findAll(n => n.props.accessibilityRole === 'radiogroup');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.map(g => g.props.accessibilityLabel)).toContain('Size: Letter');
  });

  it('calls the category with a shoe noun for shoes', async () => {
    const { tree } = await mount('shoes');
    const groups = tree.root.findAll(n => n.props.accessibilityRole === 'radiogroup');
    expect(groups.map(g => g.props.accessibilityLabel)).toContain('Shoe size: Shoe (US)');
  });
});
