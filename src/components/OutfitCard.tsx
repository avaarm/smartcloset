import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Outfit } from '../services/outfitService';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';

interface OutfitCardProps {
  outfit: Outfit;
  onSave?: () => void;
  onDelete?: () => void;
  onMarkAsWorn?: () => void;
  saved?: boolean;
}

const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, onSave, onDelete, onMarkAsWorn, saved = false }) => {
  const navigation = useNavigation<any>();

  const handleCardPress = () => {
    navigation.navigate('OutfitDetails', { outfit, saved });
  };

  const handleMarkAsWorn = (e: any) => {
    e.stopPropagation();
    if (onMarkAsWorn) {
      onMarkAsWorn();
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handleCardPress} activeOpacity={0.9}>
      <View style={styles.header}>
        <Text style={styles.outfitName}>{outfit.name}</Text>
        {saved ? (
          <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
            <Icon name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onSave} style={styles.actionButton}>
            <Icon name="bookmark-outline" size={22} color="#8B7FD9" />
          </TouchableOpacity>
        )}
      </View>
      
      {outfit.occasion && (
        <View style={styles.tagContainer}>
          <Text style={styles.tag}>{outfit.occasion}</Text>
          {outfit.season && outfit.season.map(season => (
            <Text key={season} style={styles.tag}>{season}</Text>
          ))}
        </View>
      )}

      {saved && onMarkAsWorn && (
        <TouchableOpacity style={styles.wearButton} onPress={handleMarkAsWorn}>
          <Icon name="checkmark-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.wearButtonText}>Wore This Today</Text>
        </TouchableOpacity>
      )}
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.itemsContainer}
      >
        {outfit.items.map((item, index) => (
          <View key={item.id + index} style={styles.itemCard}>
            <Image 
              source={{ uri: item.retailerImage || item.userImage || 'https://via.placeholder.com/120x160' }} 
              style={styles.itemImage} 
              resizeMode="cover"
            />
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
        ))}
      </ScrollView>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.medium,
    marginBottom: theme.spacing.medium,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.small,
  },
  outfitName: {
    fontSize: theme.typography.fontSize.large,
    fontWeight: '600',
    color: theme.colors.accent,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  actionButton: {
    padding: theme.spacing.small,
    borderRadius: theme.borderRadius.small,
    backgroundColor: theme.colors.mutedBackground,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.small,
  },
  tag: {
    backgroundColor: theme.colors.mutedBackground,
    paddingHorizontal: theme.spacing.small,
    paddingVertical: theme.spacing.tiny,
    borderRadius: theme.borderRadius.small,
    marginRight: theme.spacing.small,
    marginBottom: theme.spacing.small,
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.normal,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  itemsContainer: {
    paddingVertical: theme.spacing.small,
  },
  itemCard: {
    width: 120,
    marginRight: theme.spacing.small,
  },
  itemImage: {
    width: 120,
    height: 160,
    borderRadius: theme.borderRadius.medium,
    backgroundColor: theme.colors.mutedBackground,
  },
  itemName: {
    fontSize: theme.typography.fontSize.medium,
    fontWeight: '500',
    marginTop: theme.spacing.small,
    color: theme.colors.text,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  itemCategory: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.normal,
  },
  wearButton: {
    backgroundColor: theme.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: theme.spacing.small,
    marginBottom: theme.spacing.small,
    gap: 6,
  },
  wearButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default OutfitCard;
