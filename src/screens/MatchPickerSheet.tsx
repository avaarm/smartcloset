/**
 * MatchPickerSheet — "Which one is this?" section shown after AI analysis.
 *
 * Three ordered result tiers:
 *   1. Knowledge-base matches (crowd-sourced, high confidence)
 *   2. Vision lens shopping results (web detection, filtered + ranked)
 *   3. User-driven extra searches (text, URL paste, curated catalog browse)
 *
 * Tapping any candidate auto-fills the Add Item form + records a contribution
 * to the KB (source = 'kb_match' | 'lens_match'). "Enter manually" dismisses
 * the sheet — and that manual save also becomes a contribution (source =
 * 'manual'), growing the KB either way.
 */

import React, { useCallback, useState } from 'react';
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
  rankCatalogByAttributes,
  searchProductsByText,
  type LensResult,
} from '../services/lensSearchService';
import { fetchProductMetadata } from '../services/productUrlService';
import type { KBMatch } from '../services/productContributions';
import type { RecognitionResult } from '../services/imageRecognition';
import theme from '../styles/theme';

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
  /** Detection attributes used to re-rank any user-driven searches. */
  detection?: RecognitionResult | null;
  onPick: (match: PickedMatch) => void;
  onSkip: () => void;
};

type ExtraSource = 'text' | 'url' | 'catalog';

const MatchPickerSheet: React.FC<Props> = ({
  loading,
  kbMatches,
  lensResults,
  detection,
  onPick,
  onSkip,
}) => {
  // Additional results from user-driven searches (text / URL / catalog browse)
  const [extraResults, setExtraResults] = useState<LensResult[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [activeInput, setActiveInput] = useState<ExtraSource | null>(null);
  const [textQuery, setTextQuery] = useState('');
  const [urlQuery, setUrlQuery] = useState('');

  const hasResults =
    kbMatches.length > 0 || lensResults.length > 0 || extraResults.length > 0;

  // ── Extra search handlers ──

  const runTextSearch = useCallback(async () => {
    const q = textQuery.trim();
    if (!q) return;
    setExtraLoading(true);
    try {
      const resp = await searchProductsByText(q);
      // Only keep shopping-domain results with a real image URL —
      // everything else (YouTube, Pinterest, blogs) is dropped upstream
      // by lensSearchService, but belt-and-braces here too.
      const shopOnly = resp.results.filter(
        r => r.isShopping && /^https?:\/\//i.test(r.imageUrl || ''),
      );
      setExtraResults(prev => mergeUniqueById(prev, shopOnly));
    } catch (err: any) {
      console.warn('[MatchPicker] text search failed:', err?.message);
    } finally {
      setExtraLoading(false);
    }
  }, [textQuery]);

  const runUrlLookup = useCallback(async () => {
    const u = urlQuery.trim();
    if (!u) return;
    setExtraLoading(true);
    try {
      const result = await fetchProductMetadata(u);
      if (result) {
        setExtraResults(prev => mergeUniqueById(prev, [result]));
        setUrlQuery('');
      } else {
        Alert.alert('Couldn\'t read that page', 'Try a different product URL.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to fetch URL');
    } finally {
      setExtraLoading(false);
    }
  }, [urlQuery]);

  const browseCatalog = useCallback(() => {
    const attrs = {
      color: detection?.color,
      subtype: detection?.subtype,
      category: detection?.category,
      material: detection?.material,
    };
    const ranked = rankCatalogByAttributes(attrs, 12);
    setExtraResults(prev => mergeUniqueById(prev, ranked));
    setActiveInput(null);
  }, [detection]);

  const toggleInput = useCallback((src: ExtraSource) => {
    setActiveInput(curr => (curr === src ? null : src));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {kbMatches.length > 0 ? '✨ Community match found' : 'Is it one of these?'}
          </Text>
          <Text style={styles.subtitle}>
            {kbMatches.length > 0
              ? 'Other users added this item. Tap to auto-fill.'
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

      {!loading && !hasResults && (
        <View style={styles.emptyWrap}>
          <Icon name="sparkles-outline" size={28} color={theme.colors.accent} />
          <Text style={styles.emptyTitle}>Be the first to add this!</Text>
          <Text style={styles.emptyText}>
            Search more sources below, or fill in the details directly. Your
            entry will teach the app to recognize this item next time — for you
            and anyone else who uploads a similar photo.
          </Text>
        </View>
      )}

      {!loading && hasResults && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {kbMatches.map((m, idx) => (
              <KBCard key={`kb-${idx}`} match={m} onPick={onPick} />
            ))}
            {lensResults.map(r => (
              <LensCard key={`lens-${r.id}`} result={r} onPick={onPick} badge="Shop" />
            ))}
            {extraResults.map(r => (
              <LensCard key={`extra-${r.id}`} result={r} onPick={onPick} badge="More" />
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
          <ToolbarButton
            icon="grid-outline"
            label="Browse"
            active={false}
            onPress={browseCatalog}
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
      {(match.brand || match.retailer) && (
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
  badge: string;
}> = ({ result, onPick, badge }) => {
  const parsedCost = (() => {
    if (!result.price) return undefined;
    const n = parseFloat(result.price.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const brandGuess = (() => {
    const host = result.source.replace(/^www\./, '').split('.')[0];
    if (host && !['www', 'shop', 'store', 'us', 'uk'].includes(host)) {
      return host.charAt(0).toUpperCase() + host.slice(1);
    }
    return undefined;
  })();

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
          imageUrl: result.imageUrl,
          source: 'lens_match',
        })
      }
    >
      {/^https?:\/\//i.test(result.imageUrl || '') ? (
        <Image source={{ uri: result.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Icon name="image-outline" size={24} color={theme.colors.mediumGray} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.shopBadge}>
          <Text style={styles.shopBadgeText}>{badge}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {result.title}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {result.source}
        </Text>
        {result.price && <Text style={styles.cardPrice}>{result.price}</Text>}
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
  emptyTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
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
  shopBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  shopBadgeText: { fontSize: 9, fontWeight: '600', color: '#FFFFFF' },
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
