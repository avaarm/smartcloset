import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export type ChipOption<T extends string> = { label: string; value: T };

type Props<T extends string> = {
  options: ChipOption<T>[];
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  /** Tapping the selected chip again clears it (for optional fields). */
  allowClear?: boolean;
  accessibilityLabel?: string;
};

const GOLD = '#C4975A';

/**
 * A wrapping row of tappable chips for picking one value. Replaces the iOS
 * scroll-wheel picker, which needs a lot of vertical space to be usable.
 */
function ChipSelect<T extends string>({ options, value, onChange, allowClear = false, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (selected) {
                if (allowClear) onChange(null);
                return;
              }
              onChange(opt.value);
            }}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
            hitSlop={4}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E6E3',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: { backgroundColor: GOLD, borderColor: GOLD },
  label: { fontSize: 15, color: '#1A1A1A', fontWeight: '500' },
  labelSelected: { color: '#FFFFFF', fontWeight: '600' },
});

export default ChipSelect;
