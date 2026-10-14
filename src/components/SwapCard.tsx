/**
 * SwapCard — one piece on the swap rack: a 4:5 photo, its condition, name, "Brand, Size" and who
 * is offering it.
 *
 * The menu button (report or block) is a sibling of the card button, not a child of it: a button
 * inside another accessible button cannot be reached by VoiceOver. The board puts the card in a
 * half-width cell, so the card itself has no width of its own.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import type { SwapListing } from '../types/swap';
import { conditionLabel } from '../utils/itemCondition';
import { ownerLine } from '../utils/swapFormat';
import SwapPhoto from './SwapPhoto';

export type SwapCardProps = {
  listing: SwapListing;
  /** Open the piece. */
  onPress: () => void;
  /** Open the report and block menu for the member offering it. */
  onMenu: () => void;
};

/** "Brand, Size", or whichever of the two there is; empty when neither is known. */
const brandAndSize = (l: Pick<SwapListing, 'brand' | 'size'>): string =>
  [l.brand, l.size].filter(Boolean).join(', ');

export const SwapCard: React.FC<SwapCardProps> = ({ listing, onPress, onMenu }) => {
  const { theme } = useTheme();
  const condition = conditionLabel(listing.condition);
  const details = brandAndSize(listing);
  const owner = ownerLine(listing);

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${listing.name}`}
        accessibilityValue={{ text: [details, condition, owner].filter(Boolean).join('. ') }}
      >
        <View style={[styles.photoWrap, { backgroundColor: theme.colors.muted, borderRadius: theme.radius.lg }]}>
          <SwapPhoto path={listing.photoPath} style={styles.photo} />
          {condition ? (
            <View style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1}>{condition}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="bodySmall" weight="600" numberOfLines={1} style={styles.name}>
          {listing.name}
        </Text>
        {details ? (
          <Text variant="caption" color="muted" numberOfLines={1}>{details}</Text>
        ) : null}
        <Text variant="caption" color="subtle" numberOfLines={1} style={styles.owner}>{owner}</Text>
      </Pressable>
      <Pressable
        onPress={onMenu}
        hitSlop={6}
        style={styles.menu}
        accessibilityRole="button"
        accessibilityLabel={`Report or block ${listing.ownerLabel}`}
      >
        <Icon name="ellipsis-horizontal" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  photoWrap: {
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  pill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '80%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  name: {
    marginTop: 8,
  },
  owner: {
    marginTop: 2,
  },
  menu: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});

export default SwapCard;
