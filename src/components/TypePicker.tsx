import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { ClothingCategory } from '../types/clothing';
import ChipSelect from './ChipSelect';
import { singleLineDoneProps } from './KeyboardSafe';
import { isKnownType, typeLabelsFor } from '../utils/clothingTypes';

const OTHER = '__other__';

type Props = {
  category: ClothingCategory;
  /** The saved type: a label from the menu, free text, or '' for none. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * Picks the specific kind of item within its category ("Tote", "Ankle boots",
 * "Belt"). Tapping the lit chip again clears it, and "Other" opens a field for a
 * type that is not on the menu.
 */
export default function TypePicker({ category, value, onChange }: Props) {
  const labels = typeLabelsFor(category);
  const known = isKnownType(category, value);
  const [otherOpen, setOtherOpen] = useState(!!value && !known);

  // A type typed in by hand arrives with the value (a saved item, a detection):
  // show it in the field. A category change that empties the value closes it.
  useEffect(() => {
    if (value && !known) setOtherOpen(true);
  }, [value, known]);

  const selected = known ? labels.find(l => l.toLowerCase() === value.trim().toLowerCase()) ?? null : otherOpen ? OTHER : null;
  const options = [...labels.map(l => ({ label: l, value: l })), { label: 'Other', value: OTHER }];

  return (
    <View>
      <ChipSelect<string>
        accessibilityLabel="Type"
        value={selected}
        allowClear
        options={options}
        onChange={next => {
          if (next === OTHER) {
            setOtherOpen(true);
            if (known) onChange('');
            return;
          }
          if (next === null) {
            setOtherOpen(false);
            onChange('');
            return;
          }
          setOtherOpen(false);
          onChange(next);
        }}
      />
      {otherOpen && (
        <TextInput
          style={styles.input}
          accessibilityLabel="Type of item"
          placeholder="What kind of item is it? e.g. Fedora"
          value={known ? '' : value}
          onChangeText={text => onChange(text.slice(0, 60))}
          maxLength={60}
          autoCapitalize="sentences"
          {...singleLineDoneProps}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    backgroundColor: '#ffffff',
  },
});
