import React from 'react';
import ChipSelect from './ChipSelect';
import { WARDROBE_FOR_OPTIONS, type WardrobeFor } from '../services/wardrobeAudience';

type Props = {
  value: WardrobeFor | null;
  onChange: (value: WardrobeFor) => void;
};

/** Women's, Men's or Both: who the wardrobe is for. Nothing is lit until the person has answered. */
export default function WardrobeForPicker({ value, onChange }: Props) {
  return (
    <ChipSelect<WardrobeFor>
      accessibilityLabel="This wardrobe is for"
      value={value}
      options={WARDROBE_FOR_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
      onChange={v => v && onChange(v)}
    />
  );
}
