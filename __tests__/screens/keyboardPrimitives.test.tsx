/**
 * The shared pieces the keyboard fixes are built on: Input forwards what a
 * screen sets on it, a scrollable Screen is keyboard-safe, KeyboardLift grows a
 * bottom sheet by the keyboard's height, and the list props are what a search
 * screen needs.
 */
import 'react-native';
import React from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { Input } from '../../src/ui/Input';
import { Screen } from '../../src/ui/Screen';
import { KEYBOARD_DONE_ID, keyboardDoneProps } from '../../src/components/KeyboardSafe';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { keyboardListProps } from '../../src/utils/keyboardListProps';

afterEach(() => jest.restoreAllMocks());

describe('Input', () => {
  it('forwards the Done bar, Return key and submit handler to the text field', async () => {
    const onSubmit = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Input {...keyboardDoneProps} returnKeyType="send" onSubmitEditing={onSubmit} multiline />);
    });
    const field = tree.root.findByType(TextInput);
    expect(field.props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(field.props.returnKeyType).toBe('send');
    expect(field.props.onSubmitEditing).toBe(onSubmit);
  });

  it('hands its ref to the text field so a screen can move focus to it', async () => {
    const ref = React.createRef<TextInput>();
    await act(async () => {
      renderer.create(<Input ref={ref} />);
    });
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current!.focus).toBe('function');
  });

  it('keeps the text of a tall field at the top', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Input multiline />);
    });
    const style = StyleSheet.flatten(tree.root.findByType(TextInput).props.style);
    expect(style.textAlignVertical).toBe('top');
  });
});

describe('Screen', () => {
  it('scrolls above the keyboard when it is scrollable', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Screen scrollable>
          <Text>form</Text>
        </Screen>,
      );
    });
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
  });

  it('adds no scroll view when it is not scrollable', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Screen>
          <Text>plain</Text>
        </Screen>,
      );
    });
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
  });
});

describe('KeyboardLift', () => {
  const setup = async () => {
    const handlers: Record<string, (e: any) => void> = {};
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: (e: any) => void) => {
      handlers[name] = cb;
      return { remove };
    }) as any);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <KeyboardLift style={{ padding: 4 }} testID="lift">
          <Text>sheet</Text>
        </KeyboardLift>,
      );
    });
    const paddingBottom = () =>
      StyleSheet.flatten(tree.root.findByProps({ testID: 'lift' }).findByType(View).props.style).paddingBottom;
    return { handlers, remove, tree, paddingBottom };
  };

  it('pads the sheet by the part of the screen the keyboard covers, and drops it again on hide', async () => {
    const { handlers, paddingBottom } = await setup();
    const screen = Dimensions.get('window').height;
    expect(paddingBottom()).toBe(0);

    await act(async () => handlers.keyboardWillChangeFrame({ duration: 250, endCoordinates: { screenY: screen - 336, height: 336 } }));
    expect(paddingBottom()).toBe(336);

    await act(async () => handlers.keyboardWillChangeFrame({ duration: 250, endCoordinates: { screenY: screen, height: 336 } }));
    expect(paddingBottom()).toBe(0);
  });

  it('keeps the style it is given and stops listening when it goes away', async () => {
    const { tree, remove } = await setup();
    const view = tree.root.findByProps({ testID: 'lift' }).findByType(View);
    expect(StyleSheet.flatten(view.props.style).padding).toBe(4);
    act(() => tree.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('keyboardListProps', () => {
  it('keeps rows tappable, scrolls clear of the keyboard and closes it on drag', () => {
    expect(keyboardListProps.keyboardShouldPersistTaps).toBe('handled');
    expect(keyboardListProps.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(keyboardListProps.keyboardDismissMode).toBe('interactive');
  });
});
