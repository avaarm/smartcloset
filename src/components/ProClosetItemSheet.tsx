/**
 * ProClosetItemSheet — everything the server told a stylist about one shared piece: a large photo, then the
 * facts it returned. Read-only: no action, no share, no save, and the text is not selectable.
 *
 * The piece's closet text is the client's own description of their own things (cleaned and capped on the
 * server), so it is drawn as plain text and never as a link. Facts the server did not return are left out.
 *
 * A stylist reads photos and text a stranger typed, so the sheet has one way out besides Close: "Report or block"
 * (`onReport`), which the host answers by closing this sheet and opening ProSafetySheet. The sheet navigates nowhere.
 */

import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import ProPhoto from './ProPhoto';
import { categoryLabel } from '../utils/clothingOptions';
import { conditionLabel } from '../utils/itemCondition';
import type { ProClosetItem } from '../types/pro';

export type ProClosetItemSheetProps = {
  visible: boolean;
  connectionId: string;
  item: ProClosetItem | null;
  onClose: () => void;
  /** The stylist wants to report or block the client behind this piece. The host closes this sheet, then opens ProSafetySheet. */
  onReport?: () => void;
};

const titleCase = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** ["summer", "fall"] -> "Summer, Fall"; anything else the server sent is ignored. */
const seasonText = (value: unknown): string => {
  const words = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return words.filter((w): w is string => typeof w === 'string' && w.trim() !== '').map(w => titleCase(w.trim())).join(', ');
};

/** [{ name: "Cotton", percentage: 80 }, ...] -> "80% Cotton, 20% Polyester". */
const materialsText = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  return value
    .map(m => {
      if (typeof m === 'string') return m.trim();
      if (!m || typeof m !== 'object') return '';
      const name = typeof (m as any).name === 'string' ? (m as any).name.trim() : '';
      const pct = Number((m as any).percentage);
      return name && Number.isFinite(pct) && pct > 0 ? `${pct}% ${name}` : name;
    })
    .filter(Boolean)
    .join(', ');
};

type Fact = { label: string; value: string };

const factsOf = (item: ProClosetItem): Fact[] => {
  const rows: Array<[string, string | undefined]> = [
    ['Category', categoryLabel(item.category)],
    ['Subcategory', item.subcategory ? titleCase(item.subcategory) : undefined],
    ['Color', item.color ? titleCase(item.color) : undefined],
    ['Brand', item.brand],
    ['Size', item.size],
    ['Condition', item.condition ? conditionLabel(item.condition) || titleCase(item.condition) : undefined],
    ['Pattern', item.pattern ? titleCase(item.pattern) : undefined],
    ['Material', item.material ? titleCase(item.material) : undefined],
    ['Season', seasonText(item.season)],
    ['Materials', materialsText(item.materials)],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1])).map(([label, value]) => ({ label, value }));
};

export const ProClosetItemSheet: React.FC<ProClosetItemSheetProps> = ({ visible, connectionId, item, onClose, onReport }) => {
  const { theme } = useTheme();
  const { height } = useWindowDimensions();
  const facts = item ? factsOf(item) : [];

  return (
    <Sheet visible={visible && item !== null} onClose={onClose}>
      {item ? (
        <View>
          <ScrollView style={{ maxHeight: Math.round(height * 0.7) }} showsVerticalScrollIndicator={false}>
            <ProPhoto
              connectionId={connectionId}
              itemId={item.id}
              hasPhoto={item.hasPhoto}
              style={[styles.photo, { borderRadius: theme.radius.lg }]}
              accessibilityLabel={`Photo of ${item.name}`}
            />
            <Text variant="h3" style={styles.name}>{item.name}</Text>
            {facts.map(f => (
              <View key={f.label} style={[styles.fact, { borderBottomColor: theme.colors.border }]}>
                <Text variant="bodySmall" color="muted" style={styles.factLabel}>{f.label}</Text>
                <Text variant="bodySmall" style={styles.factValue}>{f.value}</Text>
              </View>
            ))}
            {facts.length === 0 ? (
              <Text variant="bodySmall" color="muted" style={styles.none}>No more details were shared for this piece.</Text>
            ) : null}
          </ScrollView>
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth style={styles.close} />
          {onReport ? (
            <Button label="Report or block" variant="ghost" onPress={onReport} fullWidth style={styles.report} accessibilityLabel="Report or block" />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 1 },
  name: { marginTop: 14, marginBottom: 6 },
  fact: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factLabel: { width: 110 },
  factValue: { flex: 1 },
  none: { marginTop: 8 },
  close: { marginTop: 16 },
  report: { marginTop: 4 },
});

export default ProClosetItemSheet;
