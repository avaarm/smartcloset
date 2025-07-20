import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Outfit } from '../services/outfitService';
import Icon from 'react-native-vector-icons/Ionicons';

interface OutfitCardProps {
  outfit: Outfit;
  onSave?: () => void;
  onDelete?: () => void;
  saved?: boolean;
}

const OutfitCard: React.FC<OutfitCardProps> = ({ outfit, onSave, onDelete, saved = false }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.outfitName}>{outfit.name}</Text>
        {saved ? (
          <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
            <Icon name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onSave} style={styles.actionButton}>
            <Icon name="bookmark-outline" size={22} color="#007AFF" />
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
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.itemsContainer}
      >
        {outfit.items.map((item, index) => (
          <View key={item.id + index} style={styles.itemCard}>
            <Image 
              source={{ uri: item.imageUrl }} 
              style={styles.itemImage} 
              resizeMode="cover"
            />
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  outfitName: {
    fontSize: 18,
    fontWeight: '600',
  },
  actionButton: {
    padding: 8,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    fontSize: 12,
    color: '#3C3C43',
    textTransform: 'capitalize',
  },
  itemsContainer: {
    paddingVertical: 8,
  },
  itemCard: {
    width: 120,
    marginRight: 12,
  },
  itemImage: {
    width: 120,
    height: 160,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  itemCategory: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
});

export default OutfitCard;
