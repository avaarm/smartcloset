import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Pressable, Text, ActivityIndicator, SafeAreaView, StatusBar, Alert, TextInput, Modal, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ClothingItem as ClothingItemType } from '../types';
import { getWishlistClothingItems, saveClothingItem, deleteClothingItem, updateClothingItem } from '../services/storage';
import ClothingItem from '../components/ClothingItem';
import { CARD_MARGIN, GRID_COLUMNS, GRID_SIDE_PADDING, gridCardWidth } from '../utils/clothingGrid';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import theme from '../styles/theme';
import { sampleClothes } from '../data/sampleClothes';
import WishlistSearchModal from './WishlistSearchModal';
import LoadError from '../components/LoadError';
import { BodyProfile, getBodyProfile } from '../services/profileService';
import { itemCountLabel } from '../utils/itemCountLabel';
import { formatMoney, formatMoneyCents } from '../utils/itemValue';
import { KeyboardActionBar, KeyboardSafeView } from '../components/KeyboardSafe';
import {
  budgetStatus,
  getWishlistBudget,
  parseBudgetInput,
  setWishlistBudget,
  wishlistItemPrice,
  wishlistTotals,
} from '../services/wishlistBudget';

// Height of the price line under each card. It is drawn inside the grid cell
// (see styles.cell), so every cell in a row reserves the same room for it.
const PRICE_STRIP_HEIGHT = 28;
// The price line and the sheet's close button are small; this brings them nearer iOS's 44pt touch target.
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
// The price line sits directly under its card, so its touch area must not reach up into the card's Move button.
const PRICE_HIT_SLOP = { top: 0, bottom: 8, left: 8, right: 8 };
const BUDGET_SAVE_ACCESSORY_ID = 'smartcloset-budget-save';

