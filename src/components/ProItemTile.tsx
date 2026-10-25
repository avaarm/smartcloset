/**
 * ProItemTile — one square tile of a grid of pieces (a client's shared closet, a look's pieces, the picker).
 *
 * The photo is a ProPhoto element passed in, so the tile knows no path, id or link. It is drawn to fill the square.
 * A tile with `selected` set (true or false) is a checkbox for a selectable grid; one without is a plain button
 * when it has `onPress` and a labelled picture otherwise. Callers supply the accessibility label because only they
 * know what the tile stands for ("Blue denim jacket, selected"). The tile has no navigation and no menu.
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';

export type ProItemTileProps = {
  name: string;
  subtitle?: string;
  photo?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
};

const fillPhoto: StyleProp<ViewStyle> = { width: '100%', height: '100%' };

/** A ProPhoto element is told to fill the square, so a caller that gave it no size still gets a picture. */
const filled = (photo: React.ReactNode): React.ReactNode => {
  if (!React.isValidElement(photo) || photo.type === React.Fragment) return photo;
  const own = (photo.props as { style?: unknown }).style;
  return React.cloneElement(photo as React.ReactElement<{ style?: unknown }>, { style: [fillPhoto, own] });
};

export const ProItemTile: React.FC<ProItemTileProps> = ({
  name,
  subtitle,
  photo,
  selected,
  onPress,
  accessibilityLabel,
}) => {
  const { theme } = useTheme();
  const isSelected = selected === true;

  const content = (
    <>
      <View
        style={[
          styles.square,
          {
            backgroundColor: theme.colors.muted,
            borderRadius: theme.radius.lg,
            borderColor: isSelected ? theme.colors.accent : 'transparent',
          },
        ]}
      >
        {photo ? (
          filled(photo)
        ) : (
          <View style={styles.empty}>
            <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
          </View>
        )}
        {isSelected ? (
          <View style={[styles.check, { backgroundColor: theme.colors.accent }]}>
            <Icon name="checkmark" size={14} color={theme.colors.accentText} />
          </View>
        ) : null}
      </View>
      <Text variant="bodySmall" weight="600" numberOfLines={1} style={styles.name}>{name}</Text>
      {subtitle ? <Text variant="caption" color="muted" numberOfLines={1}>{subtitle}</Text> : null}
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  const selectable = selected !== undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selectable ? { checked: isSelected } : undefined}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  square: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderWidth: 2,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: 6 },
});

export default ProItemTile;
