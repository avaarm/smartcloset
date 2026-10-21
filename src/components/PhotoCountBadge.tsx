/**
 * A small "photos" pill for the corner of a card's picture: how many photos the item has.
 * Shows nothing for an item with one photo (or none). Sits in the bottom-right corner, which the cards
 * leave free (season badge top-left, edit/delete buttons top-right, colour-match dot bottom-left).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  count: number;
  /** The small pill for the three-across grid. */
  compact?: boolean;
};

const PhotoCountBadge: React.FC<Props> = ({ count, compact = false }) => {
  if (!(count > 1)) return null;
  return (
    <View
      testID="photo-count-badge"
      accessible
      accessibilityLabel={`${count} photos`}
      pointerEvents="none"
      style={[styles.badge, compact && styles.badgeCompact]}
    >
      <Icon name="images" size={compact ? 9 : 11} color="#FFFFFF" />
      <Text style={[styles.text, compact && styles.textCompact]} allowFontScaling={false}>
        {count}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  // 4pt in from the corner like the other overlays; short enough to leave the middle of a ~95pt photo clear.
  badgeCompact: {
    bottom: 4,
    right: 4,
    gap: 2,
    paddingHorizontal: 5,
    height: 16,
    borderRadius: 8,
  },
  text: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  textCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
});

export default PhotoCountBadge;
