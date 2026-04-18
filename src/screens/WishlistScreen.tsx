import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, ActivityIndicator, SafeAreaView, StatusBar, Image, Alert, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ClothingItem as ClothingItemType } from '../types';
import { getClothingItems, saveClothingItem, deleteClothingItem } from '../services/storage';
import ClothingItem from '../components/ClothingItem';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import theme from '../styles/theme';
import { sampleClothes } from '../data/sampleClothes';
import WishlistSearchModal from './WishlistSearchModal';

const WishlistScreen = () => {
  const navigation = useNavigation();
  const [items, setItems] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState(0);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    loadWishlistItems();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadWishlistItems();
    });
    return unsubscribe;
  }, [navigation]);

  const loadWishlistItems = async () => {
    try {
      const allItems = await getClothingItems();
      const wishlistItems = allItems.filter(item => item.isWishlist === true);
      setItems(wishlistItems);
    } catch (error) {
      console.error('Error loading wishlist items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSampleData = async () => {
    Alert.alert(
      'Load Sample Data',
      'This will add sample wishlist items to your collection. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load',
          onPress: async () => {
            try {
              // Take first 5 items from sample data and mark as wishlist
              const wishlistSamples = sampleClothes.slice(0, 5).map(item => ({
                ...item,
                id: `wishlist-${Date.now()}-${item.id}`,
                isWishlist: true,
                dateAdded: new Date().toISOString(),
              }));

              for (const item of wishlistSamples) {
                await saveClothingItem(item);
              }

              await loadWishlistItems();
              Alert.alert('Success', 'Sample wishlist items added!');
            } catch (error) {
              Alert.alert('Error', 'Failed to load sample data');
            }
          },
        },
      ]
    );
  };

  const handleMoveToWardrobe = async (item: ClothingItemType) => {
    Alert.alert(
      'Move to Wardrobe',
      `Move "${item.name}" to your wardrobe?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            try {
              await deleteClothingItem(item.id);
              const updatedItem = { ...item, isWishlist: false };
              await saveClothingItem(updatedItem);
              await loadWishlistItems();
              Alert.alert('Success', 'Item moved to wardrobe!');
            } catch (error) {
              Alert.alert('Error', 'Failed to move item');
            }
          },
        },
      ]
    );
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteClothingItem(id);
      await loadWishlistItems();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete item');
    }
  };

  const handleEditItem = (item: ClothingItemType) => {
    (navigation as any).navigate('AddClothing', { item });
  };

  const handleSaveBudget = () => {
    const amount = parseFloat(budgetInput);
    if (!isNaN(amount) && amount >= 0) {
      setBudget(amount);
      setShowBudgetModal(false);
      setBudgetInput('');
    } else {
      Alert.alert('Invalid Amount', 'Please enter a valid budget amount');
    }
  };

  const renderItem = ({ item }: { item: ClothingItemType }) => (
    <ClothingItem
      item={item}
      onPress={() => (navigation as any).navigate('ItemDetails', { item })}
      onEdit={handleEditItem}
      onDelete={handleDeleteItem}
      showActions={true}
    />
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>My Wishlist</Text>
            <Text style={styles.headerSubtitle}>{items.length} items</Text>
          </View>
          <TouchableOpacity
            style={styles.sampleButton}
            onPress={handleAddSampleData}
          >
            <Icon name="download-outline" size={20} color={theme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <View style={styles.statsContainer}>
                  <View style={styles.statCard}>
                    <Icon name="heart" size={24} color={theme.colors.accent} />
                    <Text style={styles.statNumber}>{items.length}</Text>
                    <Text style={styles.statLabel}>Items</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.statCard}
                    onPress={() => setShowBudgetModal(true)}
                  >
                    <Icon name="wallet" size={24} color={theme.colors.accent} />
                    <Text style={styles.statNumber}>${budget}</Text>
                    <Text style={styles.statLabel}>Budget</Text>
                    <Icon name="pencil" size={14} color={theme.colors.mediumGray} style={{ marginTop: 4 }} />
                  </TouchableOpacity>
                </View>
                {items.length > 0 && (
                  <View style={styles.actionsBar}>
                    <Text style={styles.actionsText}>Long press items to edit or delete</Text>
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Icon name="heart-outline" size={80} color={theme.colors.lightGray} />
                <Text style={styles.emptyStateTitle}>Your wishlist is empty</Text>
                <Text style={styles.emptyStateText}>
                  Search the web for items you'd love to own
                </Text>
                <TouchableOpacity
                  style={styles.sampleDataButton}
                  onPress={() => setShowSearchModal(true)}
                >
                  <Icon name="search" size={16} color="#FFFFFF" />
                  <Text style={styles.sampleDataButtonText}>Search Online</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sampleDataButton, styles.sampleDataButtonSecondary]}
                  onPress={handleAddSampleData}
                >
                  <Text style={[styles.sampleDataButtonText, { color: theme.colors.accent }]}>
                    Load Sample Items
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            Alert.alert('Add to Wishlist', undefined, [
              {
                text: 'Search online',
                onPress: () => setShowSearchModal(true),
              },
              {
                text: 'Add manually',
                onPress: () =>
                  (navigation as any).navigate('AddClothing', { isWishlist: true }),
              },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
          accessibilityLabel="Add to wishlist"
          accessibilityRole="button"
        >
          <LinearGradient
            colors={theme.colors.gradient.primary}
            style={styles.addButtonGradient}
          >
            <Icon name="add" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Search modal */}
      <WishlistSearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onAdded={loadWishlistItems}
      />

      {/* Budget Modal */}
      <Modal
        visible={showBudgetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBudgetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Budget</Text>
              <TouchableOpacity onPress={() => setShowBudgetModal(false)}>
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Set a budget to track your wishlist spending
            </Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={budgetInput}
                onChangeText={setBudgetInput}
                placeholderTextColor={theme.colors.mediumGray}
              />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
              <Text style={styles.saveButtonText}>Save Budget</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sampleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '48%',
    alignItems: 'center',
    ...theme.shadows.subtle,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '300',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionsBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.colors.mutedBackground,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
  },
  actionsText: {
    fontSize: 13,
    color: theme.colors.mediumGray,
    textAlign: 'center',
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
    padding: theme.spacing.small,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 80,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '300',
    color: theme.colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '400',
    color: theme.colors.mediumGray,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  sampleDataButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sampleDataButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  sampleDataButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  addButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.colors.mediumGray,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: '300',
    color: theme.colors.text,
    paddingVertical: 16,
  },
  saveButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default WishlistScreen;
