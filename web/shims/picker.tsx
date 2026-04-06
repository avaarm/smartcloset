/**
 * Web shim for @react-native-picker/picker.
 * Renders a native HTML <select>.
 */

import React from 'react';

type PickerProps = {
  selectedValue?: any;
  onValueChange?: (value: any, index: number) => void;
  children?: React.ReactNode;
  style?: any;
  enabled?: boolean;
  [key: string]: any;
};

type ItemProps = {
  label: string;
  value: any;
  [key: string]: any;
};

const PickerItem: React.FC<ItemProps> = () => null; // rendered by parent

const Picker: React.FC<PickerProps> & { Item: React.FC<ItemProps> } = ({
  selectedValue,
  onValueChange,
  children,
  style,
  enabled = true,
}) => {
  const items: { label: string; value: any }[] = [];
  React.Children.forEach(children, (child: any) => {
    if (child?.props) {
      items.push({ label: child.props.label, value: child.props.value });
    }
  });

  return (
    <select
      value={selectedValue}
      disabled={!enabled}
      onChange={e => {
        const idx = e.target.selectedIndex;
        onValueChange?.(items[idx]?.value, idx);
      }}
      style={{
        fontSize: 16,
        padding: '8px 12px',
        border: '1px solid #E7E5E4',
        borderRadius: 8,
        outline: 'none',
        backgroundColor: '#fff',
        ...style,
      }}
    >
      {items.map((item, i) => (
        <option key={i} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
};

Picker.Item = PickerItem;

export { Picker };
export default Picker;
