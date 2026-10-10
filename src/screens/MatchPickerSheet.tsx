/**
 * MatchPickerSheet — "Which one is this?" section shown after AI analysis.
 *
 * Ordered result tiers:
 *   1. Knowledge-base matches (crowd-sourced, high confidence)
 *   2. Web results: the Vision lens search and the person's own extra searches
 *      (text, URL paste), together ranked shops first and second-hand last,
 *      each card labelled with the kind of site
 *
 * Only real matches are ever shown. When there are none (or the search
 * failed) the sheet says so and the user fills in the details themselves.
 *
 * Tapping any candidate auto-fills the Add Item form + records a contribution
 * to the KB (source = 'kb_match' | 'lens_match'). "Enter manually" dismisses
 * the sheet — and that manual save also becomes a contribution (source =
 * 'manual'), growing the KB either way.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  searchProductsByText,
  toSecureImageUrl,
  type LensResult,
} from '../services/lensSearchService';
import { fetchProductMetadata } from '../services/productUrlService';
import { brandFromHost, sourceKindOf } from '../services/retailerDomains';
import { sortByTier } from '../services/searchRanking';
import type { KBMatch } from '../services/productContributions';
import theme from '../styles/theme';
import SourceKindBadge from '../components/SourceKindBadge';

export type PickedMatch = {
  name: string;
  category?: string;
  brand?: string;
  retailer?: string;
  color?: string;
  material?: string;
  /** What contributors paid on average (for KB matches) or the listed price (for lens matches). */
  cost?: number;
  /** Retail / MSRP — only set for KB matches with that signal aggregated. */
  retailCost?: number;
  sourceUrl?: string;
  imageUrl?: string;
  /** Where did this candidate come from. */
  source: 'kb_match' | 'lens_match';
};

type Props = {
  loading: boolean;
  kbMatches: KBMatch[];
  lensResults: LensResult[];
  /** Friendly reason the automatic match search failed (shown instead of "no matches"). */
  searchError?: string | null;
  onPick: (match: PickedMatch) => void;
  onSkip: () => void;
};

type ExtraSource = 'text' | 'url';

