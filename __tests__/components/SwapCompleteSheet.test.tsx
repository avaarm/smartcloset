import 'react-native';
import React from 'react';
import { Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import SwapCompleteSheet, { joinNames } from '../../src/components/SwapCompleteSheet';

type Props = React.ComponentProps<typeof SwapCompleteSheet>;

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const base = (over: Partial<Props> = {}): Props => ({
  visible: true,
  giveNames: ['Blue blazer'],
  getNames: ['Linen shirt'],
  busy: false,
  onConfirm: jest.fn(),
  onClose: jest.fn(),
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props = base(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapCompleteSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapCompleteSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  const keep = () => tree.root.findAllByType(Switch)[0];
  const flip = async (value: boolean) => {
    await act(async () => {
      keep().props.onValueChange(value);
    });
  };
  return { tree, text, press, keep, flip, update, props };
};

describe('SwapCompleteSheet', () => {
  it('says plainly what will happen to the closet', async () => {
    const { text } = await render();
    expect(text()).toContain(
      'Only tap this once you have actually swapped. Linen shirt will be added to your closet, and Blue blazer will be removed from it.',
    );
  });

  it('names several pieces on each side', async () => {
    const { text } = await render({ giveNames: ['Blazer', 'Scarf'], getNames: ['Shirt', 'Hat', 'Belt'] });
    expect(text()).toContain('Shirt, Hat and Belt will be added to your closet, and Blazer and Scarf will be removed from it.');
  });

  it('starts with keep-mine off and sends keepGiven false', async () => {
    const { keep, press, props } = await render();
    expect(keep().props.value).toBe(false);
    await press('Yes, we swapped!');
    expect(props.onConfirm).toHaveBeenCalledWith({ keepGiven: false });
  });

  it('passes keepGiven true when the member ticks "Keep mine in my closet"', async () => {
    const { keep, flip, press, props, text } = await render();
    expect(keep().props.accessibilityLabel).toBe('Keep mine in my closet');
    await flip(true);
    expect(keep().props.value).toBe(true);
    // The sentence no longer claims the piece is removed.
    expect(text()).toContain('Blue blazer stays in it.');
    expect(text()).not.toContain('will be removed from it');
    await press('Yes, we swapped!');
    expect(props.onConfirm).toHaveBeenCalledWith({ keepGiven: true });
  });

  it('forgets the choice when it is opened again', async () => {
    const { keep, flip, update } = await render();
    await flip(true);
    await update({ visible: false });
    await update({ visible: true });
    expect(keep().props.value).toBe(false);
  });

  it('closes on "Not yet" without confirming', async () => {
    const { press, props } = await render();
    await press('Not yet');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('waits while the hand-off runs: nothing can be tapped twice or dismissed', async () => {
    const { tree, props } = await render({ busy: true });
    const yes = tree.root.find(n => n.props.accessibilityLabel === 'Yes, we swapped!' && typeof n.props.onPress === 'function');
    const notYet = tree.root.find(n => n.props.accessibilityLabel === 'Not yet' && typeof n.props.onPress === 'function');
    expect(yes.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(notYet.props.accessibilityState).toMatchObject({ disabled: true });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', async () => {
    const { tree } = await render({ visible: false });
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
  });
});

describe('joinNames', () => {
  it('joins in plain words', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['  A ', '', 'B'])).toBe('A and B');
  });
});
