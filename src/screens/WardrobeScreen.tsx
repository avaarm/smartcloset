/**
 * WardrobeScreen — grid view of the user's wardrobe with search + filter.
 *
 * Uses the 21st.dev-style design system: clean type, minimal chrome,
 * solid accent FAB (no gradients), themed via useTheme.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, EmptyState, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../types';
import {
  getClothingItems,
  deleteClothingItem,
  resetStorage,
} from '../services/storage';
import FilterModal, { FilterOptions } from '../components/FilterModal';
import { ClothingCategory, Season } from '../types';

type WardrobeScreenProps = {
  navigation: NativeStackNavigationProp<any, 'WardrobeMain'>;
};

const WardrobeScreen = ({ navigation }: WardrobeScreenProps) => {
  const { theme } = useTheme();
  const [clothes, setClothes] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const handleResetStorage = async () => {
    try {
      await resetStorage();
      const items = await getClothingItems();
      setClothes(items);
    } catch (error) {
      console.error('Error resetting storage:', error);
    }
  };

  const handleApplyFilters = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  const filteredAndSortedClothes = useMemo(() => {
    let result = [...clothes];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.brand?.toLowerCase().includes(query) ||
          item.color?.toLowerCase().includes(query) ||
          item.tags?.some(tag => tag.toLowerCase().includes(query)) ||
          item.retailer?.toLowerCase().includes(query),
      );
    }

    if (filters.categories.length > 0) {
      result = result.filter(item =>
        filters.categories.includes(item.category as ClothingCategory),
      );
    }

    if (filters.seasons.length > 0) {
      result = result.filter(item =>
        item.season?.some((s: Season) => filters.seasons.includes(s)),
      );
    }

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
  }, [clothes, filters, searchQuery]);

  const renderItem = ({ item }: { item: ClothingItemType }) => (
    <ClothingItem
      item={item}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onPress={handleItemPress}
      showActions={true}
    />
  );

  const activeFiltersCount = filters.categories.length + filters.seasons.length;

  const headerElement = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="h2">My Wardrobe</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
            {filteredAndSortedClothes.length} of {clothes.length} items
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button
            label="Load Sample"
            variant="ghost"
            size="sm"
            leftIcon={
              <Icon name="refresh-outline" size={16} color={theme.colors.text} />
            }
            onPress={handleResetStorage}
          />
          <Pressable
            onPress={() => setShowFilterModal(true)}
            style={[
              styles.filterBtn,
              {
                backgroundColor: activeFiltersCount > 0
                  ? theme.colors.accent
                  : theme.colors.muted,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Icon
              name="options-outline"
              size={20}
              color={activeFiltersCount > 0 ? theme.colors.accentText : theme.colors.text}
            />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text
                  variant="caption"
                  style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}
                >
                  {activeFiltersCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: theme.colors.muted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Icon name="search-outline" size={18} color={theme.colors.textSubtle} />
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          placeholder="Search by name, brand, color..."
          placeholderTextColor={theme.colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={18} color={theme.colors.textSubtle} />
          </Pressable>
        )}
      </View>

      {/* Active filters strip */}
      {activeFiltersCount > 0 && (
        <View style={styles.filterStrip}>
          {filters.categories.map(c => (
            <Badge key={c} label={c} tone="accent" />
          ))}
          {filters.seasons.map(s => (
            <Badge key={s} label={s} tone="neutral" />
          ))}
          <Pressable onPress={() => setFilters({ categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' })}>
            <Text variant="caption" color="muted">
              Clear all
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <Screen padded={false} header={headerElement}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="muted">Loading wardrobe...</Text>
          </View>
        ) : filteredAndSortedClothes.length > 0 ? (
          <FlatList
            data={filteredAndSortedClothes}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.center}>
            <EmptyState
              icon={<Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />}
              title={clothes.length === 0 ? 'Your wardrobe is empty' : 'No matches'}
              body={
                clothes.length === 0
                  ? 'Add some clothing items to get started.'
                  : 'Try a different search or clear your filters.'
              }
            />
          </View>
        )}

        {/* FAB */}
        <Pressable
          onPress={() => navigation.navigate('AddClothing')}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.full,
              opacity: pressed ? 0.85 : 1,
              ...theme.shadows.medium,
            },
          ]}
        >
          <Icon name="add" size={24} color={theme.colors.accentText} />
        </Pressable>
      </View>

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApplyFilters={handleApplyFilters}
        currentFilters={filters}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#DC2626',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default WardrobeScreen;
