/**
 * SourceKindBadge — the small "Retail" / "Resale" / "Marketplace" label on a
 * search result card, so it is clear what kind of site the product is on.
 * Renders nothing for sites we have no true label for.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../styles/theme';
import { sourceBadge, type SourceKind } from '../services/retailerDomains';

// The theme's success and warning colours are for icons and fills: as 10pt text on
// their pale backgrounds they reach only about 3:1. These are the same hues, dark
// enough for 4.5:1 (WCAG AA for small text).
const RETAIL_TEXT = '#166534';
const RESALE_TEXT = '#92400E';

export const BADGE_TONES: Partial<Record<SourceKind, { background: string; color: string }>> = {
  retail: { background: theme.colors.successSubtle, color: RETAIL_TEXT },
  resale: { background: theme.colors.warningSubtle, color: RESALE_TEXT },
  marketplace: { background: theme.colors.muted, color: theme.colors.textMuted },
};

const SourceKindBadge: React.FC<{ kind: SourceKind }> = ({ kind }) => {
  const label = sourceBadge(kind);
  const tone = BADGE_TONES[kind];
  if (!label || !tone) return null;
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <Text style={[styles.label, { color: tone.color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  label: { fontSize: 10, fontWeight: '600' },
});

export default SourceKindBadge;
