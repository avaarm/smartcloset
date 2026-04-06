/**
 * Badge — small pill used for tags, categories, statuses.
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../styles/ThemeProvider';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const Badge: React.FC<BadgeProps> = ({
  label,
  tone = 'neutral',
  leftIcon,
  style,
}) => {
  const { theme } = useTheme();

  const toneMap: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: theme.colors.muted,          fg: theme.colors.text,      border: theme.colors.border },
    accent:  { bg: theme.colors.accent,         fg: theme.colors.accentText, border: theme.colors.accent },
    success: { bg: theme.colors.successSubtle,  fg: theme.colors.success,   border: 'transparent' },
    warning: { bg: theme.colors.warningSubtle,  fg: theme.colors.warning,   border: 'transparent' },
    danger:  { bg: theme.colors.dangerSubtle,   fg: theme.colors.danger,    border: 'transparent' },
    info:    { bg: theme.colors.infoSubtle,     fg: theme.colors.info,      border: 'transparent' },
  };

  const c = toneMap[tone];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          borderRadius: theme.radius.full,
        },
        style,
      ]}
    >
      {leftIcon ? <View style={{ marginRight: 4 }}>{leftIcon}</View> : null}
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default Badge;
