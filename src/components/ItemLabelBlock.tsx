/**
 * ItemLabelBlock: "About this piece" on Item Details, the facts about one item that are easy to leave out: size,
 * style, condition, washing instructions and country of origin, plus the text read from a scanned tag (collapsed,
 * private to the owner) with a way to clear it. A wishlist piece shows size and style only.
 *
 * Every row is always there. A row with nothing yet shows a prompt ("Add size") that opens Edit item, so the
 * block says what is missing instead of hiding it. Everything is edited in Edit item; this block has no text field.
 *
 * Washing instructions, country and the tag text belong to tag scanning, so those rows follow its flag
 * (design 6.1): with TAG_SCAN_ENABLED off they are not shown. Size, style and condition are always shown.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ClothingItem } from '../types';
import { tagScanActive } from '../config/ratingFlags';
import theme from '../styles/theme';
import { cleanCareInstructions, conditionLabel } from '../utils/itemCondition';
import { STYLE_LABELS, stylesFromTags } from '../utils/styleOptions';

export interface ItemLabelBlockProps {
  item: Pick<ClothingItem, 'size' | 'condition' | 'careInstructions' | 'originCountry' | 'tagText' | 'tags'> & {
    /** Wishlist pieces are not owned yet: they show size and style only. */
    isWishlist?: boolean;
  };
  onClearTagText: () => Promise<void>;
  /** Opens Edit item, for an empty row to be filled in. Without it the prompts are plain text. */
  onEdit?: () => void;
}

export const ABOUT_TITLE = 'About this piece';
export const CLEAR_TITLE = 'Clear the tag text?';
export const CLEAR_MESSAGE =
  'The materials, care and country you saved stay as they are. This piece will no longer count in the fabric breakdown of brand insights.';
export const CLEAR_ERROR = 'Couldn’t clear that. Please try again.';
export const TAG_TEXT_HELPER = 'What was read from the tag. Only you can see it.';

function ItemLabelBlock({ item, onClearTagText, onEdit }: ItemLabelBlockProps) {
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

  const owned = !item.isWishlist;
  const scanning = owned && tagScanActive();
  const size = (item.size ?? '').trim();
  const itemStyles = stylesFromTags(item.tags);
  const condition = conditionLabel(item.condition);
  const care = cleanCareInstructions(item.careInstructions);
  const origin = (item.originCountry ?? '').trim();
  const tagText = (item.tagText ?? '').trim();

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

  /** What an empty row offers: a button to Edit item, or the same words when nothing can be opened. */
  const prompt = (text: string) =>
    onEdit ? (
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={text}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={styles.prompt}
      >
        <Icon name="add-circle-outline" size={18} color="#7A5A22" />
        <Text style={styles.promptText}>{text}</Text>
      </Pressable>
    ) : (
      <Text style={styles.empty}>{text}</Text>
    );

  const row = (label: string, content: React.ReactNode) => (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{content}</View>
    </View>
  );

  const lines = (values: string[]) =>
    values.map(line => (
      <Text key={line} style={styles.rowText}>
        {line}
      </Text>
    ));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {ABOUT_TITLE}
      </Text>
      {row('Size', size ? lines([size]) : prompt('Add size'))}
      {row(
        'Style',
        itemStyles.length > 0 ? (
          <View style={styles.chips}>
            {itemStyles.map(style => (
              <View key={style} style={styles.chip}>
                <Text style={styles.chipText}>{STYLE_LABELS[style]}</Text>
              </View>
            ))}
          </View>
        ) : (
          prompt('Add style')
        ),
      )}
      {owned ? row('Condition', condition ? lines([condition]) : prompt('Add condition')) : null}
      {scanning ? row('Washing instructions', care.length > 0 ? lines(care) : prompt('Add washing instructions')) : null}
      {scanning ? row('Made in', origin ? lines([origin]) : prompt('Add country')) : null}
      {scanning && tagText ? (
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
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 6,
    ...theme.shadows.subtle,
  },
  rowLabel: { width: 104, paddingRight: 8, fontSize: 14, color: theme.colors.textMuted, paddingTop: 1 },
  rowValue: { flex: 1, gap: 2 },
  rowText: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  empty: { fontSize: 15, color: theme.colors.textSubtle },
  prompt: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  promptText: { fontSize: 15, fontWeight: '600', color: '#7A5A22' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, backgroundColor: theme.colors.accentSubtle },
  chipText: { fontSize: 13, fontWeight: '600', color: '#7A5A22' },
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
