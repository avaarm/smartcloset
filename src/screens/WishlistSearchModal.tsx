/**
 * WishlistSearchModal — "Google Lens for wishlist".
 *
 * Full-screen modal with two search modes:
 *   1. Text search — product search results from the web
 *   2. Photo search — reuse the existing Vision-based reverse-image pipeline.
 *      Once the photo has an answer, a box under it adds words to the photo's
 *      best guess ("black leather", "Coach") and shows those results in place of
 *      the photo's, with a way back to them.
 *
 * Shops come first and each card says what kind of site it is. Second-hand
 * listings (eBay, Poshmark...) are left out once there are enough shop
 * results, unless "Include resale" is on.
 *
 * Tap a result → saves it as a wishlist item (isWishlist=true) with the
 * retailer image, title, brand guess, source URL, and a best-guess category.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toSecureImageUrl, type LensResult } from '../services/lensSearchService';
import { brandFromHost, sourceKindOf } from '../services/retailerDomains';
import { categoryFromText } from '../utils/clothingCategories';
import { saveClothingItem } from '../services/storage';
import { buildWishlistItem } from '../services/wishlistItemBuilder';
import { categoryLabel } from '../utils/clothingOptions';
import { noteAddedItem } from '../utils/askWardrobeFor';
import type { ClothingCategory } from '../types/clothing';
import theme from '../styles/theme';
import {
  EMPTY_PHOTO_RESULTS_MESSAGE,
  EMPTY_TEXT_RESULTS_MESSAGE,
  useProductSearch,
} from '../hooks/useProductSearch';
import IncludeResaleToggle from '../components/IncludeResaleToggle';
import RefineChips from '../components/RefineChips';
import RefineSearchBar from '../components/RefineSearchBar';
import SourceKindBadge from '../components/SourceKindBadge';
import { KeyboardSafeScrollView } from '../components/KeyboardSafe';

export { EMPTY_PHOTO_RESULTS_MESSAGE, EMPTY_TEXT_RESULTS_MESSAGE };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after an item is successfully added so the parent can refresh. */
  onAdded?: () => void;
};

type Mode = 'text' | 'image';

// ─── Heuristic parsers ──────────────────────────────────────────────────────

// The shared whole-word matcher: a bag is bags, a necklace jewelry, a hat hats. A
// title that names no product ("Andiamo Large") is a small thing of some kind.
export const guessCategory = (title: string): ClothingCategory =>
  categoryFromText(title) ?? 'accessories';

// Only a brand's own site says what the brand is. A department store, eBay or a
// shop we do not know sells other people's brands, so the retailer is never the brand.
export const guessBrand = (source: string): string | undefined => brandFromHost(source);

// ─── Main component ─────────────────────────────────────────────────────────

