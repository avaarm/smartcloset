import React, { useEffect, useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, SafeAreaView, StatusBar, ActivityIndicator, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../data/sampleClothes';
import { getClothingItems } from '../services/storage';
import Icon from 'react-native-vector-icons/Ionicons';

type WardrobeScreenProps = {
  navigation: NativeStackNavigationProp<any, 'WardrobeMain'>;
};

const WardrobeScreen = ({ navigation }: WardrobeScreenProps) => {
  const [clothes, setClothes] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadClothes = async () => {
      setLoading(true);
      const items = await getClothingItems();
      setClothes(items);
      setLoading(false);
    };
    loadClothes();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      setLoading(true);
      const items = await getClothingItems();
      setClothes(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [navigation]);
  const renderItem = ({ item }: { item: ClothingItemType }) => (
    <ClothingItem item={item} />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>My Wardrobe</Text>
            <Text style={styles.headerSubtitle}>{clothes.length} items</Text>
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Icon name="options-outline" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF385C" />
          </View>
        ) : clothes.length > 0 ? (
          <FlatList
            data={clothes}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={(
              <View style={styles.featuredSection}>
                <Text style={styles.sectionTitle}>Recently Added</Text>
                <View style={styles.featuredCard}>
                  <Image 
                    source={{uri: 'https://images.unsplash.com/photo-1551028719-00167b16eac5'}} 
                    style={styles.featuredImage}
                  />
                  <LinearGradient 
                    colors={['transparent', 'rgba(0,0,0,0.7)']} 
                    style={styles.featuredGradient}
                  >
                    <Text style={styles.featuredText}>Summer Collection</Text>
                  </LinearGradient>
                </View>
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyState}>
            <Icon name="shirt-outline" size={80} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>Your wardrobe is empty</Text>
            <Text style={styles.emptyStateText}>Add some clothing items to get started</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => navigation.navigate('AddClothing')}
        >
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
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  featuredSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  featuredCard: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    padding: 16,
  },
  featuredText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
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

export default WardrobeScreen;
