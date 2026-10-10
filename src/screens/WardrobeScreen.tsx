/**
 * WardrobeScreen — grid view of the user's wardrobe with search + filter.
 *
 * Uses the 21st.dev-style design system: clean type, minimal chrome,
 * solid accent FAB (no gradients), themed via useTheme.
 */

import React, { useCallback, useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, EmptyState, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import ClothingItem from '../components/ClothingItem';
import WardrobeTotalStrip from '../components/WardrobeTotalStrip';
import { GRID_LAYOUTS } from '../utils/clothingGrid';
import { CATEGORY_LABELS, SEASON_LABELS, normalizeSeasons } from '../utils/clothingOptions';
import { itemCountLabel } from '../utils/itemCountLabel';
import { keyboardListProps } from '../utils/keyboardListProps';
import { totalValue } from '../utils/itemValue';
import LoadError from '../components/LoadError';
import { useLoadable } from '../hooks/useLoadable';
import { ClothingItem as ClothingItemType } from '../types';
import { getOwnedClothingItems, deleteClothingItem } from '../services/storage';
import { BodyProfile, getBodyProfile } from '../services/profileService';
import FilterModal, { FilterOptions } from '../components/FilterModal';
import { ClothingCategory } from '../types';

type WardrobeScreenProps = {
  navigation: NativeStackNavigationProp<any, 'WardrobeMain'>;
};

type WardrobeData = { items: ClothingItemType[]; profile: BodyProfile | null };

const EMPTY_WARDROBE: WardrobeData = { items: [], profile: null };

// Fixed for the life of the list: a mounted FlatList cannot change its column count.
const GRID = GRID_LAYOUTS.compact;

// The body profile is read once here (not per card) for the color-match hints.
const loadWardrobe = async (): Promise<WardrobeData> => {
  const [items, profile] = await Promise.all([getOwnedClothingItems(), getBodyProfile()]);
  return { items, profile };
};

const WardrobeScreen = ({ navigation }: WardrobeScreenProps) => {
  const { theme } = useTheme();
  const {
    data: { items: clothes, profile },
    hasLoaded,
    failed,
    loading,
    blocked,
    refreshing,
    reload,
    refresh,
    update,
  } = useLoadable(loadWardrobe, EMPTY_WARDROBE);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterOptions>({
    categories: [],
    seasons: [],
    sortBy: 'date',
    sortOrder: 'desc',
  });

  // Runs on mount and on every return to this screen (after adding, editing or
  // deleting an item elsewhere). The list stays on screen while it refreshes.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleEdit = useCallback(
    (item: ClothingItemType) => {
      navigation.navigate('AddClothing', { editItem: item });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteClothingItem(id);
        update(d => ({ ...d, items: d.items.filter(i => i.id !== id) }));
      } catch (error) {
        console.error('Error deleting item:', error);
        Alert.alert('Could not delete item', 'Check your connection and try again.');
      }
    },
    [update],
  );

  const handleItemPress = useCallback(
    (item: ClothingItemType) => {
      (navigation as any).navigate('ItemDetails', { item });
    },
    [navigation],
  );

  const handleApplyFilters = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  // Of the whole wardrobe, not of what a search or filter leaves showing.
  const wardrobeValue = useMemo(() => totalValue(clothes), [clothes]);

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
      // Old data lists ['all'] or nothing; normalizeSeasons reads 'all' as every
      // season, and an item with no season is year-round (as in outfit generation).
      result = result.filter(item => {
        const seasons = normalizeSeasons(item.season);
        return seasons.length === 0 || seasons.some(s => filters.seasons.includes(s));
      });
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

  const renderItem = useCallback(
    ({ item }: { item: ClothingItemType }) => (
      <ClothingItem
        item={item}
        bodyProfile={profile}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPress={handleItemPress}
        showActions={true}
        variant="compact"
      />
    ),
    [profile, handleEdit, handleDelete, handleItemPress],
  );

  const activeFiltersCount = filters.categories.length + filters.seasons.length;
  const isNarrowed = activeFiltersCount > 0 || searchQuery.trim().length > 0;

  const headerElement = (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="h2">My Wardrobe</Text>
          {hasLoaded ? (
            <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
              {itemCountLabel(clothes.length, isNarrowed ? filteredAndSortedClothes.length : undefined)}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => (navigation as any).navigate('WardrobeInsights')}
            hitSlop={8}
            accessibilityLabel="Wardrobe analytics"
            accessibilityRole="button"
            style={[
              styles.filterBtn,
              {
                backgroundColor: theme.colors.muted,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Icon name="analytics-outline" size={20} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setShowFilterModal(true)}
            accessibilityLabel={`Filters${activeFiltersCount > 0 ? `, ${activeFiltersCount} active` : ''}`}
            accessibilityRole="button"
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

      {hasLoaded ? <WardrobeTotalStrip total={wardrobeValue} count={clothes.length} /> : null}

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
          returnKeyType="search"
          blurOnSubmit
          accessibilityLabel="Search wardrobe"
          accessibilityRole="search"
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
            <Badge key={c} label={CATEGORY_LABELS[c]} tone="accent" />
          ))}
          {filters.seasons.map(s => (
            <Badge key={s} label={SEASON_LABELS[s]} tone="neutral" />
          ))}
          <Pressable
            onPress={() => setFilters({ categories: [], seasons: [], sortBy: 'date', sortOrder: 'desc' })}
            accessibilityLabel="Clear all filters"
            accessibilityRole="button"
          >
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
        ) : blocked ? (
          <View style={styles.center}>
            <LoadError what="wardrobe" onRetry={reload} />
          </View>
        ) : (
          <>
            {failed ? (
              <View style={styles.banner}>
                <LoadError
                  variant="banner"
                  what="wardrobe"
                  title="Couldn't refresh your wardrobe"
                  onRetry={reload}
                />
              </View>
            ) : null}
            <FlatList
              data={filteredAndSortedClothes}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              {...keyboardListProps}
              numColumns={GRID.columns}
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: GRID.sidePadding, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={theme.colors.accent}
                />
              }
              ListEmptyComponent={
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
              }
            />
          </>
        )}

        {/* FAB */}
        <Pressable
          onPress={() => navigation.navigate('AddClothing')}
          accessibilityLabel="Add clothing item"
          accessibilityRole="button"
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
  banner: {
    paddingHorizontal: 12,
    paddingTop: 8,
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