const WishlistSearchModal: React.FC<Props> = ({ visible, onClose, onAdded }) => {
  const [mode, setMode] = useState<Mode>('text');
  const [addingId, setAddingId] = useState<string | null>(null);
  // The searching is shared with "Search a look". It also holds the words typed in the
  // search box and the refine box, so flipping between the tabs never loses them.
  const search = useProductSearch();
  const { response, results, loading, kind, reset: resetSearch } = search;

  const handleClose = useCallback(() => {
    resetSearch();
    setAddingId(null);
    onClose();
  }, [onClose, resetSearch]);

  const addToWishlist = useCallback(
    async (r: LensResult) => {
      setAddingId(r.id);
      try {
        // The photo is read first (a few seconds) so the item lands in the right category with
        // its colour, rather than guessed from the title; the button shows progress meanwhile.
        const { item } = await buildWishlistItem(r);
        await saveClothingItem(item);
        // Counts toward who the wardrobe is for; no question here, the confirmation below is enough for one tap.
        noteAddedItem({ category: item.category, subcategory: item.subcategory, name: item.name }, { ask: false });
        onAdded?.();
        const savedAs = [categoryLabel(item.category), item.subcategory].filter(Boolean).join(' · ');
        Alert.alert('Added to Wishlist', `"${r.title.substring(0, 50)}" saved as ${savedAs}. You can change this from the item.`, [
          { text: 'Keep Searching', style: 'default' },
          { text: 'Done', onPress: handleClose },
        ]);
      } catch (err: any) {
        Alert.alert('Error', 'Failed to add item. Please try again.');
        console.error('[WishlistSearchModal] save failed:', err);
      } finally {
        setAddingId(null);
      }
    },
    [handleClose, onAdded],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            hitSlop={16}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Add from the web</Text>
          <View style={styles.headerIconBtn} />
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, mode === 'text' && styles.modeButtonActive]}
            onPress={() => setMode('text')}
          >
            <Icon
              name="search-outline"
              size={16}
              color={mode === 'text' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[styles.modeLabel, mode === 'text' && styles.modeLabelActive]}
            >
              Search
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'image' && styles.modeButtonActive]}
            onPress={() => setMode('image')}
          >
            <Icon
              name="camera-outline"
              size={16}
              color={mode === 'image' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[styles.modeLabel, mode === 'image' && styles.modeLabelActive]}
            >
              Photo
            </Text>
          </Pressable>
        </View>

        {/* Search input, or the photo picker with a box to refine its answer */}
        {mode === 'text' ? (
          <RefineSearchBar
            style={styles.searchBar}
            value={search.query}
            onChangeText={search.setQuery}
            onSubmit={search.searchText}
            placeholder="Try 'burgundy clutch' or 'white sneakers'"
            accessibilityLabel="Search for a product"
            autoFocus
          />
        ) : (
          <>
            <Pressable
              style={styles.photoPicker}
              onPress={search.searchPhoto}
              accessibilityRole="button"
              accessibilityLabel={search.photoUri ? 'Change the inspiration photo' : 'Pick an inspiration photo'}
            >
              {search.photoUri ? (
                <Image source={{ uri: search.photoUri }} style={styles.photoPickerImage} />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Icon name="image-outline" size={32} color={theme.colors.accent} />
                  <Text style={styles.photoPickerTitle}>Pick an inspiration photo</Text>
                  <Text style={styles.photoPickerSubtitle}>
                    We'll find visually similar items online
                  </Text>
                </View>
              )}
            </Pressable>
            {search.photoAnswer ? (
              <RefineSearchBar
                style={styles.searchBar}
                value={search.refineText}
                onChangeText={search.setRefineText}
                onSubmit={search.refine}
                placeholder="Add words: black leather, ankle, Coach..."
                accessibilityLabel="Add words to refine the photo results"
              />
            ) : null}
          </>
        )}

        <IncludeResaleToggle value={search.includeResale} onValueChange={search.setIncludeResale} />

        {/* Results: scroll clear of the keyboard that the search box opens */}
        <KeyboardSafeScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {kind === 'refined' && (
            <Pressable
              onPress={search.backToPhoto}
              hitSlop={8}
              style={styles.backLink}
              accessibilityRole="button"
              accessibilityLabel="Back to photo results"
            >
              <Icon name="arrow-back" size={16} color={theme.colors.accent} />
              <Text style={styles.backLinkText}>Back to photo results</Text>
            </Pressable>
          )}

          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
              <Text style={styles.mutedText}>Searching the web…</Text>
            </View>
          )}

          {!loading && response?.error && (
            <View style={styles.errorBox}>
              <Icon name="alert-circle-outline" size={20} color="#EF4444" />
              <Text style={styles.errorText}>{response.error}</Text>
            </View>
          )}

          {!loading && response?.notConfigured && (
            <View style={styles.hintBox}>
              <Icon
                name="information-circle-outline"
                size={20}
                color={theme.colors.accent}
              />
              <Text style={styles.hintText}>
                Photo search isn't available right now. Try searching by text
                instead.
              </Text>
            </View>
          )}

          {!loading && !!response?.query && results.length > 0 && (
            <Text style={styles.resultsCount}>
              {results.length} result
              {results.length !== 1 ? 's' : ''} for{' '}
              <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
                "{response.query}"
              </Text>
            </Text>
          )}

          {!loading && <RefineChips words={search.suggestions} onPick={search.addWord} style={styles.chips} />}

          {!loading &&
            response &&
            results.length === 0 &&
            !response.error &&
            !response.notConfigured && (
              <View style={styles.emptyBox}>
                <Icon name="search-outline" size={40} color={theme.colors.lightGray} />
                <Text style={[styles.mutedText, styles.emptyMessage]}>
                  {kind === 'photo' ? EMPTY_PHOTO_RESULTS_MESSAGE : EMPTY_TEXT_RESULTS_MESSAGE}
                </Text>
              </View>
            )}

          {!loading && results.length > 0 && (
            <View style={styles.grid}>
              {results.map(r => (
                <ResultCard
                  key={r.id}
                  result={r}
                  adding={addingId === r.id}
                  disabled={addingId !== null}
                  onAdd={() => addToWishlist(r)}
                />
              ))}
            </View>
          )}

          {/* First-run empty state */}
          {!loading && !response && (
            <View style={styles.emptyBox}>
              <Icon
                name={mode === 'text' ? 'search' : 'camera'}
                size={42}
                color={theme.colors.lightGray}
              />
              <Text style={styles.emptyTitle}>
                {mode === 'text'
                  ? 'Search for items to add'
                  : 'Pick a photo to find similar'}
              </Text>
              <Text style={styles.emptyBody}>
                {mode === 'text'
                  ? 'Find clothes by name, brand, color, or style from real retailers.'
                  : 'Use a screenshot of something you saw online and we\'ll find it. Then add words like a color or a brand to narrow it down.'}
              </Text>
            </View>
          )}
        </KeyboardSafeScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ─── Result card ────────────────────────────────────────────────────────────

