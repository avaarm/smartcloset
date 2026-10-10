/**
 * One line under the Wardrobe title: what the whole wardrobe is worth, and how
 * many pieces that adds up. Always the whole wardrobe, whatever a search or
 * filter is showing below.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { formatMoney } from '../utils/itemValue';
import { itemCountLabel } from '../utils/itemCountLabel';

/** Kept to one line so the strip does not take back the room the compact cards save. */
export const TOTAL_STRIP_HEIGHT = 36;

type Props = {
  /** Sum of the owned items' values, in dollars. */
  total: number;
  /** How many owned items it adds up. */
  count: number;
};

const WardrobeTotalStrip: React.FC<Props> = ({ total, count }) => {
  const { theme } = useTheme();
  const money = formatMoney(total);

  // Spoken whole: the "$" and the thousands commas read badly, and the strip is one element.
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Total wardrobe value ${money.replace('$', '')} dollars`}
      style={[styles.strip, { backgroundColor: theme.colors.accentSubtle, borderRadius: theme.radius.md }]}
    >
      <View style={styles.value}>
        <Text variant="label" color="muted" numberOfLines={1}>Total value</Text>
        <Text variant="h4" numberOfLines={1} style={styles.amount}>{money}</Text>
      </View>
      <Text variant="caption" color="muted" numberOfLines={1}>{itemCountLabel(count)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    height: TOTAL_STRIP_HEIGHT,
    marginTop: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  value: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  amount: {
    flexShrink: 1,
  },
});

export default WardrobeTotalStrip;
