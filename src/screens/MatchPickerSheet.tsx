/**
 * MatchPickerSheet — "Which one is this?" sheet shown after AI analysis.
 *
 * Renders a vertical list of candidate products:
 *   1. Knowledge-base matches (crowd-sourced, high confidence)  — shown first
 *   2. Lens shopping results (Vision web detection)              — shown next
 *
 * Tapping a candidate calls onPick with the full product details, which the
 * parent uses to auto-fill the Add Item form and record a contribution
 * (source = 'kb_match' or 'lens_match').
 *
 * "None of these" dismisses the sheet and lets the user fill manually; that
 * manual save becomes a contribution with source='manual', growing the KB.
 */

import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { LensResult } from '../services/lensSearchService';
import type { KBMatch } from '../services/productContributions';
import theme from '../styles/theme';

export type PickedMatch = {
  name: string;
  category?: string;
  brand?: string;
  retailer?: string;
  color?: string;
  material?: string;
  cost?: number;
  sourceUrl?: string;
  imageUrl?: string;
  /** Where did this candidate come from. */
  source: 'kb_match' | 'lens_match';
};

type Props = {
  loading: boolean;
  kbMatches: KBMatch[];
  lensResults: LensResult[];
  onPick: (match: PickedMatch) => void;
  onSkip: () => void;
};

const MatchPickerSheet: React.FC<Props> = ({
  loading,
  kbMatches,
  lensResults,
  onPick,
  onSkip,
}) => {
  const hasResults = kbMatches.length > 0 || lensResults.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Is it one of these?</Text>
          <Text style={styles.subtitle}>
            Pick the closest match to auto-fill, or skip to enter manually.
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
          <Icon name="search-outline" size={24} color={theme.colors.mediumGray} />
          <Text style={styles.emptyText}>
            No matches found. Add details manually below — your entry will
            help future uploads.
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
              <LensCard key={r.id} result={r} onPick={onPick} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

// ─── Cards ──────────────────────────────────────────────────────────────────

const KBCard: React.FC<{
  match: KBMatch;
  onPick: (p: PickedMatch) => void;
}> = ({ match, onPick }) => {
  return (
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
};

const LensCard: React.FC<{
  result: LensResult;
  onPick: (p: PickedMatch) => void;
}> = ({ result, onPick }) => {
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
      {result.imageUrl ? (
        <Image source={{ uri: result.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Icon name="image-outline" size={24} color={theme.colors.mediumGray} />
        </View>
      )}
      <View style={styles.cardBody}>
        {result.isShopping && (
          <View style={styles.shopBadge}>
            <Text style={styles.shopBadgeText}>Shop</Text>
          </View>
        )}
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

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
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
});

export default MatchPickerSheet;
