/**
 * Web shim for react-native-vector-icons/Ionicons.
 *
 * Instead of loading the full icon font, renders a simple placeholder span
 * with the icon name. This avoids font-loading complexity during dev.
 * For production, swap to a proper icon solution (e.g., @expo/vector-icons,
 * or load the Ionicons font via CSS @font-face).
 */

import React from 'react';
import { Text } from 'react-native';

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: any;
};

// Minimal SVG-based icon map for the most commonly used icons in the app.
// Falls back to a bullet character for unknown icons.
const ICON_MAP: Record<string, string> = {
  'home-outline': '\u2302',
  'shirt-outline': '\u{1F455}',
  'albums-outline': '\u25A3',
  'heart-outline': '\u2661',
  'person-outline': '\u263A',
  'settings-outline': '\u2699',
  'search-outline': '\u{1F50D}',
  'add': '+',
  'add-circle-outline': '\u2295',
  'arrow-back': '\u2190',
  'chevron-forward': '\u203A',
  'close': '\u2715',
  'close-circle': '\u2297',
  'camera-outline': '\u{1F4F7}',
  'image-outline': '\u{1F5BC}',
  'options-outline': '\u2630',
  'refresh-outline': '\u21BB',
  'stats-chart-outline': '\u{1F4CA}',
  'grid-outline': '\u25A6',
  'people-outline': '\u{1F465}',
  'sparkles-outline': '\u2728',
  'chatbubbles-outline': '\u{1F4AC}',
  'calendar-outline': '\u{1F4C5}',
  'person-circle-outline': '\u{1F464}',
  'partly-sunny-outline': '\u26C5',
  'bookmark-outline': '\u{1F516}',
  'checkmark': '\u2713',
  'checkmark-circle': '\u2714',
  'ellipsis-vertical': '\u22EE',
  'trash-outline': '\u{1F5D1}',
  'create-outline': '\u270F',
  'eye-outline': '\u{1F441}',
  'location-outline': '\u{1F4CD}',
  'time-outline': '\u{1F552}',
  'star': '\u2605',
  'star-outline': '\u2606',
};

const Icon: React.FC<IconProps> = ({ name, size = 24, color = '#000', style }) => (
  <Text
    style={[
      {
        fontSize: size * 0.75,
        color,
        lineHeight: size,
        width: size,
        height: size,
        textAlign: 'center',
      },
      style,
    ]}
    accessibilityLabel={name}
  >
    {ICON_MAP[name] || '\u25CF'}
  </Text>
);

export default Icon;
