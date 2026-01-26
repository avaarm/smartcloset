import React, { useEffect, useState, useMemo } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, SafeAreaView, StatusBar, ActivityIndicator, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../types';
import { getClothingItems, deleteClothingItem } from '../services/storage';
import Icon from 'react-native-vector-icons/Ionicons';
import FilterModal, { FilterOptions } from '../components/FilterModal';
import { ClothingCategory, Season } from '../types';
import theme from '../styles/theme';

type WardrobeScreenProps = {
  navigation: NativeStackNavigationProp<any, 'WardrobeMain'>;
};

const WardrobeScreen = ({ navigation }: WardrobeScreenProps) => {
  const [clothes, setClothes] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    categories: [],
    seasons: [],
    sortBy: 'date',
    sortOrder: 'desc',
  });

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
  const handleEdit = (item: ClothingItemType) => {
    navigation.navigate('AddClothing', { editItem: item });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteClothingItem(id);
      const updatedItems = await getClothingItems();
      setClothes(updatedItems);
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const handleItemPress = (item: ClothingItemType) => {
    (navigation as any).navigate('ItemDetails', { item });
  };

  const handleApplyFilters = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  // Filter and sort clothes
  const filteredAndSortedClothes = useMemo(() => {
    let result = [...clothes];

    // Apply category filter
    if (filters.categories.length > 0) {
      result = result.filter((item) =>
        filters.categories.includes(item.category as ClothingCategory)
      );
    }

    // Apply season filter
    if (filters.seasons.length > 0) {
      result = result.filter((item) =>
        item.season?.some((s: Season) => filters.seasons.includes(s))
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'brand':
          comparison = (a.brand || '').localeCompare(b.brand || '');
          break;
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [clothes, filters]);

  const renderItem = ({ item }: { item: ClothingItemType }) => (
    <ClothingItem 
      item={item} 
      onEdit={handleEdit}
      onDelete={handleDelete}
      onPress={handleItemPress}
      showActions={true}
    />
  );

  const activeFiltersCount =
    filters.categories.length + filters.seasons.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>My Wardrobe</Text>
            <Text style={styles.headerSubtitle}>
              {filteredAndSortedClothes.length} of {clothes.length} items
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.filterButton,
              activeFiltersCount > 0 && styles.filterButtonActive,
            ]}
            onPress={() => setShowFilterModal(true)}
          >
            <Icon
              name="options-outline"
              size={20}
              color={activeFiltersCount > 0 ? '#FFFFFF' : '#111827'}
            />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF385C" />
          </View>
        ) : filteredAndSortedClothes.length > 0 ? (
          <FlatList
            data={filteredAndSortedClothes}
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

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApplyFilters={handleApplyFilters}
        currentFilters={filters}
      />
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
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 0,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '300',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    fontWeight: '400',
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  featuredSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    marginBottom: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  featuredCard: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
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
    fontSize: 20,
    fontWeight: '300',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.mediumGray,
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
