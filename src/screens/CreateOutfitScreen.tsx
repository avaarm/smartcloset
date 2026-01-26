import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  FlatList,
  Modal,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClothingItem } from '../types';
import { getClothingItems } from '../services/storage';
import { saveOutfit, Outfit } from '../services/outfitService';
import theme from '../styles/theme';

const { width } = Dimensions.get('window');

const CreateOutfitScreen: React.FC = () => {
  const navigation = useNavigation();
  const [outfitName, setOutfitName] = useState('');
  const [selectedItems, setSelectedItems] = useState<ClothingItem[]>([]);
  const [availableItems, setAvailableItems] = useState<ClothingItem[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [occasion, setOccasion] = useState<string>('casual');
  const [showOccasionModal, setShowOccasionModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const categories = [
    { id: 'all', label: 'All', icon: 'apps-outline' },
    { id: 'tops', label: 'Tops', icon: 'shirt-outline' },
    { id: 'bottoms', label: 'Bottoms', icon: 'fitness-outline' },
    { id: 'dresses', label: 'Dresses', icon: 'woman-outline' },
    { id: 'outerwear', label: 'Outerwear', icon: 'snow-outline' },
    { id: 'shoes', label: 'Shoes', icon: 'footsteps-outline' },
    { id: 'accessories', label: 'Accessories', icon: 'watch-outline' },
  ];

  const occasions = [
    { id: 'casual', label: 'Casual', icon: 'cafe-outline' },
    { id: 'formal', label: 'Formal', icon: 'business-outline' },
    { id: 'business', label: 'Business', icon: 'briefcase-outline' },
    { id: 'party', label: 'Party', icon: 'wine-outline' },
    { id: 'sports', label: 'Sports', icon: 'basketball-outline' },
    { id: 'everyday', label: 'Everyday', icon: 'home-outline' },
  ];

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const items = await getClothingItems();
      setAvailableItems(items);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const filteredItems = availableItems.filter(
    (item) => filterCategory === 'all' || item.category === filterCategory
  );

  const toggleItemSelection = (item: ClothingItem) => {
    if (selectedItems.find((i) => i.id === item.id)) {
      setSelectedItems(selectedItems.filter((i) => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const removeItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  const handleSaveOutfit = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('No Items', 'Please select at least one item for your outfit.');
      return;
    }

    if (!outfitName.trim()) {
      Alert.alert('Name Required', 'Please give your outfit a name.');
      return;
    }

    setLoading(true);
    try {
      const outfit: Outfit = {
        id: Date.now().toString(),
        name: outfitName.trim(),
        items: selectedItems,
        occasion,
        createdAt: new Date().toISOString(),
      };

      await saveOutfit(outfit);
      Alert.alert('Success', 'Your outfit has been saved!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save outfit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderSelectedItem = ({ item }: { item: ClothingItem }) => (
    <View style={styles.selectedItemCard}>
      <Image
        source={{
          uri: item.userImage || item.retailerImage || 'https://via.placeholder.com/80',
        }}
        style={styles.selectedItemImage}
      />
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeItem(item.id)}
      >
        <Icon name="close-circle" size={24} color="#FF3B30" />
      </TouchableOpacity>
      <Text style={styles.selectedItemName} numberOfLines={1}>
        {item.name}
      </Text>
    </View>
  );

  const renderAvailableItem = ({ item }: { item: ClothingItem }) => {
    const isSelected = selectedItems.find((i) => i.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.availableItemCard, isSelected && styles.availableItemSelected]}
        onPress={() => toggleItemSelection(item)}
      >
        <Image
          source={{
            uri: item.userImage || item.retailerImage || 'https://via.placeholder.com/100',
          }}
          style={styles.availableItemImage}
        />
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Icon name="checkmark-circle" size={28} color={theme.colors.accent} />
          </View>
        )}
        <View style={styles.availableItemInfo}>
          <Text style={styles.availableItemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.availableItemCategory}>{item.category}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategoryFilter = ({ item }: { item: typeof categories[0] }) => (
    <TouchableOpacity
      style={[
        styles.categoryChip,
        filterCategory === item.id && styles.categoryChipActive,
      ]}
      onPress={() => setFilterCategory(item.id)}
    >
      <Icon
        name={item.icon}
        size={18}
        color={filterCategory === item.id ? '#FFFFFF' : theme.colors.mediumGray}
      />
      <Text
        style={[
          styles.categoryChipText,
          filterCategory === item.id && styles.categoryChipTextActive,
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Outfit</Text>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSaveOutfit}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Outfit Name Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Outfit Name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g., Summer Brunch, Office Look"
            placeholderTextColor={theme.colors.mediumGray}
            value={outfitName}
            onChangeText={setOutfitName}
          />
        </View>

        {/* Occasion Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Occasion</Text>
          <TouchableOpacity
            style={styles.occasionButton}
            onPress={() => setShowOccasionModal(true)}
          >
            <Icon
              name={occasions.find((o) => o.id === occasion)?.icon || 'calendar-outline'}
              size={20}
              color={theme.colors.text}
            />
            <Text style={styles.occasionButtonText}>
              {occasions.find((o) => o.id === occasion)?.label || 'Select Occasion'}
            </Text>
            <Icon name="chevron-down" size={20} color={theme.colors.mediumGray} />
          </TouchableOpacity>
        </View>

        {/* Selected Items Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Selected Items</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{selectedItems.length}</Text>
            </View>
          </View>

          {selectedItems.length > 0 ? (
            <FlatList
              data={selectedItems}
              renderItem={renderSelectedItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedItemsList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Icon name="add-circle-outline" size={48} color={theme.colors.lightGray} />
              <Text style={styles.emptyStateText}>
                Select items below to build your outfit
              </Text>
            </View>
          )}
        </View>

        {/* Category Filters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Browse Items</Text>
          <FlatList
            data={categories}
            renderItem={renderCategoryFilter}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterList}
          />
        </View>

        {/* Available Items Grid */}
        <View style={styles.section}>
          <Text style={styles.itemsCountText}>
            {filteredItems.length} items available
          </Text>
          <View style={styles.itemsGrid}>
            {filteredItems.map((item) => (
              <View key={item.id} style={styles.gridItem}>
                {renderAvailableItem({ item })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Occasion Modal */}
      <Modal
        visible={showOccasionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOccasionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Occasion</Text>
              <TouchableOpacity onPress={() => setShowOccasionModal(false)}>
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {occasions.map((occ) => (
                <TouchableOpacity
                  key={occ.id}
                  style={[
                    styles.occasionOption,
                    occasion === occ.id && styles.occasionOptionActive,
                  ]}
                  onPress={() => {
                    setOccasion(occ.id);
                    setShowOccasionModal(false);
                  }}
                >
                  <Icon
                    name={occ.icon}
                    size={24}
                    color={occasion === occ.id ? theme.colors.accent : theme.colors.mediumGray}
                  />
                  <Text
                    style={[
                      styles.occasionOptionText,
                      occasion === occ.id && styles.occasionOptionTextActive,
                    ]}
                  >
                    {occ.label}
                  </Text>
                  {occasion === occ.id && (
                    <Icon name="checkmark" size={24} color={theme.colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
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
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.colors.accent,
    borderRadius: 20,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countBadge: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  occasionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  occasionButtonText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
  },
  selectedItemsList: {
    paddingVertical: 8,
  },
  selectedItemCard: {
    width: 80,
    marginRight: 12,
    alignItems: 'center',
  },
  selectedItemImage: {
    width: 80,
    height: 100,
    borderRadius: 12,
    backgroundColor: theme.colors.mutedBackground,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    ...theme.shadows.subtle,
  },
  selectedItemName: {
    fontSize: 12,
    color: theme.colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.lightGray,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    marginTop: 12,
    textAlign: 'center',
  },
  categoryFilterList: {
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.mediumGray,
    marginLeft: 6,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  itemsCountText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
    marginBottom: 12,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  availableItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    ...theme.shadows.subtle,
  },
  availableItemSelected: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  availableItemImage: {
    width: '100%',
    height: 160,
    backgroundColor: theme.colors.mutedBackground,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    ...theme.shadows.card,
  },
  availableItemInfo: {
    padding: 12,
  },
  availableItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 4,
  },
  availableItemCategory: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    textTransform: 'capitalize',
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
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  occasionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  occasionOptionActive: {
    backgroundColor: theme.colors.mutedBackground,
  },
  occasionOptionText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 16,
  },
  occasionOptionTextActive: {
    fontWeight: '600',
    color: theme.colors.accent,
  },
});

export default CreateOutfitScreen;
