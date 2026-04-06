/**
 * ColorSwatch — circular color dot. Used in body profile palettes, outfit cards.
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../styles/ThemeProvider';

export type ColorSwatchProps = {
  color: string;
  label?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export const ColorSwatch: React.FC<ColorSwatchProps> = ({
  color,
  label,
  size = 32,
  style,
}) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      />
      {label ? (
        <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});

export default ColorSwatch;
