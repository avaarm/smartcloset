/**
 * The search box with a Search button, and the one-tap words under results: the Return key and the button
 * both search, a blank box searches nothing, and the text searched is the one the keyboard reports.
 */
import 'react-native';
import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import RefineSearchBar from '../../src/components/RefineSearchBar';
import RefineChips from '../../src/components/RefineChips';

let tree: renderer.ReactTestRenderer;
const onChangeText = jest.fn();
const onSubmit = jest.fn();

const mount = (value: string, extra: Partial<React.ComponentProps<typeof RefineSearchBar>> = {}) => {
  const el = (
    <RefineSearchBar
      value={value}
      onChangeText={onChangeText}
      onSubmit={onSubmit}
      placeholder="Add words"
      accessibilityLabel="Words"
      {...extra}
    />
  );
  act(() => {
    if (tree) tree.update(el);
    else tree = renderer.create(el);
  });
};
const input = () => tree.root.findByType(TextInput);
const button = (label: string) =>
  tree.root.find(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const hasButton = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;

beforeEach(() => {
  jest.clearAllMocks();
  tree = undefined as any;
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('RefineSearchBar', () => {
  it('shows the placeholder and the value, with the field named for screen readers', () => {
    mount('black');
    expect(input().props.placeholder).toBe('Add words');
    expect(input().props.value).toBe('black');
    expect(input().props.accessibilityLabel).toBe('Words');
  });

  it('has a Return key that reads Search, closes the keyboard and does not correct the words', () => {
    mount('black');
    expect(input().props.returnKeyType).toBe('search');
    expect(input().props.blurOnSubmit).toBe(true);
    expect(input().props.autoCorrect).toBe(false);
    expect(input().props.autoCapitalize).toBe('none');
  });

  it('searches the value from the Return key', () => {
    mount('black leather');
    act(() => input().props.onSubmitEditing());
    expect(onSubmit).toHaveBeenCalledWith('black leather');
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });

  it('searches the text the keyboard reports, and brings the box up to date with it', () => {
    mount('black');
    act(() => input().props.onSubmitEditing({ nativeEvent: { text: 'black jacket' } }));
    expect(onSubmit).toHaveBeenCalledWith('black jacket');
    expect(onChangeText).toHaveBeenCalledWith('black jacket');
  });

  it('searches nothing for a blank box, from the key or the button', () => {
    mount('   ');
    act(() => input().props.onSubmitEditing());
    act(() => button('Search').props.onPress());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('has a Search button that searches the value and closes the keyboard', () => {
    mount('white sneakers');
    expect(button('Search').props.disabled).toBe(false);
    act(() => button('Search').props.onPress());
    expect(onSubmit).toHaveBeenCalledWith('white sneakers');
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });

  it('disables the button while the box is blank', () => {
    mount('');
    expect(button('Search').props.disabled).toBe(true);
    expect(button('Search').props.accessibilityState.disabled).toBe(true);
    mount('x');
    expect(button('Search').props.disabled).toBe(false);
  });

  it('can label the button differently', () => {
    mount('x', { buttonLabel: 'Refine' });
    expect(hasButton('Refine')).toBe(true);
    expect(hasButton('Search')).toBe(false);
  });

  it('clears the text with a button that exists only while there is text', () => {
    mount('');
    expect(hasButton('Clear text')).toBe(false);
    mount('black');
    act(() => button('Clear text').props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('passes the text typed on', () => {
    mount('');
    act(() => input().props.onChangeText('bl'));
    expect(onChangeText).toHaveBeenCalledWith('bl');
  });
});

describe('RefineChips', () => {
  const pick = jest.fn();

  it('shows each word capitalised, as a button that names what it does', () => {
    act(() => {
      tree = renderer.create(<RefineChips words={['black', 'leather']} onPick={pick} />);
    });
    expect(JSON.stringify(tree.toJSON())).toContain('"Black"');
    expect(hasButton('Narrow down to black')).toBe(true);
    expect(hasButton('Narrow down to leather')).toBe(true);
  });

  it('hands back the word as it was given', () => {
    act(() => {
      tree = renderer.create(<RefineChips words={['black']} onPick={pick} />);
    });
    act(() => button('Narrow down to black').props.onPress());
    expect(pick).toHaveBeenCalledWith('black');
  });

  it('shows nothing without words', () => {
    act(() => {
      tree = renderer.create(<RefineChips words={[]} onPick={pick} />);
    });
    expect(tree.toJSON()).toBeNull();
  });
});
