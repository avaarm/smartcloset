/**
 * Button — the one button component. Four variants, three sizes.
 *
 * Variants:
 *   primary     — solid accent background, inverse text
 *   secondary   — surface background with border
 *   ghost       — transparent, accent text
 *   destructive — solid danger background
 *
 * Sizes:
 *   sm | md (default) | lg
 *
 * Composes from src/styles/tokens via useTheme so it reacts to light/dark.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../styles/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

const sizeMap = {
  sm: { paddingV: 8, paddingH: 14, fontSize: 13, minHeight: 36, iconGap: 6 },
  md: { paddingV: 12, paddingH: 18, fontSize: 15, minHeight: 44, iconGap: 8 },
  lg: { paddingV: 16, paddingH: 22, fontSize: 16, minHeight: 52, iconGap: 10 },
} as const;

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const sz = sizeMap[size];
  const isDisabled = disabled || loading;

  const palettes: Record<
    ButtonVariant,
    { bg: string; bgPressed: string; text: string; border: string; borderWidth: number }
  > = {
    primary: {
      bg: theme.colors.accent,
      bgPressed: theme.colors.accentHover,
      text: theme.colors.accentText,
      border: theme.colors.accent,
      borderWidth: 0,
    },
    secondary: {
      bg: theme.colors.surface,
      bgPressed: theme.colors.muted,
      text: theme.colors.text,
      border: theme.colors.border,
      borderWidth: 1,
    },
    ghost: {
      bg: 'transparent',
      bgPressed: theme.colors.muted,
      text: theme.colors.text,
      border: 'transparent',
      borderWidth: 0,
    },
    destructive: {
      bg: theme.colors.danger,
      bgPressed: '#B91C1C',
      text: '#FFFFFF',
      border: theme.colors.danger,
      borderWidth: 0,
    },
  };

  const p = palettes[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && !isDisabled ? p.bgPressed : p.bg,
          borderColor: p.border,
          borderWidth: p.borderWidth,
          paddingVertical: sz.paddingV,
          paddingHorizontal: sz.paddingH,
          minHeight: sz.minHeight,
          borderRadius: theme.radius.lg,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={p.text} />
      ) : (
        <View style={[styles.row, { gap: sz.iconGap }]}>
          {leftIcon ? <View>{leftIcon}</View> : null}
          <Text
            style={[
              {
                color: p.text,
                fontSize: sz.fontSize,
                fontWeight: '600',
                letterSpacing: -0.2,
              },
              textStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {rightIcon ? <View>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default Button;
