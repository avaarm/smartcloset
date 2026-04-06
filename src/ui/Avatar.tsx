/**
 * Avatar — circular user image with initials fallback.
 */

import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../styles/ThemeProvider';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type AvatarProps = {
  name?: string;
  source?: { uri: string } | number;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
};

const sizeMap: Record<AvatarSize, { dim: number; font: number }> = {
  xs: { dim: 24, font: 10 },
  sm: { dim: 32, font: 12 },
  md: { dim: 40, font: 14 },
  lg: { dim: 56, font: 18 },
  xl: { dim: 80, font: 26 },
};

const initials = (name?: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
};

export const Avatar: React.FC<AvatarProps> = ({ name, source, size = 'md', style }) => {
  const { theme } = useTheme();
  const { dim, font } = sizeMap[size];

  return (
    <View
      style={[
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: theme.colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {source ? (
        <Image source={source} style={styles.image} />
      ) : (
        <Text
          style={{
            fontSize: font,
            fontWeight: '700',
            color: theme.colors.textMuted,
            letterSpacing: 0.2,
          }}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});

export default Avatar;
