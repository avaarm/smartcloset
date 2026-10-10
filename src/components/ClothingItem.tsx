import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable, Alert, Animated, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ClothingItem as ClothingItemType } from '../types';
import theme from '../styles/theme';
import type { BodyProfile } from '../services/profileService';
import { getColorMatch } from './clothingColorMatch';
import { CARD_MARGIN, gridCardWidth } from '../utils/clothingGrid';
import { categoryLabel } from '../utils/clothingOptions';

// The label alone is a short line of text; this brings the tap target to iOS's 44pt.
const MOVE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

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
}

const ClothingItem: React.FC<Props> = ({
  item,
  bodyProfile,
  onEdit,
  onDelete,
  onPress,
  onMoveToWardrobe,
  showActions = false,
}) => {
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

  // The card itself is not an accessibility element: VoiceOver can't reach a
  // button nested inside one. The photo and details are the element for the
  // card, and the buttons sit beside it. An explicit width, too: left to its
  // content, a long product title (real shop titles run to 80+ characters)
  // stretched the card past its grid cell.
  return (
    <Animated.View
      testID="clothing-card"
      accessible={false}
      style={[styles.container, { width: gridCardWidth(windowWidth), transform: [{ scale: scaleAnim }] }]}
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
      >
        {imageError || !(item.userImage || item.retailerImage) ? (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Icon name="shirt-outline" size={44} color="#C8BBA6" />
          </View>
        ) : (
          <Image
            source={{ uri: item.userImage || item.retailerImage }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        )}
        {item.season && item.season.length > 0 && (
          <View style={styles.seasonBadge}>
            <Icon name="sunny-outline" size={12} color="#FFFFFF" />
          </View>
        )}
        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.category} numberOfLines={1}>{categoryLabel(item.category)}</Text>
          {item.brand ? <Text style={styles.brand} numberOfLines={1}>{item.brand}</Text> : null}
          {colorMatch && (
            <View style={styles.colorMatchRow}>
              <View style={[
                styles.colorMatchDot,
                { backgroundColor: colorMatch === 'match' ? '#2E8B57' : '#E57373' },
              ]} />
              <Text style={styles.colorMatchText} numberOfLines={1}>
                {colorMatch === 'match' ? 'Great color for you' : 'Outside your palette'}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      {showActions && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() => onEdit?.(item)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Icon name="pencil" size={16} color={theme.colors.cardBackground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Icon name="trash" size={16} color={theme.colors.cardBackground} />
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
    margin: CARD_MARGIN,
    // Fill the grid row's height, so cards side by side end on the same edge
    // however many lines their names and brands take.
    alignSelf: 'stretch',
    ...theme.shadows.card,
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
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.subtle,
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
