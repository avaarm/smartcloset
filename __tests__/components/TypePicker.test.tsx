import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import TypePicker from '../../src/components/TypePicker';
import type { ClothingCategory } from '../../src/types/clothing';

let tree: renderer.ReactTestRenderer;

const mount = async (category: ClothingCategory, value: string) => {
  const onChange = jest.fn();
  await act(async () => {
    tree = renderer.create(<TypePicker category={category} value={value} onChange={onChange} />);
  });
  return onChange;
};

const rerender = async (category: ClothingCategory, value: string, onChange = jest.fn()) => {
  await act(async () => {
    tree.update(<TypePicker category={category} value={value} onChange={onChange} />);
  });
  return onChange;
};

const chip = (label: string) => {
  const found = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no chip "${label}"`);
  return found[0];
};
const hasChip = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;
const isOn = (label: string) => !!chip(label).props.accessibilityState?.checked || !!chip(label).props.accessibilityState?.selected;
const press = async (label: string) => act(async () => chip(label).props.onPress());
const otherInput = () => tree.root.findAll(n => n.props.accessibilityLabel === 'Type of item' && n.props.onChangeText);

afterEach(() => act(() => tree?.unmount()));

describe('TypePicker', () => {
  it("lists the category's types and Other", async () => {
    await mount('bags', '');
    for (const label of ['Handbag', 'Tote', 'Crossbody', 'Clutch', 'Backpack', 'Other']) expect(hasChip(label)).toBe(true);
    expect(hasChip('Sneakers')).toBe(false);
  });

  it('follows the category', async () => {
    await mount('bags', '');
    await rerender('shoes', '');
    expect(hasChip('Sneakers')).toBe(true);
    expect(hasChip('Tote')).toBe(false);
  });

  it('lights the saved type and reports a tap on another', async () => {
    const onChange = await mount('bags', 'Tote');
    expect(isOn('Tote')).toBe(true);
    await press('Clutch');
    expect(onChange).toHaveBeenCalledWith('Clutch');
  });

  it('clears the type when the lit chip is tapped again', async () => {
    const onChange = await mount('bags', 'Tote');
    await press('Tote');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('Other opens a field, and what is typed there is the type', async () => {
    const onChange = await mount('bags', '');
    expect(otherInput()).toHaveLength(0);
    await press('Other');
    expect(otherInput().length).toBeGreaterThan(0);
    await act(async () => otherInput()[0].props.onChangeText('Doctor bag'));
    expect(onChange).toHaveBeenLastCalledWith('Doctor bag');
  });

  it('shows a type that is not on the menu in the Other field', async () => {
    await mount('bags', 'Doctor bag');
    expect(isOn('Other')).toBe(true);
    expect(otherInput()[0].props.value).toBe('Doctor bag');
    expect(isOn('Tote')).toBe(false);
  });

  it('limits a typed type to 60 characters', async () => {
    const onChange = await mount('bags', 'Doctor bag');
    await act(async () => otherInput()[0].props.onChangeText('x'.repeat(80)));
    expect(onChange).toHaveBeenLastCalledWith('x'.repeat(60));
  });
});
