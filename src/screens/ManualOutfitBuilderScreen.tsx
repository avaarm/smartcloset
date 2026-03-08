import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { ClothingItem, ClothingCategory, Season } from '../types';
import { getClothingItems } from '../services/storage';
import { saveOutfit } from '../services/outfitService';
import theme from '../styles/theme';

const ManualOutfitBuilderScreen = () => {
  const navigation = useNavigation();
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<ClothingItem[]>([]);
  const [outfitName, setOutfitName] = useState('');
  const [outfitOccasion, setOutfitOccasion] = useState('');
  const [selectedSeasons, setSelectedSeasons] = useState<Season[]>([]);
  const [filterCategory, setFilterCategory] = useState<ClothingCategory | 'all'>('all');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const categories: Array<ClothingCategory | 'all'> = [
    'all',
    'tops',
    'bottoms',
    'dresses',
    'outerwear',
    'shoes',
    'accessories',
  ];

  const seasons: Season[] = ['spring', 'summer', 'fall', 'winter'];

  const occasions = ['Casual', 'Work', 'Formal', 'Date Night', 'Workout', 'Party', 'Travel'];

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const items = await getClothingItems();
      const wardrobeItems = items.filter((item) => !item.isWishlist);
      setAllItems(wardrobeItems);
    } catch (error) {
      console.error('Error loading items:', error);
      Alert.alert('Error', 'Failed to load wardrobe items');
    } finally {
      setLoading(false);
    }
  };

  const toggleItemSelection = (item: ClothingItem) => {
    const isSelected = selectedItems.some((i) => i.id === item.id);
    if (isSelected) {
      setSelectedItems(selectedItems.filter((i) => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const toggleSeason = (season: Season) => {
    if (selectedSeasons.includes(season)) {
      setSelectedSeasons(selectedSeasons.filter((s) => s !== season));
    } else {
      setSelectedSeasons([...selectedSeasons, season]);
    }
  };

  const getFilteredItems = () => {
    if (filterCategory === 'all') {
      return allItems;
    }
    return allItems.filter((item) => item.category === filterCategory);
  };

  const handleSaveOutfit = () => {
    if (selectedItems.length === 0) {
      Alert.alert('No Items Selected', 'Please select at least one item for your outfit.');
      return;
    }
    setShowSaveModal(true);
  };

  const confirmSaveOutfit = async () => {
    if (!outfitName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your outfit.');
      return;
    }

    try {
      const outfit = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: outfitName.trim(),
        items: selectedItems,
        season: selectedSeasons.length > 0 ? selectedSeasons : undefined,
        occasion: outfitOccasion || undefined,
        createdAt: new Date().toISOString(),
      };

      await saveOutfit(outfit);
      
      Alert.alert(
        'Success!',
        'Your outfit has been saved.',
        [
          {
            text: 'Create Another',
            onPress: () => {
              setSelectedItems([]);
              setOutfitName('');
              setOutfitOccasion('');
              setSelectedSeasons([]);
              setShowSaveModal(false);
            },
          },
          {
            text: 'View Saved Outfits',
            onPress: () => {
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error saving outfit:', error);
      Alert.alert('Error', 'Failed to save outfit. Please try again.');
    }
  };

  const renderItem = ({ item }: { item: ClothingItem }) => {
    const isSelected = selectedItems.some((i) => i.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.itemCard, isSelected && styles.itemCardSelected]}
        onPress={() => toggleItemSelection(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{
            uri: item.retailerImage || item.userImage || 'https://via.placeholder.com/150',
          }}
          style={styles.itemImage}
          resizeMode="cover"
        />
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Icon name="checkmark-circle" size={28} color={theme.colors.accent} />
          </View>
        )}
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemCategory}>{item.category}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Outfit</Text>
        <TouchableOpacity onPress={handleSaveOutfit} style={styles.saveButton}>
          <Icon name="checkmark" size={24} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>

      {selectedItems.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>
            Selected Items ({selectedItems.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedItems.map((item) => (
              <View key={item.id} style={styles.selectedItemPreview}>
                <Image
                  source={{
                    uri: item.retailerImage || item.userImage || 'https://via.placeholder.com/80',
                  }}
                  style={styles.selectedItemImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => toggleItemSelection(item)}
                >
                  <Icon name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.filterChip,
                filterCategory === category && styles.filterChipActive,
              ]}
              onPress={() => setFilterCategory(category)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterCategory === category && styles.filterChipTextActive,
                ]}
              >
                {category === 'all' ? 'All' : category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={getFilteredItems()}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="shirt-outline" size={64} color={theme.colors.mediumGray} />
            <Text style={styles.emptyStateText}>No items in this category</Text>
          </View>
        }
      />

      <Modal
        visible={showSaveModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Outfit</Text>
              <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Outfit Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Summer Brunch Look"
                  value={outfitName}
                  onChangeText={setOutfitName}
                  placeholderTextColor={theme.colors.mediumGray}
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Occasion (Optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {occasions.map((occasion) => (
                    <TouchableOpacity
                      key={occasion}
                      style={[
                        styles.occasionChip,
                        outfitOccasion === occasion && styles.occasionChipActive,
                      ]}
                      onPress={() =>
                        setOutfitOccasion(outfitOccasion === occasion ? '' : occasion)
                      }
                    >
                      <Text
                        style={[
                          styles.occasionChipText,
                          outfitOccasion === occasion && styles.occasionChipTextActive,
                        ]}
                      >
                        {occasion}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Seasons (Optional)</Text>
                <View style={styles.seasonsContainer}>
                  {seasons.map((season) => (
                    <TouchableOpacity
                      key={season}
                      style={[
                        styles.seasonChip,
                        selectedSeasons.includes(season) && styles.seasonChipActive,
                      ]}
                      onPress={() => toggleSeason(season)}
                    >
                      <Text
                        style={[
                          styles.seasonChipText,
                          selectedSeasons.includes(season) && styles.seasonChipTextActive,
                        ]}
                      >
                        {season}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Preview</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedItems.map((item) => (
                    <View key={item.id} style={styles.previewItem}>
                      <Image
                        source={{
                          uri:
                            item.retailerImage ||
                            item.userImage ||
                            'https://via.placeholder.com/100',
                        }}
                        style={styles.previewItemImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.previewItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <TouchableOpacity style={styles.modalButton} onPress={confirmSaveOutfit}>
                <Text style={styles.modalButtonText}>Save Outfit</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    padding: 8,
  },
  selectedSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  selectedItemPreview: {
    marginRight: 12,
    position: 'relative',
  },
  selectedItemImage: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: theme.colors.mutedBackground,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  itemCard: {
    width: '48%',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemCardSelected: {
    borderColor: theme.colors.accent,
  },
  itemImage: {
    width: '100%',
    height: 200,
    backgroundColor: theme.colors.mutedBackground,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    padding: 12,
    paddingBottom: 4,
  },
  itemCategory: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    paddingHorizontal: 12,
    paddingBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: theme.colors.mediumGray,
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  occasionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  occasionChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  occasionChipText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
    fontWeight: '500',
  },
  occasionChipTextActive: {
    color: '#FFFFFF',
  },
  seasonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  seasonChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  seasonChipText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  seasonChipTextActive: {
    color: '#FFFFFF',
  },
  previewItem: {
    marginRight: 12,
    width: 100,
  },
  previewItemImage: {
    width: 100,
    height: 130,
    borderRadius: 8,
    backgroundColor: theme.colors.mutedBackground,
  },
  previewItemName: {
    fontSize: 12,
    color: theme.colors.text,
    marginTop: 6,
  },
  modalButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default ManualOutfitBuilderScreen;
