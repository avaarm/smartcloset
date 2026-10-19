/**
 * RatingBreakdown: what the person said about a piece, one labelled line per question, in the words they chose
 * (Overall, Hand feel, Comfort, Holds up, Fit, Would buy again). A line with nothing chosen is left out, except
 * Overall, which every rating has. Read-only; changing a word is the chips above it or the full sheet.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BUY_AGAIN_LABELS,
  COMFORT_LABELS,
  FIT_LABELS,
  HOLDS_UP_LABELS,
  OVERALL_LABELS,
  TAG_LABELS,
  TOUCH_LABELS,
  type Score,
} from '../config/ratingVocabulary';
import theme from '../styles/theme';
import type { ItemRating } from '../types/rating';

export interface BreakdownLine {
  label: string;
  text: string;
}

/** The word for a 1 to 5 answer followed by the tags chosen, without saying the same word twice ("Soft" and soft). */
const wordsOf = (scale: Score | null, scaleLabels: Record<Score, string>, tags: readonly (keyof typeof TAG_LABELS)[]): string => {
  const words = [...(scale !== null ? [scaleLabels[scale]] : []), ...tags.map(tag => TAG_LABELS[tag])];
  const seen = new Set<string>();
  return words
    .filter(word => {
      const key = word.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(', ');
};

export const breakdownLines = (rating: ItemRating): BreakdownLine[] => {
  const lines: BreakdownLine[] = [{ label: 'Overall', text: OVERALL_LABELS[rating.overall] }];
  const add = (label: string, text: string) => {
    if (text !== '') {
      lines.push({ label, text });
    }
  };
  add('Hand feel', wordsOf(rating.touch, TOUCH_LABELS, rating.touchTags));
  add('Comfort', wordsOf(rating.comfort, COMFORT_LABELS, rating.comfortTags));
  add('Holds up', wordsOf(rating.holdsUp, HOLDS_UP_LABELS, rating.holdsUpTags));
  add('Fit', rating.fit ? FIT_LABELS[rating.fit] : '');
  add('Would buy again', rating.wouldBuyAgain ? BUY_AGAIN_LABELS[rating.wouldBuyAgain] : '');
  return lines;
};

const RatingBreakdown: React.FC<{ rating: ItemRating }> = ({ rating }) => (
  <View style={styles.wrap}>
    {breakdownLines(rating).map(line => (
      <View key={line.label} style={styles.row} accessible accessibilityLabel={`${line.label}: ${line.text}`}>
        <Text style={styles.label}>{line.label}</Text>
        <Text style={styles.text}>{line.text}</Text>
      </View>
    ))}
  </View>
);

export default RatingBreakdown;

const styles = StyleSheet.create({
  wrap: { marginTop: 12, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  label: { width: 112, fontSize: 13, color: theme.colors.textMuted },
  text: { flex: 1, fontSize: 14, color: theme.colors.text },
});
