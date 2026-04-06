/**
 * Web shim for react-native-linear-gradient.
 * Renders a View with a CSS linear-gradient background.
 */

import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

type LinearGradientProps = ViewProps & {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: number[];
  children?: React.ReactNode;
};

const LinearGradient: React.FC<LinearGradientProps> = ({
  colors,
  start,
  end,
  locations,
  style,
  children,
  ...rest
}) => {
  const angle =
    start && end
      ? `${Math.round(Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) + 90)}deg`
      : '180deg';

  const stops = colors
    .map((c, i) => {
      const pct = locations?.[i] != null ? `${locations[i] * 100}%` : '';
      return `${c} ${pct}`.trim();
    })
    .join(', ');

  return (
    <View
      style={[
        style,
        // @ts-ignore — backgroundImage is valid on web
        { backgroundImage: `linear-gradient(${angle}, ${stops})` },
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

export default LinearGradient;
