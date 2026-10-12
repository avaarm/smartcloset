import 'react-native';
import React from 'react';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeForPicker from '../../src/components/WardrobeForPicker';
import type { WardrobeFor } from '../../src/services/wardrobeAudience';

let tree: renderer.ReactTestRenderer;

const mount = async (value: WardrobeFor | null, onChange = jest.fn()) => {
  await act(async () => {
    tree = renderer.create(<WardrobeForPicker value={value} onChange={onChange} />);
  });
  return onChange;
};

const rerender = async (value: WardrobeFor | null, onChange = jest.fn()) => {
  await act(async () => {
    tree.update(<WardrobeForPicker value={value} onChange={onChange} />);
  });
  return onChange;
};

const chips = () => tree.root.findAllByType(Pressable);
const chip = (label: string) => {
  const found = chips().filter(n => n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no chip "${label}"`);
  return found[0];
};
const isOn = (label: string) => !!chip(label).props.accessibilityState?.selected;
const lit = () => chips().filter(n => n.props.accessibilityState?.selected).map(n => n.props.accessibilityLabel);
const press = (label: string) => act(async () => chip(label).props.onPress());

afterEach(() => act(() => tree?.unmount()));

describe('WardrobeForPicker', () => {
  it("offers Women's, Men's and Both, in that order, and nothing else", async () => {
    await mount(null);
    expect(chips().map(n => n.props.accessibilityLabel)).toEqual(["Women's", "Men's", 'Both']);
  });

  it('is a single-choice group named for what it asks', async () => {
    await mount(null);
    const group = tree.root.find(n => n.props.accessibilityRole === 'radiogroup');
    expect(group.props.accessibilityLabel).toBe('This wardrobe is for');
    expect(chips().every(n => n.props.accessibilityRole === 'radio')).toBe(true);
  });

  it('lights nothing before the person has answered', async () => {
    await mount(null);
    expect(lit()).toEqual([]);
  });

  it.each([
    ['women', "Women's"],
    ['men', "Men's"],
    ['both', 'Both'],
  ] as const)('lights only %s when that is the answer', async (value, label) => {
    await mount(value);
    expect(lit()).toEqual([label]);
    expect(isOn(label)).toBe(true);
  });

  it('follows the value it is given', async () => {
    await mount(null);
    await rerender('men');
    expect(lit()).toEqual(["Men's"]);
    await rerender('both');
    expect(lit()).toEqual(['Both']);
    await rerender(null);
    expect(lit()).toEqual([]);
  });

  it.each([
    ["Women's", 'women'],
    ["Men's", 'men'],
    ['Both', 'both'],
  ] as const)('reports a tap on %s as %s', async (label, value) => {
    const onChange = await mount(null);
    await press(label);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(value);
  });

  it('reports a tap on another chip when one is lit', async () => {
    const onChange = await mount('women');
    await press("Men's");
    expect(onChange).toHaveBeenCalledWith('men');
    await press('Both');
    expect(onChange).toHaveBeenLastCalledWith('both');
  });

  it('does not light a chip by itself: the value comes from the caller', async () => {
    await mount(null);
    await press("Women's");
    expect(lit()).toEqual([]);
  });

  it('does not report, or clear, when the lit chip is tapped again', async () => {
    const onChange = await mount('men');
    await press("Men's");
    expect(onChange).not.toHaveBeenCalled();
    expect(lit()).toEqual(["Men's"]);
  });

  it('never reports null', async () => {
    const onChange = await mount('both');
    await press('Both');
    await press("Women's");
    await press("Men's");
    expect(onChange.mock.calls.map(c => c[0])).toEqual(['women', 'men']);
  });

  it('keeps reporting to the latest callback', async () => {
    const first = await mount(null);
    const second = await rerender(null);
    await press('Both');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('both');
  });
});