const WishlistScreen = () => {
  const navigation = useNavigation();
  const [items, setItems] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Read once here (not per card) for the colour-match hint on each card.
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // Reloads overlap (focus, then a delete or move right after). Only the latest
  // may write, or a slow earlier answer would put back an item just removed.
  const latestLoad = useRef(0);
  // Bumped whenever the budget is saved or cleared here, so a reload already in
  // flight can't put the number that was just replaced back on screen.
  const budgetVersion = useRef(0);
  // Return on the keyboard and a tap on Save can arrive together; one save is enough.
  const savingBudget = useRef(false);

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
    const id = ++latestLoad.current;
    const versionAtStart = budgetVersion.current;
    try {
      const [wishlistItems, bodyProfile, savedBudget] = await Promise.all([
        getWishlistClothingItems(),
        getBodyProfile().catch(() => null),
        getWishlistBudget(),
      ]);
      if (id !== latestLoad.current) return;
      setItems(wishlistItems);
      setProfile(bodyProfile);
      if (budgetVersion.current === versionAtStart) setBudget(savedBudget);
      setLoadFailed(false);
    } catch (error) {
      console.error('Error loading wishlist items:', error);
      // Keep whatever is already on screen; only a first load with nothing to show is an error state.
      if (id === latestLoad.current) setLoadFailed(true);
    } finally {
      if (id === latestLoad.current) setLoading(false);
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
              // Update in place: deleting first and re-inserting could lose the item
              // (and its id/history) if the second step failed. dateAdded restarts
              // because the wish date is not when you got it: it shows as recently added.
              await updateClothingItem({ ...item, isWishlist: false, dateAdded: new Date().toISOString() });
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
    // `editItem` is the param the Wardrobe and Item Details also use; the form reads its flags from it.
    (navigation as any).navigate('AddClothing', { editItem: item });
  };

  const openBudgetModal = () => {
    setBudgetInput(budget !== null ? String(budget) : '');
    setBudgetError(null);
    setShowBudgetModal(true);
  };

  const closeBudgetModal = () => setShowBudgetModal(false);

  // Save and clear share this: the modal stays open, with a message, if storage fails.
  const commitBudget = async (amount: number | null) => {
    if (savingBudget.current) return;
    savingBudget.current = true;
    try {
      const saved = await setWishlistBudget(amount);
      budgetVersion.current += 1;
      setBudget(saved);
      setShowBudgetModal(false);
    } catch (error) {
      console.error('Error saving wishlist budget:', error);
      setBudgetError("Couldn't save your budget. Please try again.");
    } finally {
      savingBudget.current = false;
    }
  };

  const handleSaveBudget = () => {
    const parsed = parseBudgetInput(budgetInput);
    if (!parsed.ok) {
      setBudgetError(parsed.message);
      return;
    }
    commitBudget(parsed.amount);
  };

  const cardWidth = gridCardWidth(windowWidth);

  // Prices usually have cents. Show them whenever any item has some, so the line prices
  // always add up to the total instead of each rounding on its own.
  const showCents = items.some(i => Math.round(wishlistItemPrice(i) * 100) % 100 !== 0);
  const money = showCents ? formatMoneyCents : formatMoney;
  const budgetMoney = budget !== null && Math.round(budget * 100) % 100 !== 0 ? formatMoneyCents : formatMoney;

  const renderItem = ({ item }: { item: ClothingItemType }) => {
    const price = wishlistItemPrice(item);
    return (
      <View style={styles.cell}>
        <ClothingItem
          item={item}
          onPress={() => (navigation as any).navigate('ItemDetails', { item })}
          onEdit={handleEditItem}
          onDelete={handleDeleteItem}
          onMoveToWardrobe={handleMoveToWardrobe}
          bodyProfile={profile}
          showActions={true}
        />
        <TouchableOpacity
          style={[styles.priceStrip, { width: cardWidth }]}
          onPress={() => handleEditItem(item)}
          hitSlop={PRICE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={price > 0 ? `Edit price of ${item.name}, ${money(price)}` : `Add price for ${item.name}`}
        >
          {price > 0 ? (
            <>
              <Text style={styles.priceText}>{money(price)}</Text>
              <Icon name="pencil" size={12} color={theme.colors.mediumGray} />
            </>
          ) : (
            <>
              <Icon name="add-circle-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.addPriceText}>Add price</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const { total, unpriced } = wishlistTotals(items);
  const status = budget !== null ? budgetStatus(total, budget) : null;

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
            <Text style={styles.headerSubtitle}>{itemCountLabel(items.length)}</Text>
          </View>
          {__DEV__ && (
            <TouchableOpacity
              style={styles.sampleButton}
              onPress={handleAddSampleData}
            >
              <Icon name="download-outline" size={20} color={theme.colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        ) : loadFailed && items.length === 0 ? (
          <LoadError what="wishlist" onRetry={loadWishlistItems} />
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            numColumns={GRID_COLUMNS}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <View style={styles.moneyWrap}>
                  <View style={styles.moneyCard}>
                    <View style={styles.moneyRow}>
                      <View
                        style={styles.moneyCell}
                        accessible
                        accessibilityLabel={`Wishlist total ${money(total)}${unpriced > 0 ? `, ${unpriced} without a price` : ''}`}
                      >
                        <Text style={styles.moneyLabel}>Wishlist total</Text>
                        <Text style={styles.moneyAmount} numberOfLines={1} adjustsFontSizeToFit>
                          {money(total)}
                        </Text>
                        {unpriced > 0 && <Text style={styles.moneyHint}>{`${unpriced} without a price`}</Text>}
                      </View>
                      <View style={styles.moneyDivider} />
                      <TouchableOpacity
                        style={styles.moneyCell}
                        onPress={openBudgetModal}
                        accessibilityRole="button"
                        accessibilityLabel={budget !== null ? `Budget ${budgetMoney(budget)}. Edit budget` : 'Budget not set. Set a budget'}
                      >
                        <View style={styles.moneyLabelRow}>
                          <Text style={styles.moneyLabel}>Budget</Text>
                          <Icon name="pencil" size={11} color={theme.colors.mediumGray} />
                        </View>
                        {budget !== null ? (
                          <Text style={styles.moneyAmount} numberOfLines={1} adjustsFontSizeToFit>
                            {budgetMoney(budget)}
                          </Text>
                        ) : (
                          <Text style={[styles.moneyAmount, styles.moneyAmountEmpty]}>Not set</Text>
                        )}
                        <Text style={styles.moneyHint}>{budget !== null ? 'Tap to edit' : 'Tap to set one'}</Text>
                      </TouchableOpacity>
                    </View>
                    {status && (
                      <View style={styles.meter}>
                        <View
                          style={styles.meterTrack}
                          accessibilityRole="progressbar"
                          accessibilityValue={{ min: 0, max: 100, now: Math.round(status.used * 100) }}
                        >
                          <View
                            style={[
                              styles.meterFill,
                              { width: `${Math.round(status.used * 100)}%` },
                              status.kind === 'over' && styles.meterFillOver,
                            ]}
                          />
                        </View>
                        <Text style={[styles.meterText, status.kind === 'over' && styles.meterTextOver]}>
                          {status.kind === 'under'
                            ? `Under budget by ${formatMoney(status.amount)}`
                            : status.kind === 'over'
                              ? `Over budget by ${formatMoney(status.amount)}`
                              : 'Right on budget'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {items.length > 0 && (
                  <View style={styles.actionsBar}>
                    <Text style={styles.actionsText}>Tap an item to see its details</Text>
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
                {__DEV__ && (
                  <TouchableOpacity
                    style={[styles.sampleDataButton, styles.sampleDataButtonSecondary]}
                    onPress={handleAddSampleData}
                  >
                    <Text style={[styles.sampleDataButtonText, { color: theme.colors.accent }]}>
                      Load Sample Items
                    </Text>
                  </TouchableOpacity>
                )}
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

      {/* Budget modal. The sheet rides above the keyboard, so the field and the buttons stay visible. */}
      <Modal
        visible={showBudgetModal}
        transparent
        animationType="slide"
        onRequestClose={closeBudgetModal}
      >
        <KeyboardSafeView style={styles.modalOverlay}>
          {/* The X is the control for VoiceOver; tapping the dimmed area is for everyone else. */}
          <Pressable style={styles.modalBackdrop} onPress={closeBudgetModal} accessible={false} testID="budget-backdrop" />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{budget !== null ? 'Edit Budget' : 'Set Budget'}</Text>
              <TouchableOpacity
                onPress={closeBudgetModal}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Set a budget to track your wishlist spending
            </Text>
            <View style={[styles.inputContainer, !!budgetError && styles.inputContainerError]}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={handleSaveBudget}
                inputAccessoryViewID={BUDGET_SAVE_ACCESSORY_ID}
                value={budgetInput}
                onChangeText={text => {
                  setBudgetInput(text);
                  setBudgetError(null);
                }}
                placeholderTextColor={theme.colors.mediumGray}
                autoFocus
                selectTextOnFocus
                accessibilityLabel="Budget in dollars"
              />
            </View>
            {!!budgetError && (
              <Text style={styles.inputError} accessibilityRole="alert">
                {budgetError}
              </Text>
            )}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveBudget}
              accessibilityRole="button"
              accessibilityLabel="Save budget"
            >
              <Text style={styles.saveButtonText}>Save Budget</Text>
            </TouchableOpacity>
            {budget !== null && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => commitBudget(null)}
                accessibilityRole="button"
                accessibilityLabel="Clear budget"
              >
                <Text style={styles.clearButtonText}>Clear budget</Text>
              </TouchableOpacity>
            )}
          </View>
          <KeyboardActionBar nativeID={BUDGET_SAVE_ACCESSORY_ID} label="Save" onPress={handleSaveBudget} />
        </KeyboardSafeView>
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
    paddingTop: theme.spacing.medium,
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
  moneyWrap: {
    paddingHorizontal: CARD_MARGIN,
    paddingVertical: 20,
  },
  moneyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...theme.shadows.subtle,
  },
  moneyRow: {
    flexDirection: 'row',
  },
  moneyCell: {
    flex: 1,
    alignItems: 'center',
  },
  moneyDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.lightGray,
    marginHorizontal: 12,
  },
  moneyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moneyLabel: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  moneyAmount: {
    fontSize: 28,
    fontWeight: '300',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  moneyAmountEmpty: {
    fontSize: 20,
    lineHeight: 34,
    color: theme.colors.accent,
  },
  moneyHint: {
    fontSize: 12,
    color: theme.colors.mediumGray,
  },
  meter: {
    marginTop: 16,
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  meterFillOver: {
    backgroundColor: theme.colors.danger,
  },
  meterText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    color: theme.colors.success,
  },
  meterTextOver: {
    color: theme.colors.danger,
  },
  actionsBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.colors.mutedBackground,
    marginHorizontal: CARD_MARGIN,
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
  // Same side padding the card width is computed from; the bottom clears the add button.
  grid: {
    paddingHorizontal: GRID_SIDE_PADDING,
    paddingBottom: 100,
  },
  // A row so the card (which stretches to its row) still fills the cell's height.
  // The cell's bottom padding is the room for the price line, which sits in it
  // (absolute, so it never changes the card's width) and starts where the card's
  // own bottom margin does, which makes it hug the card.
  cell: {
    flexDirection: 'row',
    paddingBottom: PRICE_STRIP_HEIGHT - CARD_MARGIN,
  },
  priceStrip: {
    position: 'absolute',
    bottom: 0,
    left: CARD_MARGIN,
    height: PRICE_STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  priceText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addPriceText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.accent,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  // Tapping the dimmed area above the sheet closes it.
  modalBackdrop: {
    flex: 1,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputContainerError: {
    borderColor: theme.colors.danger,
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
  inputError: {
    marginTop: -12,
    marginBottom: 16,
    fontSize: 13,
    color: theme.colors.danger,
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
  clearButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.danger,
  },
});

export default WishlistScreen;
