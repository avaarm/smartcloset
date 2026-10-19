/**
 * RefineChips — one-tap words to narrow the results on screen ("black", "leather", "vintage").
 * Tapping one adds it to the search; see useProductSearch.addWord.
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../styles/ThemeProvider';

type Props = {
  words: readonly string[];
  onPick: (word: string) => void;
  /** Margins around the row; the row itself has none. */
  style?: StyleProp<ViewStyle>;
};

const RefineChips: React.FC<Props> = ({ words, onPick, style }) => {
  const { theme } = useTheme();
  if (words.length === 0) return null;
  return (
    <View style={[styles.row, style]}>
      {words.map(word => (
        <Pressable
          key={word}
          onPress={() => onPick(word)}
          accessibilityRole="button"
          accessibilityLabel={`Narrow down to ${word}`}
          style={({ pressed }) => [
            styles.chip,
            { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.muted : 'transparent' },
          ]}
        >
          <Text style={[styles.label, { color: theme.colors.text }]}>{word.charAt(0).toUpperCase() + word.slice(1)}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: '500' },
});

export default RefineChips;
