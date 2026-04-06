/**
 * Input — labeled text input with focus state, helper, and error.
 */

import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from '../styles/ThemeProvider';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  helper?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextInputProps['style']>;
};

export const Input: React.FC<InputProps> = ({
  label,
  helper,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...rest
}) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
    ? theme.colors.focusRing
    : theme.colors.border;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" color="muted" style={{ marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.md,
            paddingHorizontal: 12,
          },
        ]}
      >
        {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
        <TextInput
          {...rest}
          placeholderTextColor={theme.colors.textSubtle}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              fontSize: 15,
            },
            inputStyle,
          ]}
        />
        {rightIcon ? <View style={{ marginLeft: 8 }}>{rightIcon}</View> : null}
      </View>

      {error ? (
        <Text variant="caption" color="danger" style={{ marginTop: 6 }}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="subtle" style={{ marginTop: 6 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 44,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
});

export default Input;
