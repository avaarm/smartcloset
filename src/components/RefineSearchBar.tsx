/**
 * RefineSearchBar — the search box with a Search button beside it, used for typing a
 * product search and for adding words to a photo's results.
 *
 * Searches from the Return key and from the button. An empty box does nothing. The text
 * searched is the one the keyboard reports, so a word still being completed is not lost.
 */

import React, { useRef } from 'react';
import {
  Keyboard,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  /** Called with the words to search for, when they are not blank. */
  onSubmit: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Text of the button beside the box. Default "Search". */
  buttonLabel?: string;
  autoFocus?: boolean;
  /** Margins around the bar; the bar itself has none. */
  style?: StyleProp<ViewStyle>;
};

const RefineSearchBar: React.FC<Props> = ({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  buttonLabel = 'Search',
  autoFocus,
  style,
}) => {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const canSearch = value.trim().length > 0;

  const submit = (text: string) => {
    Keyboard.dismiss();
    if (text !== value) onChangeText(text);
    if (text.trim()) onSubmit(text);
  };

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.box, { backgroundColor: theme.colors.muted }]}>
        <Icon name="search" size={18} color={theme.colors.textSubtle} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSubtle}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={e => submit(e?.nativeEvent?.text ?? value)}
          returnKeyType="search"
          blurOnSubmit
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel}
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => {
              onChangeText('');
              inputRef.current?.focus();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear text"
          >
            <Icon name="close-circle" size={18} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => submit(value)}
        disabled={!canSearch}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        accessibilityState={{ disabled: !canSearch }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.colors.accent, opacity: !canSearch ? 0.4 : pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.colors.accentText }]}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});

export default RefineSearchBar;
