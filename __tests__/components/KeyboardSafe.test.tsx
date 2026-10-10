import 'react-native';
import React from 'react';
import { InputAccessoryView, Keyboard, Platform, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import {
  KEYBOARD_DONE_ID,
  KeyboardActionBar,
  KeyboardDoneBar,
  KeyboardSafeScrollView,
  KeyboardSafeView,
  keyboardDoneProps,
  singleLineDoneProps,
} from '../../src/components/KeyboardSafe';

afterEach(() => jest.restoreAllMocks());

describe('KeyboardSafe', () => {
  it('Done bar closes the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<KeyboardDoneBar />);
    });
    const done = tree.root.find(n => n.props.accessibilityLabel === 'Done' && typeof n.props.onPress === 'function');
    await act(async () => {
      done.props.onPress();
    });
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('an input opts in with keyboardDoneProps and points at the same accessory id', async () => {
    expect(Platform.OS).toBe('ios');
    expect(keyboardDoneProps.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <>
          <TextInput {...keyboardDoneProps} />
          <KeyboardDoneBar />
        </>,
      );
    });
    expect(tree.root.findByType(TextInput).props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(tree.root.findByType(InputAccessoryView).props.nativeID).toBe(KEYBOARD_DONE_ID);
  });

  it('single-line fields get a Done return key that closes the keyboard', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    expect(singleLineDoneProps.returnKeyType).toBe('done');
    expect(singleLineDoneProps.blurOnSubmit).toBe(true);
    singleLineDoneProps.onSubmitEditing();
    expect(dismiss).toHaveBeenCalled();
  });

  it('form scroll view keeps buttons tappable, adjusts for the keyboard and dismisses on drag', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<KeyboardSafeScrollView />);
    });
    const sv = tree.root.findByType(require('react-native').ScrollView);
    expect(sv.props.keyboardShouldPersistTaps).toBe('handled');
    expect(sv.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(sv.props.keyboardDismissMode).toBe('interactive');
  });

  it('non-scrolling views lift above the keyboard', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<KeyboardSafeView />);
    });
    const kav = tree.root.findByType(require('react-native').KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
  });

  it('an action bar runs its own action instead of just closing the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<KeyboardActionBar nativeID="x-save" label="Save" onPress={onPress} />);
    });
    expect(tree.root.findByType(InputAccessoryView).props.nativeID).toBe('x-save');
    const btn = tree.root.find(n => n.props.accessibilityLabel === 'Save' && typeof n.props.onPress === 'function');
    await act(async () => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
