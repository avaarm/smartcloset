/**
 * ChoiceChip: one tappable chip for the pickers of the Add/Edit item form (size, style, the words of a rating).
 * It looks like the chips of ChipSelect but takes its own accessibility label, so a chip that reads "8" can be
 * announced as "Numeric (US) 8" and a style as "Style: Casual" without changing the text on the chip.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import theme from '../styles/theme';

export interface ChoiceChipProps {
  label: string;
  /**
   * Read out instead of `label`; leave out when the label alone says it. Not called accessibilityLabel on purpose:
   * the Pressable inside is then the only element that carries it, which is what tests look for.
   */
  a11yLabel?: string;
  selected: boolean;
  /** radio: one of several, checkbox: any number of them. */
  role?: 'radio' | 'checkbox';
  disabled?: boolean;
  /** A tighter chip for long rows of short words (sizes). */
  compact?: boolean;
  onPress: () => void;
}

const ChoiceChip: React.FC<ChoiceChipProps> = ({
  label,
  a11yLabel,
  selected,
  role = 'radio',
  disabled,
  compact,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole={role}
    accessibilityLabel={a11yLabel ?? label}
    accessibilityState={role === 'radio' ? { selected, disabled: !!disabled } : { checked: selected, disabled: !!disabled }}
    hitSlop={4}
    style={[styles.chip, compact && styles.compact, selected && styles.chipSelected, disabled && styles.chipDisabled]}
  >
    <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
  </Pressable>
);

export default ChoiceChip;

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E6E3',
    backgroundColor: '#FFFFFF',
  },
  compact: { minHeight: 38, minWidth: 44, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipDisabled: { opacity: 0.4 },
  label: { fontSize: 15, color: '#1A1A1A', fontWeight: '500' },
  labelSelected: { color: '#FFFFFF', fontWeight: '600' },
});
