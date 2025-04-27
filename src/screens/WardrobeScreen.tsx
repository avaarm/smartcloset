import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ClothingItem, ClothingCategory, Season } from '../types';
import ClothingCard from '../components/ClothingCard';

const WardrobeScreen = () => {
  const [items, setItems] = useState<ClothingItem[]>([]);

  const handleAddItem = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });

    if (result.assets && result.assets[0]) {
      const newItem: ClothingItem = {
        id: Date.now().toString(),
        name: 'New Item',
        category: ClothingCategory.TOPS,
        userImage: result.assets[0].uri,
        color: 'black', // Default value, will be editable
        season: [Season.SPRING], // Default value, will be editable
        dateAdded: new Date().toISOString(),
        isWishlist: false,
      };

      setItems([...items, newItem]);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={({ item }) => <ClothingCard item={item} />}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
      />
      <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
        <Text style={styles.addButtonText}>Add Item</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    padding: 8,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#6200ee',
    padding: 16,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default WardrobeScreen;
