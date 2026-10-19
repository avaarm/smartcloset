/**
 * StylePicker: the look of a piece on Add/Edit item (casual, classic, boho...), as chips of which any number can be
 * on. It only reports which styles are chosen; the screen keeps them in the item's tags (see utils/styleOptions).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { STYLE_LABELS, STYLE_OPTIONS, type ItemStyle } from '../utils/styleOptions';
import ChoiceChip from './ChoiceChip';

export interface StylePickerProps {
  selected: readonly ItemStyle[];
  onToggle: (style: ItemStyle) => void;
}

const StylePicker: React.FC<StylePickerProps> = ({ selected, onToggle }) => (
  <View style={styles.row} accessibilityLabel="Style">
    {STYLE_OPTIONS.map(style => (
      <ChoiceChip
        key={style}
        role="checkbox"
        label={STYLE_LABELS[style]}
        a11yLabel={`Style: ${STYLE_LABELS[style]}`}
        selected={selected.includes(style)}
        onPress={() => onToggle(style)}
      />
    ))}
  </View>
);

export default StylePicker;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
