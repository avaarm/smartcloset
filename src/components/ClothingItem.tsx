import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable, Alert, Animated, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ClothingItem as ClothingItemType } from '../types';
import theme from '../styles/theme';
import type { BodyProfile } from '../services/profileService';
import { getColorMatch } from './clothingColorMatch';
import { COMPACT_DETAILS, GRID_LAYOUTS, gridCardWidth } from '../utils/clothingGrid';
import { categoryLabel } from '../utils/clothingOptions';

// The label alone is a short line of text; this brings the tap target to iOS's 44pt.
const MOVE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// The compact edit/delete buttons are drawn 26pt; this brings each to a 32pt touch target.
// The 6pt gap between them is exactly twice the slop, so the two targets meet without overlapping.
const COMPACT_ACTION_HIT_SLOP = { top: 3, bottom: 3, left: 3, right: 3 };

interface Props {
  item: ClothingItemType;
  /** Loaded once by the screen; the card must not fetch it itself (one query per card). */
  bodyProfile?: BodyProfile | null;
  onEdit?: (item: ClothingItemType) => void;
  onDelete?: (id: string) => void;
  onPress?: (item: ClothingItemType) => void;
  /** Wishlist only: adds a "Move to wardrobe" button under the details. */
  onMoveToWardrobe?: (item: ClothingItemType) => void;
  showActions?: boolean;
  /** 'compact': a small three-across card for the Wardrobe (square photo, one-line text). */
  variant?: 'default' | 'compact';
}

