import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { theme } from '../styles/theme';
import {
  getStylistListings,
  searchStylists,
  getFeaturedStylists,
} from '../services/marketplaceService';
import { StylistListing } from '../types/stylist';

const StylistMarketplaceScreen = ({ navigation }: any) => {
  const [stylists, setStylists] = useState<StylistListing[]>([]);
  const [featuredStylists, setFeaturedStylists] = useState<StylistListing[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minRating: 0,
    maxPrice: 1000,
    virtualOnly: false,
  });

  useEffect(() => {
    loadStylists();
  }, []);

  const loadStylists = async () => {
    try {
      const [allStylists, featured] = await Promise.all([
        getStylistListings(),
        getFeaturedStylists(),
      ]);
      setStylists(allStylists);
      setFeaturedStylists(featured);
    } catch (error) {
      console.error('Error loading stylists:', error);
      Alert.alert('Error', 'Failed to load stylists');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadStylists();
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      try {
        const results = await searchStylists(query);
        setStylists(results);
      } catch (error) {
        console.error('Error searching stylists:', error);
      }
    } else {
      loadStylists();
    }
  };

  const applyFilters = async () => {
    try {
      const filtered = await getStylistListings({
        minRating: filters.minRating,
        maxPrice: filters.maxPrice,
        virtualOnly: filters.virtualOnly,
      });
      setStylists(filtered);
      setShowFilters(false);
    } catch (error) {
      console.error('Error applying filters:', error);
      Alert.alert('Error', 'Failed to apply filters');
    }
  };

  const clearFilters = () => {
    setFilters({
      minRating: 0,
      maxPrice: 1000,
      virtualOnly: false,
    });
    loadStylists();
    setShowFilters(false);
  };

  const renderStylistCard = ({ item }: { item: StylistListing }) => (
    <TouchableOpacity
      style={styles.stylistCard}
      onPress={() => navigation.navigate('StylistProfileView', { stylistId: item.stylistId })}
    >
      {item.featured && (
        <View style={styles.featuredBadge}>
          <Icon name="star" size={12} color="#fff" />
          <Text style={styles.featuredText}>Featured</Text>
        </View>
      )}

      <Image
        source={{ uri: item.profileImage || 'https://via.placeholder.com/100' }}
        style={styles.stylistImage}
      />

      <View style={styles.stylistInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.stylistName}>{item.name}</Text>
          {item.verified && (
            <Icon name="checkmark-circle" size={18} color="#4CAF50" />
          )}
        </View>

        {item.businessName && (
          <Text style={styles.businessName}>{item.businessName}</Text>
        )}

        <View style={styles.ratingRow}>
          <Icon name="star" size={16} color="#FFA726" />
          <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
          <Text style={styles.reviewCount}>({item.reviewCount} reviews)</Text>
        </View>

        <View style={styles.specialtiesContainer}>
          {item.specialties.slice(0, 3).map((specialty, index) => (
            <View key={index} style={styles.specialtyTag}>
              <Text style={styles.specialtyText}>{specialty}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>From</Text>
            <Text style={styles.price}>${item.pricing.consultationFee}</Text>
          </View>

          <View style={styles.locationContainer}>
            <Icon name="location-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.location}>
              {item.location?.city}, {item.location?.state}
            </Text>
          </View>
        </View>

        {item.location?.offersVirtual && (
          <View style={styles.virtualBadge}>
            <Icon name="videocam-outline" size={12} color={theme.colors.primary} />
            <Text style={styles.virtualText}>Virtual Available</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderFeaturedSection = () => {
    if (featuredStylists.length === 0) return null;

    return (
      <View style={styles.featuredSection}>
        <Text style={styles.sectionTitle}>Featured Stylists</Text>
        <FlatList
          horizontal
          data={featuredStylists}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.featuredCard}
              onPress={() => navigation.navigate('StylistProfileView', { stylistId: item.stylistId })}
            >
              <Image
                source={{ uri: item.profileImage || 'https://via.placeholder.com/120' }}
                style={styles.featuredImage}
              />
              <View style={styles.featuredOverlay}>
                <Text style={styles.featuredName}>{item.name}</Text>
                <View style={styles.featuredRating}>
                  <Icon name="star" size={14} color="#FFA726" />
                  <Text style={styles.featuredRatingText}>{item.rating.toFixed(1)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredList}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stylists..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor={theme.colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Icon name="close-circle" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Icon name="options-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterTitle}>Filters</Text>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Minimum Rating</Text>
            <View style={styles.ratingButtons}>
              {[0, 3, 4, 4.5].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingButton,
                    filters.minRating === rating && styles.ratingButtonActive,
                  ]}
                  onPress={() => setFilters({ ...filters, minRating: rating })}
                >
                  <Text
                    style={[
                      styles.ratingButtonText,
                      filters.minRating === rating && styles.ratingButtonTextActive,
                    ]}
                  >
                    {rating === 0 ? 'Any' : `${rating}+`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Max Price: ${filters.maxPrice}</Text>
            <View style={styles.priceButtons}>
              {[200, 500, 1000].map((price) => (
                <TouchableOpacity
                  key={price}
                  style={[
                    styles.priceButton,
                    filters.maxPrice === price && styles.priceButtonActive,
                  ]}
                  onPress={() => setFilters({ ...filters, maxPrice: price })}
                >
                  <Text
                    style={[
                      styles.priceButtonText,
                      filters.maxPrice === price && styles.priceButtonTextActive,
                    ]}
                  >
                    ${price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.virtualToggle}
            onPress={() => setFilters({ ...filters, virtualOnly: !filters.virtualOnly })}
          >
            <Icon
              name={filters.virtualOnly ? 'checkbox' : 'square-outline'}
              size={24}
              color={theme.colors.primary}
            />
            <Text style={styles.virtualToggleText}>Virtual sessions only</Text>
          </TouchableOpacity>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Stylists List */}
      <FlatList
        data={stylists}
        renderItem={renderStylistCard}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderFeaturedSection}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="search-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No stylists found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: theme.colors.text,
  },
  filterButton: {
    marginLeft: 12,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  filtersPanel: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  filterRow: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 8,
    fontWeight: '600',
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  ratingButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  ratingButtonText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  ratingButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  priceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  priceButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  priceButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  priceButtonText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  priceButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  virtualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  virtualToggleText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 8,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  featuredSection: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  featuredList: {
    paddingHorizontal: 16,
  },
  featuredCard: {
    width: 120,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  featuredImage: {
    width: 120,
    height: 120,
    backgroundColor: '#f0f0f0',
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
  },
  featuredName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  featuredRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  featuredRatingText: {
    fontSize: 12,
    color: '#fff',
    marginLeft: 4,
  },
  listContent: {
    padding: 16,
  },
  stylistCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA726',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  featuredText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  stylistImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
  },
  stylistInfo: {
    padding: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stylistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 8,
  },
  businessName: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rating: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  specialtiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  specialtyTag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  specialtyText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 4,
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  virtualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  virtualText: {
    fontSize: 12,
    color: theme.colors.primary,
    marginLeft: 4,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
});

export default StylistMarketplaceScreen;
