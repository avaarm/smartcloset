/**
 * Web shim for @react-native-community/datetimepicker.
 * Renders a native HTML <input type="date"> or <input type="time">.
 */

import React from 'react';

type Props = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange?: (event: any, date?: Date) => void;
  [key: string]: any;
};

const DateTimePicker: React.FC<Props> = ({ value, mode = 'date', onChange }) => {
  const type = mode === 'time' ? 'time' : 'date';
  const formatted =
    type === 'date'
      ? value.toISOString().split('T')[0]
      : value.toTimeString().slice(0, 5);

  return (
    <input
      type={type}
      value={formatted}
      onChange={e => {
        const newDate = new Date(e.target.value);
        if (!isNaN(newDate.getTime())) {
          onChange?.({ type: 'set', nativeEvent: { timestamp: newDate.getTime() } }, newDate);
        }
      }}
      style={{
        fontSize: 16,
        padding: '8px 12px',
        border: '1px solid #E7E5E4',
        borderRadius: 8,
        outline: 'none',
      }}
    />
  );
};

export default DateTimePicker;
