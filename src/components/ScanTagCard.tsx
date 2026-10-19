/**
 * ScanTagCard: the way into the tag scan from Item Details, as a card that looks like what it is, a button.
 * "Scan the tag & washing instructions" (once a tag was scanned: "Scan the tag again"). It does not scan: the
 * screen sends the person to Edit item with the scanner already open, so there is still one copy of the scanner
 * (ScanTagButton). It is the louder sibling of ScanTagLink, which stays a small text link.
 *
 * Flag wrapper (design 6.1): with TAG_SCAN_ENABLED off it renders nothing and no effect runs. Scanning needs an
 * account, so a guest sees nothing here either.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { tagScanActive } from '../config/ratingFlags';
import { getAuthUserId } from '../services/authUser';
import theme from '../styles/theme';
import { SCAN_HELPER } from './ScanTagButton';

export const SCAN_CARD_TITLE = 'Scan the tag & washing instructions';
export const SCAN_CARD_TITLE_AGAIN = 'Scan the tag again';
export const SCAN_CARD_HELPER_AGAIN = 'Read it again to update what is saved.';

export interface ScanTagCardProps {
  /** Whether a tag was scanned before (the item has its text). */
  hasTag: boolean;
  onPress: () => void;
}

function ScanTagCardInner({ hasTag, onPress }: ScanTagCardProps) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuthUserId()
      .then(id => {
        if (!cancelled) setSignedIn(!!id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  const title = hasTag ? SCAN_CARD_TITLE_AGAIN : SCAN_CARD_TITLE;
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Icon name="scan-outline" size={24} color="#7A5A22" />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.helper}>{hasTag ? SCAN_CARD_HELPER_AGAIN : SCAN_HELPER}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

/** Renders nothing for guests or with the flag off. */
const ScanTagCard: React.FC<ScanTagCardProps> = props => (tagScanActive() ? <ScanTagCardInner {...props} /> : null);
export default ScanTagCard;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 32 },
  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSubtle,
  },
  pressed: { opacity: 0.85 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
  },
  text: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  helper: { marginTop: 2, fontSize: 13, color: theme.colors.textMuted },
});
