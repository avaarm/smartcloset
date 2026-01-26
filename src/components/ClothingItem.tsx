import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, TouchableOpacity, Alert, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import type { ClothingItem as ClothingItemType } from '../types';
import theme from '../styles/theme';

interface Props {
  item: ClothingItemType;
  onEdit?: (item: ClothingItemType) => void;
  onDelete?: (id: string) => void;
  onPress?: (item: ClothingItemType) => void;
  showActions?: boolean;
}

const ClothingItem: React.FC<Props> = ({ item, onEdit, onDelete, onPress, showActions = false }) => {
  const [scaleAnim] = useState(new Animated.Value(1));
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

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={!onPress}
    >
      <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
        <Image source={{ uri: item.userImage || item.retailerImage || 'https://via.placeholder.com/100x120' }} style={styles.image} />
        {item.season && item.season.length > 0 && (
          <View style={styles.seasonBadge}>
            <Icon name="sunny-outline" size={12} color="#FFFFFF" />
          </View>
        )}
      {showActions && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.editButton]} 
            onPress={() => onEdit?.(item)}
          >
            <Icon name="pencil" size={16} color={theme.colors.cardBackground} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.deleteButton]} 
            onPress={handleDelete}
          >
            <Icon name="trash" size={16} color={theme.colors.cardBackground} />
          </TouchableOpacity>
        </View>
      )}
        <View style={styles.details}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.category}>{item.category}</Text>
          {item.brand && <Text style={styles.brand}>{item.brand}</Text>}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.medium,
    margin: theme.spacing.small,
    ...theme.shadows.card,
  },
  image: {
    width: Dimensions.get('window').width / 2 - 24,
    height: 200,
    borderTopLeftRadius: theme.borderRadius.medium,
    borderTopRightRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.mutedBackground,
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
});

export default ClothingItem;
