/**
 * ChipGroup: a titled row of word chips for the quick inputs on the item rating card ("Hand feel", "How it
 * wears", "Fit"). Each chip is one tap: the host decides what a tap does (the card saves it at once).
 *
 * A group can cap how many words may be chosen; once the cap is reached the other chips dim and a one-line hint
 * says how to make room. The chips never hold a choice themselves, so what is lit is always what the host holds.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../styles/theme';

export const CHIP_LIMIT_HINT = 'Up to four. Tap a chosen word to remove it.';

export interface ChipGroupProps<T extends string> {
  /** Shown above the chips: "Hand feel". */
  title: string;
  options: readonly T[];
  labelOf: (option: T) => string;
  selected: readonly T[];
  onToggle: (option: T) => void;
  /** How many may be chosen at once. Left out, any number may be (a single choice is swapped by the host). */
  max?: number;
  /** Spoken before the word, so a chip never has the same name as one in the full rating sheet: "Rate hand feel". */
  actionLabel: string;
  /** Taps are ignored (a save is running); the chips keep their look. */
  busy?: boolean;
}

export function ChipGroup<T extends string>({
  title,
  options,
  labelOf,
  selected,
  onToggle,
  max,
  actionLabel,
  busy,
}: ChipGroupProps<T>) {
  const full = max !== undefined && selected.length >= max;
  return (
    <View style={styles.group}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chips}>
        {options.map(option => {
          const on = selected.includes(option);
          const dimmed = full && !on;
          const label = labelOf(option);
          return (
            <Pressable
              key={option}
              onPress={() => onToggle(option)}
              disabled={busy || dimmed}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel}: ${label}`}
              accessibilityState={{ selected: on, disabled: !!busy || dimmed }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.chip, on && styles.chipOn, dimmed && styles.chipDim]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {full ? <Text style={styles.hint}>{CHIP_LIMIT_HINT}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 16 },
  title: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.cardBackground,
  },
  chipOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipDim: { opacity: 0.4 },
  chipText: { fontSize: 13, color: theme.colors.text },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  hint: { marginTop: 6, fontSize: 12, color: theme.colors.textMuted },
});