const MatchPickerSheet: React.FC<Props> = ({
  loading,
  kbMatches,
  lensResults,
  searchError,
  onPick,
  onSkip,
}) => {
  // Additional results from user-driven searches (text / URL)
  const [extraResults, setExtraResults] = useState<LensResult[]>([]);
  // A page the person pasted is the match they asked for: it stays first, whatever the site is.
  const [pastedResults, setPastedResults] = useState<LensResult[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  // Outcome of the last user-driven search when it found nothing or failed.
  const [extraMessage, setExtraMessage] = useState<string | null>(null);
  const [activeInput, setActiveInput] = useState<ExtraSource | null>(null);
  const [textQuery, setTextQuery] = useState('');
  const [urlQuery, setUrlQuery] = useState('');

  // One list, so a shop found by the person's own search is not stuck behind
  // second-hand listings from the photo search. Ties keep their order.
  const webResults = useMemo(() => {
    const seen = new Set(lensResults.map(r => r.url));
    const card = (r: LensResult, key: string) => ({ r, key, source: r.source, sourceKind: sourceKindOf(r) });
    return sortByTier([
      ...lensResults.map(r => card(r, `lens-${r.id}`)),
      ...extraResults.filter(r => !seen.has(r.url)).map(r => card(r, `extra-${r.id}`)),
    ]);
  }, [lensResults, extraResults]);

  const hasResults = kbMatches.length > 0 || pastedResults.length > 0 || webResults.length > 0;

  // ── Extra search handlers ──

  const runTextSearch = useCallback(async () => {
    const q = textQuery.trim();
    if (!q) return;
    setExtraLoading(true);
    setExtraMessage(null);
    try {
      const resp = await searchProductsByText(q);
      // A card without a picture is no use for picking a match. YouTube,
      // Pinterest and blogs are already dropped by lensSearchService.
      const withImage = resp.results.filter(r => !!toSecureImageUrl(r.imageUrl));
      setExtraResults(prev => mergeUniqueById(prev, withImage));
      if (resp.error) setExtraMessage(resp.error);
      else if (withImage.length === 0) setExtraMessage('No shop results for that. Try fewer words.');
    } catch (err: any) {
      console.warn('[MatchPicker] text search failed:', err?.message);
      setExtraMessage("Couldn't search right now. Check your connection and try again.");
    } finally {
      setExtraLoading(false);
    }
  }, [textQuery]);

  const runUrlLookup = useCallback(async () => {
    const u = urlQuery.trim();
    if (!u) return;
    setExtraLoading(true);
    setExtraMessage(null);
    try {
      const result = await fetchProductMetadata(u);
      if (result) {
        setPastedResults(prev => mergeUniqueById(prev, [result]));
        setUrlQuery('');
      } else {
        Alert.alert('Couldn\'t read that page', 'Try a different product URL.');
      }
    } catch (err: any) {
      console.warn('[MatchPicker] URL lookup failed:', err?.message);
      Alert.alert('Couldn\'t read that page', 'Check the link and your connection, then try again.');
    } finally {
      setExtraLoading(false);
    }
  }, [urlQuery]);

  const toggleInput = useCallback((src: ExtraSource) => {
    setActiveInput(curr => (curr === src ? null : src));
  }, []);

  const empty = !loading && !hasResults;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {kbMatches.length > 0
              ? '✨ Community match found'
              : empty
                ? searchError ? "Couldn't search for matches" : 'No matches found'
                : 'Is it one of these?'}
          </Text>
          <Text style={styles.subtitle}>
            {kbMatches.length > 0
              ? 'Other users added this item. Tap to auto-fill.'
              : empty
                ? 'You can still fill in the details yourself.'
                : 'Pick the closest match, or search more to teach the app.'}
          </Text>
        </View>
        <Pressable onPress={onSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Enter manually</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Finding matches…</Text>
        </View>
      )}

      {empty && (
        <View style={styles.emptyWrap}>
          <Icon
            name={searchError ? 'cloud-offline-outline' : 'search-outline'}
            size={28}
            color={theme.colors.mediumGray}
          />
          <Text style={styles.emptyText}>
            {searchError || 'Try a text or URL search below, or fill in the details directly.'}
          </Text>
        </View>
      )}

      {!loading && hasResults && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {kbMatches.map((m, idx) => (
              <KBCard key={`kb-${idx}`} match={m} onPick={onPick} />
            ))}
            {pastedResults.map(r => (
              <LensCard key={`pasted-${r.id}`} result={r} onPick={onPick} />
            ))}
            {webResults.map(({ r, key }) => (
              <LensCard key={key} result={r} onPick={onPick} />
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── More search options toolbar ── */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarLabel}>Search more:</Text>
        <View style={styles.toolbarRow}>
          <ToolbarButton
            icon="search"
            label="Text"
            active={activeInput === 'text'}
            onPress={() => toggleInput('text')}
          />
          <ToolbarButton
            icon="link"
            label="URL"
            active={activeInput === 'url'}
            onPress={() => toggleInput('url')}
          />
        </View>
      </View>

      {/* Inline text search */}
      {activeInput === 'text' && (
        <View style={styles.inlineInputRow}>
          <TextInput
            style={styles.inlineInput}
            placeholder="e.g. 'burgundy leather clutch'"
            placeholderTextColor={theme.colors.mediumGray}
            value={textQuery}
            onChangeText={setTextQuery}
            onSubmitEditing={runTextSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.inlineGoButton} onPress={runTextSearch}>
            <Icon name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {/* Inline URL paste */}
      {activeInput === 'url' && (
        <View style={styles.inlineInputRow}>
          <TextInput
            style={styles.inlineInput}
            placeholder="https://www.bottegaveneta.com/..."
            placeholderTextColor={theme.colors.mediumGray}
            value={urlQuery}
            onChangeText={setUrlQuery}
            onSubmitEditing={runUrlLookup}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable style={styles.inlineGoButton} onPress={runUrlLookup}>
            <Icon name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {extraLoading && (
        <View style={styles.extraLoadingWrap}>
          <ActivityIndicator color={theme.colors.accent} size="small" />
          <Text style={styles.loadingText}>Looking that up…</Text>
        </View>
      )}

      {!extraLoading && !!extraMessage && (
        <Text style={styles.extraMessage}>{extraMessage}</Text>
      )}
    </View>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const mergeUniqueById = (existing: LensResult[], incoming: LensResult[]): LensResult[] => {
  const seen = new Set(existing.map(r => r.url));
  const newOnes = incoming.filter(r => !seen.has(r.url));
  return [...existing, ...newOnes];
};

// ─── Subcomponents ──────────────────────────────────────────────────────────

const ToolbarButton: React.FC<{
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[styles.toolbarButton, active && styles.toolbarButtonActive]}
  >
    <Icon name={icon} size={14} color={active ? '#FFFFFF' : theme.colors.accent} />
    <Text style={[styles.toolbarText, active && styles.toolbarTextActive]}>
      {label}
    </Text>
  </Pressable>
);

const KBCard: React.FC<{
  match: KBMatch;
  onPick: (p: PickedMatch) => void;
}> = ({ match, onPick }) => (
  <Pressable
    style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    onPress={() =>
      onPick({
        name: match.name,
        category: match.category,
        brand: match.brand,
        retailer: match.retailer,
        color: match.color,
        material: match.material,
        cost: match.cost,
        retailCost: (match as any).retailCost,
        sourceUrl: match.sourceUrl,
        source: 'kb_match',
      })
    }
  >
    <View style={[styles.cardImage, styles.cardImageKB]}>
      <Icon name="people" size={28} color="#FFFFFF" />
    </View>
    <View style={styles.cardBody}>
      <View style={styles.kbBadge}>
        <Text style={styles.kbBadgeText}>
          Community · {match.confirmationCount}×
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {match.name}
      </Text>
      {!!(match.brand || match.retailer) && (
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[match.brand, match.retailer].filter(Boolean).join(' · ')}
        </Text>
      )}
      {match.cost != null && (
        <Text style={styles.cardPrice}>${match.cost}</Text>
      )}
    </View>
  </Pressable>
);

const LensCard: React.FC<{
  result: LensResult;
  onPick: (p: PickedMatch) => void;
}> = ({ result, onPick }) => {
  const parsedCost = (() => {
    if (!result.price) return undefined;
    const n = parseFloat(result.price.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  // Retailer photos can fail to load (dead link, blocked host); show the
  // placeholder instead of an empty box.
  const imageUri = toSecureImageUrl(result.imageUrl);
  const [imageFailed, setImageFailed] = useState(false);

  // Only a brand's own site names the brand; eBay or a department store sells every brand.
  const brandGuess = brandFromHost(result.source);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={() =>
        onPick({
          name: result.title,
          brand: brandGuess,
          retailer: result.source,
          cost: parsedCost,
          sourceUrl: result.url,
          imageUrl: imageUri || undefined,
          source: 'lens_match',
        })
      }
    >
      {imageUri && !imageFailed ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
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
        <Text style={styles.cardMeta} numberOfLines={1}>
          {result.source}
        </Text>
        {!!result.price && <Text style={styles.cardPrice}>{result.price}</Text>}
      </View>
    </Pressable>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEAF0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  title: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.mediumGray, marginTop: 2 },
  skipButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  skipText: { fontSize: 12, color: theme.colors.accent, fontWeight: '500' },

  loadingWrap: { alignItems: 'center', paddingVertical: 20 },
  loadingText: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.mediumGray,
  },
  extraLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    lineHeight: 18,
  },

  row: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  card: {
    width: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cardImage: { width: '100%', height: 100 },
  cardImagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageKB: {
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 8 },
  kbBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  kbBadgeText: { fontSize: 9, fontWeight: '600', color: '#4338CA' },
  cardTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.text,
    lineHeight: 16,
  },
  cardMeta: {
    fontSize: 10,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 4,
  },

  extraMessage: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },

  toolbar: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.mediumGray,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    gap: 5,
  },
  toolbarButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  toolbarText: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '500',
  },
  toolbarTextActive: { color: '#FFFFFF' },

  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  inlineInput: {
    flex: 1,
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.text,
  },
  inlineGoButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MatchPickerSheet;
