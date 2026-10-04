/**
 * LoadError — shown when a load failed, so a network problem never reads as
 * "you have nothing yet".
 *
 *   full   — replaces a screen's content when there is nothing to show
 *   banner — sits above data that is still on screen (a refresh failed)
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';

type LoadErrorProps = {
  /** What failed, as it reads in "Couldn't load your <what>". */
  what: string;
  /** Called by "Try again". Should not throw; the button shows busy until it settles. */
  onRetry: () => void | Promise<unknown>;
  variant?: 'full' | 'banner';
  /** Overrides the default "Couldn't load your <what>" heading. */
  title?: string;
};

const LoadError: React.FC<LoadErrorProps> = ({ what, onRetry, variant = 'full', title }) => {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const heading = title ?? `Couldn't load your ${what}`;
  const body = 'Check your connection and try again.';
  const retryLabel = `Try again to load your ${what}`;

  if (variant === 'banner') {
    return (
      <View
        style={[
          styles.banner,
          { backgroundColor: theme.colors.warningSubtle, borderRadius: theme.radius.lg },
        ]}
      >
        <Icon name="alert-circle-outline" size={20} color={theme.colors.warning} />
        <View style={styles.bannerText}>
          <Text variant="bodySmall" weight="600">
            {heading}
          </Text>
          <Text variant="caption" color="muted">
            {body}
          </Text>
        </View>
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          loading={busy}
          onPress={retry}
          style={styles.center}
          accessibilityLabel={retryLabel}
        />
      </View>
    );
  }

  return (
    <View style={styles.full}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: theme.colors.muted, borderRadius: theme.radius.full },
        ]}
      >
        <Icon name="cloud-offline-outline" size={32} color={theme.colors.textSubtle} />
      </View>
      <Text variant="h3" align="center" style={{ marginTop: 20 }}>
        {heading}
      </Text>
      <Text variant="body" color="muted" align="center" style={styles.fullBody}>
        {body}
      </Text>
      <Button
        label="Try again"
        variant="primary"
        size="md"
        loading={busy}
        onPress={retry}
        style={[styles.center, { marginTop: 20 }]}
        accessibilityLabel={retryLabel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  full: {
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
  fullBody: {
    marginTop: 8,
    maxWidth: 320,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: {
    flex: 1,
  },
  // Button defaults to alignSelf: flex-start, which would pin it left/top.
  center: {
    alignSelf: 'center',
  },
});

export default LoadError;
