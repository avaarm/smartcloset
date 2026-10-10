/**
 * IncludeResaleToggle — the "Include resale" switch under a product search.
 *
 * Search puts shops first. Second-hand listings (eBay, Poshmark, Depop...) are
 * left out once there are enough shop results, unless this is on.
 */

import React from 'react';
import { StyleProp, StyleSheet, Switch, Text, View, ViewStyle } from 'react-native';
import theme from '../styles/theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Overrides the default margins (made for a full-width screen with no padding). */
  style?: StyleProp<ViewStyle>;
};

const IncludeResaleToggle: React.FC<Props> = ({ value, onValueChange, style }) => (
  <View style={[styles.row, style]}>
    <View style={styles.text}>
      <Text style={styles.title}>Include resale</Text>
      <Text style={styles.hint}>eBay, Poshmark, Depop and other second-hand sites</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: theme.colors.accent }}
      accessibilityLabel="Include resale listings"
    />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  hint: { fontSize: 12, marginTop: 1, color: theme.colors.mediumGray },
});

export default IncludeResaleToggle;
