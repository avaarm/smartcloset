/**
 * Card — a rounded, subtly-shadowed surface.
 * Works as the primitive for lists, dashboards, details.
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../styles/ThemeProvider';

export type CardProps = {
  children: React.ReactNode;
  padding?: number;                  // inner padding (defaults to 16)
  bordered?: boolean;                // outline style instead of shadow
  elevated?: boolean;                // stronger shadow
  style?: StyleProp<ViewStyle>;
};

export const Card: React.FC<CardProps> = ({
  children,
  padding = 16,
  bordered = false,
  elevated = false,
  style,
}) => {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding,
          borderWidth: bordered ? 1 : 0,
          borderColor: theme.colors.border,
        },
        !bordered && (elevated ? theme.shadows.medium : theme.shadows.card),
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {},
});

export default Card;
