/**
 * WishlistSearchModal — "Google Lens for wishlist".
 *
 * Full-screen modal with two search modes:
 *   1. Text search — product search results from the web
 *   2. Photo search — reuse the existing Vision-based reverse-image pipeline
 *
 * Shops come first and each card says what kind of site it is. Second-hand
 * listings (eBay, Poshmark...) are left out once there are enough shop
 * results, unless "Include resale" is on.
 *
 * Tap a result → saves it as a wishlist item (isWishlist=true) with the
 * retailer image, title, brand guess, source URL, and a best-guess category.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  searchByImage,
  searchProductsByText,
  toSecureImageUrl,
  type LensResult,
  type LensSearchResponse,
} from '../services/lensSearchService';
import { brandFromHost, sourceKindOf } from '../services/retailerDomains';
import { selectVisibleResults } from '../services/searchRanking';
import { categoryFromText } from '../utils/clothingCategories';
import { pickImageFromLibrary } from '../platform/imagePicker';
import { saveClothingItem } from '../services/storage';
import type { ClothingCategory } from '../types/clothing';
import theme from '../styles/theme';
import IncludeResaleToggle from '../components/IncludeResaleToggle';
import SourceKindBadge from '../components/SourceKindBadge';

const SEARCH_FAILED_MESSAGE = "Couldn't search right now. Check your connection and try again.";

// Resale is already kept whenever shops are scarce, so "include resale" never fixes an empty list.
export const EMPTY_TEXT_RESULTS_MESSAGE = 'No results for that. Try different or fewer words.';
export const EMPTY_PHOTO_RESULTS_MESSAGE = 'No matches found. Try a clearer photo or a different angle.';

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

const parsePrice = (priceStr?: string): number | undefined => {
  if (!priceStr) return undefined;
  const cleaned = priceStr.replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// ─── Main component ─────────────────────────────────────────────────────────

const WishlistSearchModal: React.FC<Props> = ({ visible, onClose, onAdded }) => {
  const [mode, setMode] = useState<Mode>('text');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [response, setResponse] = useState<LensSearchResponse | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  // Kept while the modal stays mounted, so closing and reopening it does not
  // turn resale back off.
  const [includeResale, setIncludeResale] = useState(false);
  // A search that was started later (or the modal closing) makes an earlier
  // one's answer stale: it must not replace what is on screen.
  const searchSeq = useRef(0);
  // The text search the results on screen came from, so flipping "Include
  // resale" can repeat it. Null after a photo search, which already holds the
  // resale listings and only needs filtering.
  const shownTextQuery = useRef<string | null>(null);
  // Which kind of search the answer on screen came from: the tabs can be flipped
  // while it is showing, and its empty-state advice has to fit the search that ran.
  const [answerMode, setAnswerMode] = useState<Mode>('text');

  const resetState = useCallback(() => {
    searchSeq.current += 1;
    shownTextQuery.current = null;
    setQuery('');
    setPhotoUri(null);
    setResponse(null);
    setAddingId(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const searchText = useCallback(async (text: string, resale: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const seq = ++searchSeq.current;
    shownTextQuery.current = trimmed;
    setAnswerMode('text');
    setLoading(true);
    setResponse(null);
    try {
      const result = await searchProductsByText(trimmed, { includeResale: resale });
      if (seq === searchSeq.current) setResponse(result);
    } catch (err: any) {
      if (seq === searchSeq.current) {
        setResponse({ query: trimmed, bestGuessLabels: [], results: [], error: SEARCH_FAILED_MESSAGE });
      }
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  const runTextSearch = useCallback(() => searchText(query, includeResale), [searchText, query, includeResale]);

  const runImageSearch = useCallback(async () => {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    const seq = ++searchSeq.current;
    shownTextQuery.current = null;
    setAnswerMode('image');
    setPhotoUri(picked.uri);
    setLoading(true);
    setResponse(null);
    try {
      const result = await searchByImage(picked.uri);
      if (seq === searchSeq.current) setResponse(result);
    } catch (err: any) {
      if (seq === searchSeq.current) {
        setResponse({
          query: '',
          bestGuessLabels: [],
          results: [],
          error: SEARCH_FAILED_MESSAGE,
        });
      }
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  const toggleResale = useCallback(
    (value: boolean) => {
      setIncludeResale(value);
      if (shownTextQuery.current) searchText(shownTextQuery.current, value);
    },
    [searchText],
  );

  // A text search has already left resale out (or in); a photo search returns
  // everything, so the same rule is applied here to both.
  const results = useMemo(
    () => (response ? selectVisibleResults(response.results, includeResale) : []),
    [response, includeResale],
  );

  const addToWishlist = useCallback(
    async (r: LensResult) => {
      setAddingId(r.id);
      try {
        await saveClothingItem({
          id: `wish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: r.title,
          category: guessCategory(r.title),
          retailerImage: r.imageUrl,
          color: '',
          season: [],
          brand: guessBrand(r.source) || '',
          retailer: r.source,
          dateAdded: new Date().toISOString(),
          isWishlist: true,
          wearCount: 0,
          cost: parsePrice(r.price),
          notes: `Found via search. Source: ${r.url}`,
          tags: [],
          favorite: false,
        } as any);
        onAdded?.();
        Alert.alert('Added to Wishlist', `"${r.title.substring(0, 50)}" saved.`, [
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
          <Pressable onPress={handleClose} hitSlop={16} style={styles.headerIconBtn}>
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

        {/* Search input or photo picker */}
        {mode === 'text' ? (
          <View style={styles.searchBar}>
            <Icon name="search" size={18} color={theme.colors.mediumGray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Try 'burgundy clutch' or 'white sneakers'"
              placeholderTextColor={theme.colors.mediumGray}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runTextSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search for a product"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={12}>
                <Icon name="close-circle" size={18} color={theme.colors.mediumGray} />
              </Pressable>
            )}
          </View>
        ) : (
          <Pressable style={styles.photoPicker} onPress={runImageSearch}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPickerImage} />
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
        )}

        <IncludeResaleToggle value={includeResale} onValueChange={toggleResale} />

        {/* Results */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
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

          {!loading &&
            response &&
            results.length === 0 &&
            !response.error &&
            !response.notConfigured && (
              <View style={styles.emptyBox}>
                <Icon name="search-outline" size={40} color={theme.colors.lightGray} />
                <Text style={[styles.mutedText, styles.emptyMessage]}>
                  {answerMode === 'image' ? EMPTY_PHOTO_RESULTS_MESSAGE : EMPTY_TEXT_RESULTS_MESSAGE}
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
                  : 'Use a screenshot of something you saw online and we\'ll find it.'}
              </Text>
            </View>
          )}
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    padding: 0,
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
