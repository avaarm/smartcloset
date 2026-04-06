/**
 * Text — typographically-aware text component.
 *
 * Pre-configured variants for the 21st-dev-style typography scale.
 * Screens should use <Text variant="h2"> instead of raw <Text> + style props.
 */

import React from 'react';
import {
  StyleProp,
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';
import { useTheme } from '../styles/ThemeProvider';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bodyLarge'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'overline';

export type TextColor = 'primary' | 'muted' | 'subtle' | 'inverse' | 'accent' | 'danger' | 'success';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: TextColor;
  weight?: '400' | '500' | '600' | '700';
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<TextStyle>;
};

const variantStyles: Record<TextVariant, TextStyle> = {
  display:   { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  h1:        { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  h2:        { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  h3:        { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  h4:        { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1 },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  body:      { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  bodySmall: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  caption:   { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  label:     { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
  overline:  { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
};

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  color = 'primary',
  weight,
  align,
  style,
  children,
  ...rest
}) => {
  const { theme } = useTheme();

  const colorMap: Record<TextColor, string> = {
    primary: theme.colors.text,
    muted: theme.colors.textMuted,
    subtle: theme.colors.textSubtle,
    inverse: theme.colors.textInverse,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    success: theme.colors.success,
  };

  return (
    <RNText
      {...rest}
      style={[
        variantStyles[variant],
        { color: colorMap[color] },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

export default Text;
