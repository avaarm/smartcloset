/**
 * Keyboard helpers shared by every screen with text inputs.
 *
 * Two problems they solve:
 *  1. The keyboard covered the field being typed in (and the buttons below it).
 *     KeyboardSafeScrollView scrolls the focused field above the keyboard and
 *     keeps buttons tappable while it is open; KeyboardSafeView does the same
 *     for screens and sheets that don't scroll.
 *  2. Number pads and multi-line fields have no Return key, so there was no way
 *     to close the keyboard. KeyboardDoneBar adds a "Done" bar above the keyboard;
 *     give the input `{...keyboardDoneProps}` and render <KeyboardDoneBar /> once
 *     in the screen.
 */

import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';

export const KEYBOARD_DONE_ID = 'smartcloset-keyboard-done';

/** Spread onto a TextInput to show the Done bar above its keyboard (iOS). */
export const keyboardDoneProps: { inputAccessoryViewID?: string } =
  Platform.OS === 'ios' ? { inputAccessoryViewID: KEYBOARD_DONE_ID } : {};

/** Props for a single-line field: the Return key reads "Done" and closes the keyboard. */
export const singleLineDoneProps = {
  returnKeyType: 'done' as const,
  blurOnSubmit: true,
  onSubmitEditing: () => Keyboard.dismiss(),
};

/** Render once per screen that uses keyboardDoneProps. Renders nothing off iOS. */
export const KeyboardDoneBar: React.FC = () => {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
};

/**
 * A ScrollView for forms. The focused field is scrolled into view above the
 * keyboard, taps on buttons work while the keyboard is up, and dragging the
 * content down closes the keyboard.
 */
export const KeyboardSafeScrollView = React.forwardRef<ScrollView, ScrollViewProps>(
  ({ contentContainerStyle, ...rest }, ref) => (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={contentContainerStyle}
      {...rest}
    />
  ),
);
KeyboardSafeScrollView.displayName = 'KeyboardSafeScrollView';

/** For screens and sheets that don't scroll: lifts the content above the keyboard. */
export const KeyboardSafeView: React.FC<ViewProps & { keyboardVerticalOffset?: number }> = ({
  style,
  keyboardVerticalOffset = 0,
  ...rest
}) => (
  <KeyboardAvoidingView
    style={[styles.fill, style]}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={keyboardVerticalOffset}
    {...rest}
  />
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F2F0EC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8D2C8',
  },
  done: { fontSize: 16, fontWeight: '600', color: '#9A6F2E' },
});
