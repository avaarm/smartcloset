import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ClothingItem, ClothingCategory, Season } from '../types';
import ClothingCard from '../components/ClothingCard';
import { getWishlistItems, saveWishlistItems } from '../utils/storage';

const WishlistScreen = () => {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWishlistItems();
  }, []);

  const loadWishlistItems = async () => {
    try {
      const savedItems = await getWishlistItems();
      setItems(savedItems);
    } catch (error) {
      console.error('Error loading wishlist items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });

    if (result.assets && result.assets[0]) {
      const newItem: ClothingItem = {
        id: Date.now().toString(),
        name: 'Wishlist Item',
        category: ClothingCategory.TOPS,
        userImage: result.assets[0].uri,
        color: 'black',
        season: [Season.SPRING],
        dateAdded: new Date().toISOString(),
        isWishlist: true,
      };

      const updatedItems = [...items, newItem];
      setItems(updatedItems);
      await saveWishlistItems(updatedItems);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6200ee" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={({ item }) => <ClothingCard item={item} />}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Your wishlist is empty</Text>
          </View>
        }
      />
      <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
        <Text style={styles.addButtonText}>Add to Wishlist</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
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

export default WishlistScreen;
