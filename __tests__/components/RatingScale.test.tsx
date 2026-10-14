/**
 * RatingScale (documentation/design/quality-ratings.md, 6.2): select, clear, read-only, and what a screen reader
 * gets (one adjustable element with a value, plus increment and decrement). A scale that saves on tap turns the
 * adjustable element off (`adjustable={false}`), so a screen reader picks a mark instead of stepping a value.
 */
import 'react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import RatingScale, { scaleStepLabel, type RatingScaleProps } from '../../src/components/RatingScale';
import { OVERALL_LABELS, TOUCH_LABELS, type Score } from '../../src/config/ratingVocabulary';

const LABEL = 'Overall rating';

const flatten = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join(' ');
  }
  return flatten(node.children);
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const mount = (props: Partial<RatingScaleProps> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<RatingScale value={null} accessibilityLabel={LABEL} {...props} />);
  });
  const marks = () => tree.root.findAllByType(Pressable);
  const mark = (step: Score) => marks().find(m => m.props.accessibilityLabel === scaleStepLabel(LABEL, step))!;
  const root = (): ReactTestInstance =>
    tree.root.findAllByType(View).find(v => v.props.accessibilityLabel === LABEL && v.props.accessible === true)!;
  const icons = () => tree.root.findAll(n => (n.type as unknown) === 'Icon').map(n => n.props.name as string);
  const action = (actionName: string) => act(() => root().props.onAccessibilityAction({ nativeEvent: { actionName } }));
  return { tree, marks, mark, root, icons, action, text: () => flatten(tree.toJSON()) };
};

