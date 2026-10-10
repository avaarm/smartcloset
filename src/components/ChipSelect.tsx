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

type MultiProps<T extends string> = {
  options: ChipOption<T>[];
  /** Which chips are lit; the caller decides, so a chip like "All" can stand for several. */
  selected: readonly T[];
  onToggle: (value: T) => void;
  accessibilityLabel?: string;
};

const GOLD = '#C4975A';

type ChipProps = {
  label: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
};

function Chip({ label, selected, role, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A wrapping row of tappable chips for picking one value. Replaces the iOS
 * scroll-wheel picker, which needs a lot of vertical space to be usable.
 * The row has no outer margin: the form around it sets the spacing.
 */
function ChipSelect<T extends string>({ options, value, onChange, allowClear = false, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <Chip
            key={opt.value}
            label={opt.label}
            selected={selected}
            role="radio"
            onPress={() => {
              if (selected) {
                if (allowClear) onChange(null);
                return;
              }
              onChange(opt.value);
            }}
          />
        );
      })}
    </View>
  );
}

/** Same look as ChipSelect, for fields where several chips can be on at once. */
export function ChipMultiSelect<T extends string>({ options, selected, onToggle, accessibilityLabel }: MultiProps<T>) {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map(opt => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={selected.includes(opt.value)}
          role="checkbox"
          onPress={() => onToggle(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
