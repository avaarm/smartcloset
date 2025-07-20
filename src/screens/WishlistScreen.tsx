import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, ActivityIndicator, SafeAreaView, StatusBar, Image } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { ClothingItem, ClothingCategory, Season } from '../types';
import ClothingCard from '../components/ClothingCard';
import { getWishlistItems, saveWishlistItems } from '../utils/storage';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <TouchableOpacity style={styles.sortButton}>
          <Icon name="options-outline" size={20} color="#111827" />
        </TouchableOpacity>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF385C" />
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={({ item }) => <ClothingCard item={item} />}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={items.length > 0 ? (
              <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{items.length}</Text>
                  <Text style={styles.statLabel}>Items</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>$0</Text>
                  <Text style={styles.statLabel}>Budget</Text>
                </View>
              </View>
            ) : null}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Image 
                  source={{uri: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070'}} 
                  style={styles.emptyStateImage} 
                  resizeMode="contain"
                />
                <Text style={styles.emptyStateTitle}>Your wishlist is empty</Text>
                <Text style={styles.emptyStateText}>Add items you're considering to purchase</Text>
              </View>
            }
          />
        )}
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
          <LinearGradient
            colors={['#FF385C', '#FF5A5F']}
            style={styles.addButtonGradient}
          >
            <Icon name="add" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  sortButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    padding: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    backgroundColor: 'transparent',
  },
  addButtonGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default WishlistScreen;