const ClothingItem: React.FC<Props> = ({
  item,
  bodyProfile,
  onEdit,
  onDelete,
  onPress,
  onMoveToWardrobe,
  showActions = false,
  variant = 'default',
}) => {
  const compact = variant === 'compact';
  const [scaleAnim] = useState(new Animated.Value(1));
  const [imageError, setImageError] = useState(false);
  // Read per render, not at module load, so the card follows the real window.
  const { width: windowWidth } = useWindowDimensions();
  useEffect(() => {
    setImageError(false);
  }, [item.userImage, item.retailerImage]);
  const colorMatch = getColorMatch(bodyProfile, item.color);

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(item.id)
        }
      ]
    );
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (onPress) {
      onPress(item);
    }
  };

  const cardLabel = [item.name, categoryLabel(item.category), item.brand].filter(Boolean).join(', ');
  const metaLine = [categoryLabel(item.category), item.brand].filter(Boolean).join(' · ');
  const imageStyle = compact ? styles.imageSquare : styles.image;
  const colorMatchText = colorMatch === 'match' ? 'Great color for you' : 'Outside your palette';
  const colorMatchColor = colorMatch === 'match' ? '#2E8B57' : '#E57373';

  const photo = imageError || !(item.userImage || item.retailerImage) ? (
    <View style={[imageStyle, styles.imagePlaceholder]}>
      <Icon name="shirt-outline" size={compact ? 28 : 44} color="#C8BBA6" />
    </View>
  ) : (
    <Image
      source={{ uri: item.userImage || item.retailerImage }}
      style={imageStyle}
      resizeMode="cover"
      onError={() => setImageError(true)}
    />
  );

  // The card itself is not an accessibility element: VoiceOver can't reach a
  // button nested inside one. The photo and details are the element for the
  // card, and the buttons sit beside it. An explicit width, too: left to its
  // content, a long product title (real shop titles run to 80+ characters)
  // stretched the card past its grid cell.
  return (
    <Animated.View
      testID="clothing-card"
      accessible={false}
      style={[
        styles.container,
        compact && styles.containerCompact,
        { width: gridCardWidth(windowWidth, variant), transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={!onPress}
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={cardLabel}
        // The compact card shows the match as a bare dot; this is what the dot says.
        accessibilityValue={compact && colorMatch ? { text: colorMatchText } : undefined}
      >
        {compact ? (
          <View>
            {photo}
            {colorMatch ? (
              <View
                style={[
                  styles.colorMatchDotCompact,
                  // Filled = in your palette, hollow ring = outside it, so the two differ by shape
                  // as well as colour (red and green look alike to some people).
                  colorMatch === 'match'
                    ? { backgroundColor: colorMatchColor }
                    : { backgroundColor: '#FFFFFF', borderColor: colorMatchColor, borderWidth: 2 },
                ]}
              />
            ) : null}
          </View>
        ) : (
          photo
        )}
        {item.season && item.season.length > 0 && (
          <View style={[styles.seasonBadge, compact && styles.seasonBadgeCompact]}>
            <Icon name="sunny-outline" size={compact ? 10 : 12} color="#FFFFFF" />
          </View>
        )}
        {compact ? (
          <View style={styles.detailsCompact}>
            <Text style={styles.nameCompact} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.metaCompact} numberOfLines={1}>{metaLine}</Text>
          </View>
        ) : (
          <View style={styles.details}>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.category} numberOfLines={1}>{categoryLabel(item.category)}</Text>
            {item.brand ? <Text style={styles.brand} numberOfLines={1}>{item.brand}</Text> : null}
            {colorMatch && (
              <View style={styles.colorMatchRow}>
                <View style={[styles.colorMatchDot, { backgroundColor: colorMatchColor }]} />
                <Text style={styles.colorMatchText} numberOfLines={1}>{colorMatchText}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
      {showActions && (
        <View style={[styles.actionsContainer, compact && styles.actionsContainerCompact]}>
          <TouchableOpacity
            style={[styles.actionButton, compact && styles.actionButtonCompact, styles.editButton]}
            onPress={() => onEdit?.(item)}
            hitSlop={compact ? COMPACT_ACTION_HIT_SLOP : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Icon name="pencil" size={compact ? 13 : 16} color={theme.colors.cardBackground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, compact && styles.actionButtonCompact, styles.deleteButton]}
            onPress={handleDelete}
            hitSlop={compact ? COMPACT_ACTION_HIT_SLOP : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Icon name="trash" size={compact ? 13 : 16} color={theme.colors.cardBackground} />
          </TouchableOpacity>
        </View>
      )}
      {onMoveToWardrobe && (
        <TouchableOpacity
          style={styles.moveButton}
          onPress={() => onMoveToWardrobe(item)}
          hitSlop={MOVE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Move ${item.name} to your wardrobe`}
        >
          <Icon name="checkmark-circle-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.moveButtonText} numberOfLines={1}>Move to wardrobe</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.medium,
    margin: GRID_LAYOUTS.default.margin,
    // Fill the grid row's height, so cards side by side end on the same edge
    // however many lines their names and brands take.
    alignSelf: 'stretch',
    ...theme.shadows.card,
  },
  containerCompact: {
    margin: GRID_LAYOUTS.compact.margin,
    borderRadius: theme.borderRadius.small,
  },
  // Takes the height the card has left, which holds the Move button at the
  // bottom edge of every card in a row.
  main: {
    flexGrow: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  // A ratio rather than a fixed height, so the photo keeps its proportions on
  // every screen width. Cover crops a tall shot top and bottom, never squashes it.
  image: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderTopLeftRadius: theme.borderRadius.medium,
    borderTopRightRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.mutedBackground,
  },
  imageSquare: {
    width: '100%',
    aspectRatio: 1,
    borderTopLeftRadius: theme.borderRadius.small,
    borderTopRightRadius: theme.borderRadius.small,
    backgroundColor: theme.colors.mutedBackground,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCompact: {
    padding: COMPACT_DETAILS.padding,
  },
  // Explicit line heights: the grid's row-height arithmetic (clothingGrid) counts on them.
  nameCompact: {
    fontSize: theme.typography.fontSize.small,
    lineHeight: COMPACT_DETAILS.nameLine,
    fontWeight: '600',
    color: theme.colors.text,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  metaCompact: {
    marginTop: COMPACT_DETAILS.gap,
    fontSize: theme.typography.fontSize.tiny,
    lineHeight: COMPACT_DETAILS.metaLine,
    color: theme.colors.mediumGray,
  },
  details: {
    padding: theme.spacing.small,
  },
  name: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: '600',
    marginBottom: theme.spacing.tiny,
    color: theme.colors.text,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  category: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.normal,
  },
  brand: {
    fontSize: theme.typography.fontSize.tiny,
    color: theme.colors.accent,
    marginTop: theme.spacing.tiny,
    letterSpacing: theme.typography.letterSpacing.normal,
    textTransform: 'uppercase',
  },
  actionsContainer: {
    position: 'absolute',
    top: theme.spacing.small,
    right: theme.spacing.small,
    flexDirection: 'row',
    gap: theme.spacing.tiny,
  },
  // 4pt in from the card edge, so the buttons' touch slop stays inside the card.
  actionsContainerCompact: {
    top: 4,
    right: 4,
    gap: 6,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.subtle,
  },
  actionButtonCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  editButton: {
    backgroundColor: theme.colors.accent,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  seasonBadge: {
    position: 'absolute',
    top: theme.spacing.small,
    left: theme.spacing.small,
    backgroundColor: theme.colors.accent,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.subtle,
  },
  seasonBadgeCompact: {
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  // Bottom-left of the photo, ringed in white so it reads on any picture.
  colorMatchDotCompact: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  colorMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  colorMatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colorMatchText: {
    flexShrink: 1,
    fontSize: 10,
    color: theme.colors.mediumGray,
    letterSpacing: 0.2,
  },
  moveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.lightGray,
  },
  moveButtonText: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.tiny,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});

// Memoized: the grid re-renders on every search keystroke, and the screen passes stable handlers.
export default React.memo(ClothingItem);
