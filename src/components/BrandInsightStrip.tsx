/**
 * BrandInsightStrip: one quiet line, "Members rate Zara 4.1 overall", under the Brand field of Add/Edit item and
 * in Item Details (documentation/design/quality-ratings.md, 3.4 and 6.2).
 *
 * It appears only when the server says `ok` for the brand, and it stays silent about everything else: a guest,
 * an offline phone, a brand nobody has enough ratings for and a server without the function all look the same
 * (no strip), so typing a brand never shows an error or a hint of how close a score is. The brand shown is the
 * text the person typed, never a name the server sent. Tapping it calls `onOpen`; the strip has no navigation of
 * its own, so any screen can host it.
 *
 * The default export is a thin wrapper that owns no hook: with brand insights off nothing mounts, so no session
 * read, no request and no state update happens. The inner component owns the effect.
 *
 * Look: the screens that host it still use hard-coded colours, so the line copies their metrics.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { brandInsightsActive } from '../config/ratingFlags';
import { loadBrandInsight } from '../services/brandInsightService';
import { brandKeyRaw } from '../utils/brandKey';

const GOLD = '#C4975A';
const TEXT_MUTED = '#6B5F52';

/** Typing pauses this long before a lookup is made (variant `add`). */
export const BRAND_STRIP_DEBOUNCE_MS = 600;
/** The server files a brand under a key of 2 to 40 characters; a shorter one has nothing to look up. */
const MIN_KEY_LENGTH = 2;

export type BrandInsightStripProps = {
  brand: string;
  onOpen: (brand: string) => void;
  variant: 'add' | 'details';
};

const BrandInsightStrip: React.FC<BrandInsightStripProps> = props =>
  brandInsightsActive() ? <BrandInsightStripInner {...props} /> : null;

export default BrandInsightStrip;

/** The normalised brand when it is worth a lookup, otherwise null. */
const usableKey = (text: string): string | null => {
  const key = brandKeyRaw(text);
  return key !== null && key.length >= MIN_KEY_LENGTH ? key : null;
};

interface Shown {
  /** The normalised brand the score belongs to, so a score never sits under a different brand. */
  key: string;
  score: number;
}

function BrandInsightStripInner({ brand, onOpen, variant }: BrandInsightStripProps) {
  const typed = typeof brand === 'string' ? brand.trim() : '';
  const key = usableKey(typed);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!key) {
      return undefined;
    }
    let cancelled = false;
    const lookUp = () => {
      loadBrandInsight(typed)
        .then(result => {
          if (cancelled) {
            return;
          }
          setShown(
            result.state === 'ok' && result.value.status === 'ok'
              ? { key, score: result.value.score }
              : null,
          );
        })
        .catch(() => {
          if (!cancelled) {
            setShown(null);
          }
        });
    };
    if (variant === 'add') {
      const timer = setTimeout(lookUp, BRAND_STRIP_DEBOUNCE_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    lookUp();
    return () => {
      cancelled = true;
    };
  }, [key, typed, variant]);

  // A score is shown only under the brand it was read for; while the text changes the strip simply steps aside.
  if (!key || !shown || shown.key !== key) {
    return null;
  }

  return (
    <Pressable
      onPress={() => onOpen(typed)}
      accessibilityRole="button"
      accessibilityLabel={`${typed} brand report`}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={[styles.row, variant === 'add' ? styles.rowAdd : styles.rowDetails]}
    >
      <Icon name="star" size={14} color={GOLD} />
      <Text style={styles.text} numberOfLines={1}>
        {`Members rate ${typed} ${shown.score.toFixed(1)} overall`}
      </Text>
      <Icon name="chevron-forward" size={14} color={TEXT_MUTED} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
  },
  rowAdd: {
    marginTop: 6,
    marginBottom: 2,
  },
  rowDetails: {
    marginTop: 8,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '500',
  },
});
