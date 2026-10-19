/**
 * SizePicker: the size of a piece on Add/Edit item. One labelled group of chips for each way a size is written for
 * the category (Letter, Numeric (US), Waist, Shoe (US)...), and a small field for anything the chips don't offer.
 *
 * The size stays one short string: a chip writes its text, a tap on the lit chip clears it, and the field writes
 * what is typed (20 characters at most, like every size). The title and spacing come from the screen's FormSection.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ClothingCategory } from '../types/clothing';
import theme from '../styles/theme';
import { isOfferedSize, sizeGroupsFor, sizeNoun } from '../utils/sizeOptions';
import ChoiceChip from './ChoiceChip';
import { singleLineDoneProps } from './KeyboardSafe';

export const MAX_SIZE_LENGTH = 20;
export const OTHER_SIZE_LABEL = 'Other size';

export interface SizePickerProps {
  category: ClothingCategory | string | undefined;
  value: string;
  onChange: (next: string) => void;
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

const SizePicker: React.FC<SizePickerProps> = ({ category, value, onChange }) => {
  const groups = sizeGroupsFor(category);
  const noun = sizeNoun(category);

  // A chip lights in the first group that has the size, so a size two groups share is never lit twice.
  const litGroup = isOfferedSize(category, value) ? groups.findIndex(g => g.sizes.some(s => same(s, value))) : -1;

  // The field keeps what was typed (so "xl" is not wiped the moment it matches a chip) and follows the size when a
  // chip or a scan changes it from outside.
  const [other, setOther] = useState(() => (isOfferedSize(category, value) ? '' : value));
  useEffect(() => {
    setOther(current => (same(current, value) ? current : isOfferedSize(category, value) ? '' : value));
  }, [category, value]);

  return (
    <View style={styles.wrap}>
      {groups.map((group, groupIndex) => (
        <View key={group.label} accessibilityRole="radiogroup" accessibilityLabel={`${noun}: ${group.label}`}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.chips}>
            {group.sizes.map(size => {
              const selected = groupIndex === litGroup && same(size, value);
              return (
                <ChoiceChip
                  key={size}
                  compact
                  label={size}
                  a11yLabel={size === group.label ? size : `${group.label} ${size}`}
                  selected={selected}
                  onPress={() => onChange(selected ? '' : size)}
                />
              );
            })}
          </View>
        </View>
      ))}
      <View>
        <Text style={styles.groupLabel}>{OTHER_SIZE_LABEL}</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel={OTHER_SIZE_LABEL}
          placeholder="e.g. EU 38 or W30 L32"
          placeholderTextColor={theme.colors.textMuted}
          value={other}
          onChangeText={text => {
            const next = text.slice(0, MAX_SIZE_LENGTH);
            setOther(next);
            onChange(next);
          }}
          maxLength={MAX_SIZE_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          {...singleLineDoneProps}
        />
      </View>
    </View>
  );
};

export default SizePicker;

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  groupLabel: {
    fontSize: 12,
    color: '#8B8B8B',
    marginBottom: 6,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    color: theme.colors.text,
    backgroundColor: '#ffffff',
  },
});