describe('RatingScale', () => {
  describe('select', () => {
    it('shows five marks and reports the one that is tapped', () => {
      const onChange = jest.fn();
      const { marks, mark } = mount({ onChange });
      expect(marks()).toHaveLength(5);
      act(() => mark(4).props.onPress());
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(4);
    });

    it('names each mark for a screen reader', () => {
      const { marks } = mount({ onChange: jest.fn() });
      expect(marks().map(m => m.props.accessibilityLabel)).toEqual([
        'Overall rating, 1 of 5',
        'Overall rating, 2 of 5',
        'Overall rating, 3 of 5',
        'Overall rating, 4 of 5',
        'Overall rating, 5 of 5',
      ]);
      expect(marks().every(m => m.props.accessibilityRole === 'button')).toBe(true);
    });

    it('marks the chosen value as selected', () => {
      const { mark } = mount({ value: 3, onChange: jest.fn() });
      expect(mark(3).props.accessibilityState).toEqual({ selected: true });
      expect(mark(2).props.accessibilityState).toEqual({ selected: false });
    });

    it('fills the stars up to the value and leaves the rest outlined', () => {
      const { icons } = mount({ value: 3, onChange: jest.fn() });
      expect(icons()).toEqual(['star', 'star', 'star', 'star-outline', 'star-outline']);
    });

    it('draws outlined stars only when there is no value', () => {
      const { icons } = mount({ value: null, onChange: jest.fn() });
      expect(icons()).toEqual(['star-outline', 'star-outline', 'star-outline', 'star-outline', 'star-outline']);
    });

    it('draws dots, not stars, for the dots variant', () => {
      const { icons, marks } = mount({ variant: 'dots', value: 2, onChange: jest.fn() });
      expect(icons()).toEqual([]);
      expect(marks()).toHaveLength(5);
    });

    it('does not repeat itself when the selected value is tapped again without allowClear', () => {
      const onChange = jest.fn();
      const onClear = jest.fn();
      const { mark } = mount({ value: 3, onChange, onClear });
      act(() => mark(3).props.onPress());
      expect(onChange).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('can change from one value to another', () => {
      const onChange = jest.fn();
      const { mark } = mount({ value: 2, onChange });
      act(() => mark(5).props.onPress());
      expect(onChange).toHaveBeenCalledWith(5);
    });
  });

  describe('clear', () => {
    it('clears on a second tap of the selected value when allowClear is on', () => {
      const onChange = jest.fn();
      const onClear = jest.fn();
      const { mark } = mount({ value: 4, onChange, onClear, allowClear: true });
      act(() => mark(4).props.onPress());
      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('still selects a different value when allowClear is on', () => {
      const onChange = jest.fn();
      const onClear = jest.fn();
      const { mark } = mount({ value: 4, onChange, onClear, allowClear: true });
      act(() => mark(2).props.onPress());
      expect(onChange).toHaveBeenCalledWith(2);
      expect(onClear).not.toHaveBeenCalled();
    });

    it('does nothing on a second tap when there is no onClear to tell', () => {
      const onChange = jest.fn();
      const { mark } = mount({ value: 4, onChange, allowClear: true });
      expect(() => act(() => mark(4).props.onPress())).not.toThrow();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('read-only', () => {
    it('has no tap targets and never calls back', () => {
      const onChange = jest.fn();
      const { marks, icons, root } = mount({ value: 4, onChange, readOnly: true });
      expect(marks()).toHaveLength(0);
      expect(icons()).toEqual(['star', 'star', 'star', 'star', 'star-outline']);
      expect(root().props.accessibilityActions).toBeUndefined();
      expect(root().props.onAccessibilityAction).toBeUndefined();
      expect(root().props.accessibilityRole).not.toBe('adjustable');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('is also read-only when there is nothing to call', () => {
      const { marks, root } = mount({ value: 2 });
      expect(marks()).toHaveLength(0);
      expect(root().props.accessibilityActions).toBeUndefined();
    });

    it('still tells a screen reader the value', () => {
      const { root } = mount({ value: 4, readOnly: true, valueLabels: OVERALL_LABELS });
      expect(root().props.accessibilityValue).toEqual({ min: 1, max: 5, now: 4, text: '4 of 5, Good' });
    });
  });

  describe('accessibility', () => {
    it('is one adjustable element with the label and the value', () => {
      const { root } = mount({ value: 3, onChange: jest.fn(), valueLabels: OVERALL_LABELS });
      expect(root().props.accessible).toBe(true);
      expect(root().props.accessibilityRole).toBe('adjustable');
      expect(root().props.accessibilityLabel).toBe(LABEL);
      expect(root().props.accessibilityValue).toEqual({ min: 1, max: 5, now: 3, text: '3 of 5, Okay' });
      expect(root().props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
    });

    it('says "Not set" and gives no current value when empty', () => {
      const { root } = mount({ value: null, onChange: jest.fn() });
      expect(root().props.accessibilityValue).toEqual({ min: 1, max: 5, now: undefined, text: 'Not set' });
    });

    it('gives the value without a word when there are no value labels', () => {
      const { root } = mount({ value: 2, onChange: jest.fn() });
      expect(root().props.accessibilityValue.text).toBe('2 of 5');
    });

    it('explains what the ends mean without starting a sentence with "From"', () => {
      const { root } = mount({ value: 2, onChange: jest.fn(), endLabels: ['Rough', 'Lovely to touch'] });
      expect(root().props.accessibilityHint).toBe('1 is Rough, 5 is Lovely to touch');
    });

    it('increments from nothing to 1, then one step at a time, and stops at 5', () => {
      const onChange = jest.fn();
      const first = mount({ value: null, onChange });
      first.action('increment');
      expect(onChange).toHaveBeenLastCalledWith(1);

      const second = mount({ value: 3, onChange });
      second.action('increment');
      expect(onChange).toHaveBeenLastCalledWith(4);

      onChange.mockClear();
      const last = mount({ value: 5, onChange });
      last.action('increment');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('decrements one step at a time', () => {
      const onChange = jest.fn();
      const { action } = mount({ value: 3, onChange });
      action('decrement');
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('does not decrement when empty, and not below 1', () => {
      const onChange = jest.fn();
      const onClear = jest.fn();
      mount({ value: null, onChange, onClear, allowClear: true }).action('decrement');
      mount({ value: 1, onChange, onClear }).action('decrement');
      expect(onChange).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    });

    it('lets a screen reader clear an optional scale by lowering it below 1', () => {
      const onChange = jest.fn();
      const onClear = jest.fn();
      mount({ value: 1, onChange, onClear, allowClear: true }).action('decrement');
      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores actions it does not know', () => {
      const onChange = jest.fn();
      mount({ value: 3, onChange }).action('activate');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('not adjustable (a scale that saves on tap)', () => {
    const OPTIONS = { onChange: jest.fn(), adjustable: false, valueLabels: OVERALL_LABELS } as const;
    /** The grouping element the scale leaves un-focusable. */
    const wrapper = (tree: renderer.ReactTestRenderer) =>
      tree.root.findAllByType(View).find(v => v.props.accessible === false)!;

    it('has no adjustable element and no step action for a screen reader', () => {
      for (const variant of ['stars', 'dots'] as const) {
        const { tree } = mount({ ...OPTIONS, variant, value: null, endLabels: ['Low', 'High'] });
        expect(tree.root.findAllByType(View).filter(v => v.props.accessibilityRole === 'adjustable')).toHaveLength(0);
        expect(tree.root.findAll(n => n.props.onAccessibilityAction !== undefined)).toHaveLength(0);
        expect(tree.root.findAll(n => n.props.accessibilityActions !== undefined)).toHaveLength(0);
      }
    });

    it('does not group the marks: the wrapper is not one accessible element and says nothing itself', () => {
      const { tree } = mount({ ...OPTIONS, value: 3, endLabels: ['Low', 'High'] });
      const box = wrapper(tree);
      expect(box).toBeDefined();
      expect(box.props.accessible).toBe(false);
      expect(box.props.accessibilityRole).toBeUndefined();
      expect(box.props.accessibilityLabel).toBeUndefined();
      expect(box.props.accessibilityHint).toBeUndefined();
      expect(box.props.accessibilityValue).toBeUndefined();
      expect(box.props.accessibilityActions).toBeUndefined();
      expect(box.props.onAccessibilityAction).toBeUndefined();
      // Nothing else is grouped either: the only focusable elements are the five marks (each Pressable's own view).
      const focusable = tree.root.findAllByType(View).filter(v => v.props.accessible === true);
      expect(focusable).toHaveLength(5);
      expect(focusable.every(v => v.props.accessibilityRole === 'button')).toBe(true);
    });

    it('keeps five labelled buttons, one per mark', () => {
      const { marks } = mount({ ...OPTIONS, value: null });
      expect(marks()).toHaveLength(5);
      expect(marks().map(m => m.props.accessibilityLabel)).toEqual([1, 2, 3, 4, 5].map(n => scaleStepLabel(LABEL, n as Score)));
      expect(marks().every(m => m.props.accessibilityRole === 'button')).toBe(true);
    });

    it('still reports the mark that is tapped, and only then', () => {
      const onChange = jest.fn();
      const { mark } = mount({ ...OPTIONS, onChange, value: null });
      expect(onChange).not.toHaveBeenCalled();
      act(() => mark(4).props.onPress());
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(4);
    });

    it('is the same as before when read-only: one text element with the value', () => {
      const { tree, marks, root } = mount({ ...OPTIONS, value: 4, readOnly: true });
      expect(marks()).toHaveLength(0);
      expect(tree.root.findAllByType(View).filter(v => v.props.accessible === true)).toHaveLength(1);
      expect(root().props.accessibilityRole).toBe('text');
      expect(root().props.accessibilityLabel).toBe(LABEL);
      expect(root().props.accessibilityValue).toEqual({ min: 1, max: 5, now: 4, text: '4 of 5, Good' });
      expect(root().props.accessibilityActions).toBeUndefined();
      expect(root().props.onAccessibilityAction).toBeUndefined();
    });

    it('is also read-only when there is nothing to call', () => {
      const { root, marks } = mount({ adjustable: false, value: 2, valueLabels: OVERALL_LABELS });
      expect(marks()).toHaveLength(0);
      expect(root().props.accessibilityRole).toBe('text');
      expect(root().props.accessibilityValue.text).toBe('2 of 5, Fair');
    });

    it('leaves the default alone: a scale is adjustable unless it says otherwise', () => {
      const { root } = mount({ value: 3, onChange: jest.fn() });
      expect(root().props.accessibilityRole).toBe('adjustable');
      const explicit = mount({ value: 3, onChange: jest.fn(), adjustable: true });
      expect(explicit.root().props.accessibilityRole).toBe('adjustable');
      expect(explicit.root().props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
    });
  });

  describe('labels', () => {
    it('shows the word for the chosen value, and nothing when empty', () => {
      expect(mount({ value: 5, valueLabels: OVERALL_LABELS }).text()).toContain('Excellent');
      expect(mount({ value: null, valueLabels: OVERALL_LABELS }).text()).not.toContain('Excellent');
      expect(mount({ value: null, valueLabels: OVERALL_LABELS }).tree.root.findAllByType(Text)).toHaveLength(0);
    });

    it('shows the labels under the two ends', () => {
      const { tree } = mount({ variant: 'dots', value: 4, endLabels: [TOUCH_LABELS[1], TOUCH_LABELS[5]], valueLabels: TOUCH_LABELS });
      const texts = tree.root.findAllByType(Text).map(t => flatten(t.props.children));
      expect(texts).toEqual(['Rough', 'Lovely to touch', 'Soft']);
    });

    it('shows no label rows when none are given', () => {
      expect(mount({ value: 3, onChange: jest.fn() }).tree.root.findAllByType(Text)).toHaveLength(0);
    });
  });

  describe('touch targets', () => {
    it('gives every tap target at least 44 points each way', () => {
      for (const variant of ['stars', 'dots'] as const) {
        for (const size of ['sm', 'md', 'lg'] as const) {
          const { marks } = mount({ variant, size, onChange: jest.fn() });
          for (const m of marks()) {
            const style = StyleSheet.flatten(m.props.style);
            expect(style.minHeight).toBeGreaterThanOrEqual(44);
            // Stars have a fixed width; dots share the row, so each is at least a fifth of it.
            if (variant === 'stars') {
              expect(style.width).toBeGreaterThanOrEqual(44);
            } else {
              expect(style.flex).toBe(1);
            }
          }
        }
      }
    });

    it('draws bigger stars for bigger sizes', () => {
      const sizes = (['sm', 'md', 'lg'] as const).map(size => {
        const { tree } = mount({ size, value: 1, readOnly: true });
        return tree.root.findAll(n => (n.type as unknown) === 'Icon')[0].props.size as number;
      });
      expect(sizes[0]).toBeLessThan(sizes[1]);
      expect(sizes[1]).toBeLessThan(sizes[2]);
    });
  });
});
