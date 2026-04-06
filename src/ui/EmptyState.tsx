/**
 * EmptyState — shown when a list has no items.
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { useTheme } from '../styles/ThemeProvider';

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  style,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {icon ? (
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: theme.colors.muted,
              borderRadius: theme.radius.full,
            },
          ]}
        >
          {icon}
        </View>
      ) : null}
      <Text variant="h3" align="center" style={{ marginTop: icon ? 20 : 0 }}>
        {title}
      </Text>
      {body ? (
        <Text
          variant="body"
          color="muted"
          align="center"
          style={{ marginTop: 8, maxWidth: 320 }}
        >
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={{ marginTop: 20 }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EmptyState;
