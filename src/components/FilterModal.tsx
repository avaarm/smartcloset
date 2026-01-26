import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import theme from '../styles/theme';
import { ClothingCategory, Season, ClothingCategoryEnum, SeasonEnum } from '../types';

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
}

export interface FilterOptions {
  categories: ClothingCategory[];
  seasons: Season[];
  sortBy: 'name' | 'date' | 'category' | 'brand';
  sortOrder: 'asc' | 'desc';
}

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  onApplyFilters,
  currentFilters,
}) => {
  const defaultFilters: FilterOptions = {
    categories: [],
    seasons: [],
    sortBy: 'date',
    sortOrder: 'desc',
  };
  const [filters, setFilters] = useState<FilterOptions>(currentFilters || defaultFilters);
  const [slideAnim] = useState(new Animated.Value(0));

  React.useEffect(() => {
    if (currentFilters) {
      setFilters(currentFilters);
    }
  }, [currentFilters]);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const toggleCategory = (category: ClothingCategory) => {
    const currentCategories = filters?.categories || [];
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter((c) => c !== category)
      : [...currentCategories, category];
    setFilters({ ...filters, categories: newCategories });
  };

  const toggleSeason = (season: Season) => {
    const currentSeasons = filters?.seasons || [];
    const newSeasons = currentSeasons.includes(season)
      ? currentSeasons.filter((s) => s !== season)
      : [...currentSeasons, season];
    setFilters({ ...filters, seasons: newSeasons });
  };

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: FilterOptions = {
      categories: [],
      seasons: [],
      sortBy: 'date',
      sortOrder: 'desc',
    };
    setFilters(resetFilters);
    onApplyFilters(resetFilters);
  };

  const categories = Object.values(ClothingCategoryEnum) as ClothingCategory[];
  const seasons = Object.values(SeasonEnum) as Season[];

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalContainer,
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filter & Sort</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Sort Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sort By</Text>
              <View style={styles.optionsGrid}>
                {[
                  { value: 'date', label: 'Date Added', icon: 'calendar-outline' },
                  { value: 'name', label: 'Name', icon: 'text-outline' },
                  { value: 'category', label: 'Category', icon: 'albums-outline' },
                  { value: 'brand', label: 'Brand', icon: 'pricetag-outline' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionCard,
                      filters?.sortBy === option.value && styles.optionCardActive,
                    ]}
                    onPress={() => setFilters({ ...filters, sortBy: option.value as any })}
                  >
                    <Icon
                      name={option.icon}
                      size={20}
                      color={
                        filters?.sortBy === option.value
                          ? theme.colors.accent
                          : theme.colors.mediumGray
                      }
                    />
                    <Text
                      style={[
                        styles.optionText,
                        filters?.sortBy === option.value && styles.optionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sort Order */}
              <View style={styles.sortOrderContainer}>
                <TouchableOpacity
                  style={[
                    styles.sortOrderButton,
                    filters?.sortOrder === 'asc' && styles.sortOrderButtonActive,
                  ]}
                  onPress={() => setFilters({ ...filters, sortOrder: 'asc' })}
                >
                  <Icon
                    name="arrow-up"
                    size={16}
                    color={
                      filters?.sortOrder === 'asc'
                        ? '#FFFFFF'
                        : theme.colors.mediumGray
                    }
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      filters?.sortOrder === 'asc' && styles.sortOrderTextActive,
                    ]}
                  >
                    Ascending
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortOrderButton,
                    filters?.sortOrder === 'desc' && styles.sortOrderButtonActive,
                  ]}
                  onPress={() => setFilters({ ...filters, sortOrder: 'desc' })}
                >
                  <Icon
                    name="arrow-down"
                    size={16}
                    color={
                      filters?.sortOrder === 'desc'
                        ? '#FFFFFF'
                        : theme.colors.mediumGray
                    }
                  />
                  <Text
                    style={[
                      styles.sortOrderText,
                      filters?.sortOrder === 'desc' && styles.sortOrderTextActive,
                    ]}
                  >
                    Descending
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Categories Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <View style={styles.chipsContainer}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.chip,
                      filters?.categories?.includes(category) && styles.chipActive,
                    ]}
                    onPress={() => toggleCategory(category)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters?.categories?.includes(category) && styles.chipTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Seasons Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Seasons</Text>
              <View style={styles.chipsContainer}>
                {seasons.map((season) => (
                  <TouchableOpacity
                    key={season}
                    style={[
                      styles.chip,
                      filters?.seasons?.includes(season) && styles.chipActive,
                    ]}
                    onPress={() => toggleSeason(season)}
                  >
                    <Icon
                      name={
                        season === 'spring'
                          ? 'flower-outline'
                          : season === 'summer'
                          ? 'sunny-outline'
                          : season === 'fall'
                          ? 'leaf-outline'
                          : 'snow-outline'
                      }
                      size={16}
                      color={
                        filters?.seasons?.includes(season)
                          ? '#FFFFFF'
                          : theme.colors.mediumGray
                      }
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        filters?.seasons?.includes(season) && styles.chipTextActive,
                      ]}
                    >
                      {season}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <LinearGradient
                colors={theme.colors.gradient.primary}
                style={styles.applyButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    ...theme.shadows.card,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.lightGray,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  optionCard: {
    width: '48%',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    margin: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.subtle,
  },
  optionCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.mutedBackground,
  },
  optionText: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    marginTop: 8,
    fontWeight: '500',
  },
  optionTextActive: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  sortOrderContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  sortOrderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  sortOrderButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  sortOrderText: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    marginLeft: 6,
    fontWeight: '500',
  },
  sortOrderTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    gap: 12,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  applyButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  applyButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

export default FilterModal;
