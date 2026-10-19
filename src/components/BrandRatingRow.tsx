/**
 * BrandRatingRow: the person's own rating of a whole brand, on the item's quality card. A brand they have not
 * rated yet is one prominent "Rate <Brand>" row; a rated one shows their stars, the scores they gave and an Edit
 * button. It only presents: the card owns the sheet (RateBrandSheet), the stored rating and the consent.
 * Independent of brand insights, so it is there whether or not other members' scores are shown.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { OVERALL_LABELS } from '../config/ratingVocabulary';
import theme from '../styles/theme';
import type { BrandRating } from '../types/rating';
import RatingScale from './RatingScale';

export const BRAND_PROMPT_HELPER = 'One rating for the whole brand.';

export interface BrandRatingRowProps {
  brand: string;
  /** The stored rating, or null when the brand has not been rated. */
  rating: BrandRating | null;
  /** Whether the rating adds to brand insights (a private one says so). */
  counts: boolean;
  /** Opens the brand rating sheet. */
  onPress: () => void;
  /** A line about the last save, such as why it stayed private. */
  notice?: string | null;
}

/** "Quality 4 · Size consistency 3": the optional scores that were given. */
export const brandDetailLine = (rating: BrandRating): string =>
  [
    rating.quality !== null ? `Quality ${rating.quality}` : '',
    rating.fitConsistency !== null ? `Size consistency ${rating.fitConsistency}` : '',
    rating.value !== null ? `Value ${rating.value}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

const BrandRatingRow: React.FC<BrandRatingRowProps> = ({ brand, rating, counts, onPress, notice }) => {
  const noticeLine = notice ? (
    <Text style={styles.notice} accessibilityLiveRegion="polite">
      {notice}
    </Text>
  ) : null;

  if (!rating) {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${brand}`}
          style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
        >
          <View style={styles.promptIcon}>
            <Icon name="ribbon-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={styles.promptText}>
            <Text style={styles.promptTitle}>{`Rate ${brand}`}</Text>
            <Text style={styles.helper}>{BRAND_PROMPT_HELPER}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
        {noticeLine}
      </View>
    );
  }

  const detail = brandDetailLine(rating);
  return (
    <View style={styles.wrap}>
      <View style={styles.rated}>
        <View style={styles.ratedHead}>
          <Text style={styles.ratedTitle}>{`Your ${brand} rating`}</Text>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit your rating of ${brand}`}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={styles.edit}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
        <RatingScale
          value={rating.overall}
          readOnly
          size="sm"
          accessibilityLabel={`Your rating of ${brand}`}
          valueLabels={OVERALL_LABELS}
        />
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        <Text style={styles.status}>{counts ? 'Counts toward brand insights' : 'Private to you'}</Text>
      </View>
      {noticeLine}
    </View>
  );
};

export default BrandRatingRow;

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  prompt: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSubtle,
  },
  pressed: { opacity: 0.85 },
  promptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
  },
  promptText: { flex: 1 },
  promptTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  helper: { marginTop: 2, fontSize: 13, color: theme.colors.textMuted },
  rated: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    ...theme.shadows.subtle,
  },
  ratedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ratedTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.text },
  edit: { minHeight: 36, paddingHorizontal: 6, justifyContent: 'center' },
  editText: { fontSize: 15, fontWeight: '600', color: '#7A5A22' },
  detail: { marginTop: 6, fontSize: 13, color: theme.colors.textMuted },
  status: { marginTop: 6, fontSize: 12, color: theme.colors.mediumGray, textTransform: 'uppercase', letterSpacing: 0.5 },
  notice: { marginTop: 8, fontSize: 13, lineHeight: 18, color: theme.colors.textMuted },
});