const ResultCard: React.FC<{
  result: LensResult;
  adding: boolean;
  disabled: boolean;
  onAdd: () => void;
}> = ({ result, adding, disabled, onAdd }) => {
  // iOS blocks plain-http images, so use the https form of the link and fall
  // back to the placeholder if the picture can't be loaded.
  const imageUri = toSecureImageUrl(result.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <Pressable
      onPress={onAdd}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.75 : disabled && !adding ? 0.5 : 1 },
      ]}
    >
      {imageUri && !imageFailed ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Icon name="image-outline" size={24} color={theme.colors.mediumGray} />
        </View>
      )}
      <View style={styles.cardBody}>
        <SourceKindBadge kind={sourceKindOf(result)} />
        <Text style={styles.cardTitle} numberOfLines={2}>
          {result.title}
        </Text>
        <Text style={styles.cardSource} numberOfLines={1}>
          {result.source}
        </Text>
        <View style={styles.cardFooter}>
          {result.price ? (
            <Text style={styles.cardPrice}>{result.price}</Text>
          ) : (
            <View />
          )}
          <View style={styles.addBadge}>
            {adding ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Icon name="add" size={16} color="#FFFFFF" />
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },

  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  modeLabel: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  modeLabelActive: { color: '#FFFFFF' },

  searchBar: {
    marginHorizontal: 16,
    marginTop: 14,
  },

  photoPicker: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: theme.colors.mutedBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPickerImage: { width: '100%', height: '100%' },
  photoPickerTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  photoPickerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.mediumGray,
  },

  scroll: { flex: 1, marginTop: 8 },

  loadingWrap: { alignItems: 'center', paddingVertical: 60 },
  mutedText: { color: theme.colors.mediumGray, fontSize: 14, marginTop: 12 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  errorText: { marginLeft: 8, color: '#EF4444', flex: 1, fontSize: 13 },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.muted,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  hintText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 13,
    color: theme.colors.mediumGray,
    lineHeight: 18,
  },

  chips: { marginHorizontal: 16, marginBottom: 12 },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
  },
  backLinkText: { fontSize: 14, fontWeight: '500', color: theme.colors.accent },

  resultsCount: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
    fontSize: 13,
    color: theme.colors.mediumGray,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyMessage: { marginTop: 12, textAlign: 'center', lineHeight: 20 },
  emptyTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  emptyBody: {
    marginTop: 6,
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: 13,
    paddingHorizontal: 40,
    lineHeight: 18,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardImage: { width: '100%', height: 160 },
  cardImagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 10 },
  cardTitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: theme.colors.text,
  },
  cardSource: {
    fontSize: 11,
    marginTop: 2,
    color: theme.colors.mediumGray,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default WishlistSearchModal;
