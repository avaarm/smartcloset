/**
 * ItemLabelBlock: what is known from an item's label, read-only, on Item Details. Size, condition, care and
 * country of origin, and the text that was read from a scanned tag (collapsed, private to the owner), with a way
 * to clear that text. Everything is edited in Edit item; this block has no text field.
 *
 * Flag wrapper (design 6.1): with TAG_SCAN_ENABLED off nothing renders and no hook runs.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ClothingItem } from '../types';
import { tagScanActive } from '../config/ratingFlags';
import theme from '../styles/theme';
import { cleanCareInstructions, conditionLabel } from '../utils/itemCondition';

export interface ItemLabelBlockProps {
  item: Pick<ClothingItem, 'size' | 'condition' | 'careInstructions' | 'originCountry' | 'tagText'> & {
    /** Wishlist pieces are not owned, so they have no label to show. The screen skips them too. */
    isWishlist?: boolean;
  };
  onClearTagText: () => Promise<void>;
}

export const CLEAR_TITLE = 'Clear the tag text?';
export const CLEAR_MESSAGE =
  'The materials, care and country you saved stay as they are. This piece will no longer count in the fabric breakdown of brand insights.';
export const CLEAR_ERROR = 'Couldn’t clear that. Please try again.';
export const TAG_TEXT_HELPER = 'What was read from the tag. Only you can see it.';

function ItemLabelBlockInner({ item, onClearTagText }: ItemLabelBlockProps) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const size = (item.size ?? '').trim();
  const condition = conditionLabel(item.condition);
  const care = cleanCareInstructions(item.careInstructions);
  const origin = (item.originCountry ?? '').trim();
  const tagText = (item.tagText ?? '').trim();

  if (item.isWishlist || (!size && !condition && care.length === 0 && !origin && !tagText)) return null;

  const clear = async () => {
    if (clearing) return;
    setClearing(true);
    setError(null);
    try {
      await onClearTagText();
      if (mounted.current) setOpen(false);
    } catch {
      if (mounted.current) setError(CLEAR_ERROR);
    } finally {
      if (mounted.current) setClearing(false);
    }
  };

  const confirmClear = () => {
    Alert.alert(CLEAR_TITLE, CLEAR_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear tag text', style: 'destructive', onPress: clear },
    ]);
  };

  const row = (label: string, lines: string[]) => (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>
        {lines.map(line => (
          <Text key={line} style={styles.rowText}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Label
      </Text>
      {size ? row('Size', [size]) : null}
      {condition ? row('Condition', [condition]) : null}
      {care.length > 0 ? row('Care', care) : null}
      {origin ? row('Made in', [origin]) : null}
      {tagText ? (
        <View style={styles.tagBox}>
          <Pressable
            onPress={() => setOpen(o => !o)}
            accessibilityRole="button"
            accessibilityLabel="Tag text"
            accessibilityState={{ expanded: open }}
            style={styles.tagHeader}
          >
            <View style={styles.tagHeaderText}>
              <Text style={styles.rowText}>Tag text</Text>
              <Text style={styles.helper}>{TAG_TEXT_HELPER}</Text>
            </View>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable>
          {open ? (
            <View style={styles.tagBody}>
              <Text style={styles.tagText} selectable>
                {tagText}
              </Text>
              <Pressable
                onPress={confirmClear}
                disabled={clearing}
                accessibilityRole="button"
                accessibilityLabel="Clear tag text"
                accessibilityState={{ disabled: clearing, busy: clearing }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.clear}
              >
                <Text style={styles.clearText}>Clear tag text</Text>
              </Pressable>
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const ItemLabelBlock: React.FC<ItemLabelBlockProps> = props => (tagScanActive() ? <ItemLabelBlockInner {...props} /> : null);
export default ItemLabelBlock;

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 32 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 6,
    ...theme.shadows.subtle,
  },
  rowLabel: { width: 84, fontSize: 14, color: theme.colors.textMuted, paddingTop: 1 },
  rowValue: { flex: 1, gap: 2 },
  rowText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  tagBox: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 6,
    ...theme.shadows.subtle,
  },
  tagHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  tagHeaderText: { flex: 1, gap: 2 },
  helper: { fontSize: 13, color: theme.colors.textMuted },
  tagBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  tagText: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted },
  clear: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  clearText: { fontSize: 15, fontWeight: '600', color: theme.colors.danger },
  error: { fontSize: 14, color: theme.colors.danger },
});
