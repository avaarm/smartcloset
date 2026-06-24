/**
 * MaterialsEditor — multi-tier material composition editor.
 *
 * Lets the user record the fabric composition of a garment:
 *   • Primary / secondary shell materials (with % for blends)
 *   • Lining, fill, trim (for jackets/coats)
 *   • Upper, sole (for shoes)
 *   • Hardware (for bags)
 *
 * Every filled row becomes a MaterialComponent. This feeds the fabric KB —
 * over time the community builds a database of "what is this thing made of"
 * per brand and product type.
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { MaterialComponent, MaterialTier } from '../types';
import theme from '../styles/theme';

type Props = {
  value: MaterialComponent[];
  onChange: (next: MaterialComponent[]) => void;
};

/**
 * Common canonical material names — offered as quick suggestions below the
 * name input. Users can type anything else too.
 */
const MATERIAL_SUGGESTIONS = [
  'cotton', 'polyester', 'wool', 'cashmere', 'merino', 'linen', 'silk',
  'leather', 'suede', 'nylon', 'spandex', 'elastane', 'viscose', 'rayon',
  'acrylic', 'denim', 'canvas', 'velvet', 'satin', 'fleece', 'rubber',
  'gold-plated', 'silver-plated', 'brass',
];

const TIERS: { value: MaterialTier; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'lining', label: 'Lining' },
  { value: 'fill', label: 'Fill' },
  { value: 'trim', label: 'Trim' },
  { value: 'upper', label: 'Upper' },
  { value: 'sole', label: 'Sole' },
  { value: 'hardware', label: 'Hardware' },
];

const MaterialsEditor: React.FC<Props> = ({ value, onChange }) => {
  const addRow = useCallback(() => {
    onChange([...value, { name: '', tier: 'primary' }]);
  }, [value, onChange]);

  const removeRow = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const updateRow = useCallback(
    (idx: number, patch: Partial<MaterialComponent>) => {
      onChange(value.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
    },
    [value, onChange],
  );

  // Sum of percentages at the primary + secondary shell tier (validation hint)
  const shellPct = value
    .filter(m => m.tier === 'primary' || m.tier === 'secondary')
    .reduce((sum, m) => sum + (m.percentage || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionHeader}>Materials</Text>
        {value.length > 0 && shellPct > 0 && shellPct !== 100 && (
          <Text style={styles.warn}>
            {shellPct < 100 ? `${shellPct}% shell — add the rest?` : `${shellPct}% — over 100`}
          </Text>
        )}
      </View>

      {value.length === 0 && (
        <Text style={styles.hint}>
          Track fabric makeup — e.g. 70% cotton / 30% polyester, plus lining /
          trim / hardware. Helps build a shared fabric database.
        </Text>
      )}

      {value.map((row, idx) => (
        <MaterialRow
          key={idx}
          row={row}
          onUpdate={patch => updateRow(idx, patch)}
          onRemove={() => removeRow(idx)}
        />
      ))}

      <Pressable onPress={addRow} style={styles.addButton}>
        <Icon name="add-circle-outline" size={18} color={theme.colors.accent} />
        <Text style={styles.addLabel}>
          {value.length === 0 ? 'Add material' : 'Add another component'}
        </Text>
      </Pressable>
    </View>
  );
};

// ─── Single row ─────────────────────────────────────────────────────────────

const MaterialRow: React.FC<{
  row: MaterialComponent;
  onUpdate: (patch: Partial<MaterialComponent>) => void;
  onRemove: () => void;
}> = ({ row, onUpdate, onRemove }) => {
  const matchesSuggestion = (query: string) =>
    query.length > 0
      ? MATERIAL_SUGGESTIONS.filter(
          s => s.startsWith(query.toLowerCase()) && s !== query.toLowerCase(),
        ).slice(0, 4)
      : [];

  const suggestions = matchesSuggestion(row.name);

  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <View style={{ flex: 2 }}>
          <TextInput
            style={styles.nameInput}
            placeholder="Material (e.g. cotton)"
            placeholderTextColor={theme.colors.mediumGray}
            value={row.name}
            onChangeText={text => onUpdate({ name: text })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={{ width: 66 }}>
          <TextInput
            style={styles.pctInput}
            placeholder="%"
            placeholderTextColor={theme.colors.mediumGray}
            keyboardType="number-pad"
            maxLength={3}
            value={row.percentage != null ? String(row.percentage) : ''}
            onChangeText={text => {
              const n = parseInt(text, 10);
              onUpdate({
                percentage: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined,
              });
            }}
          />
        </View>
        <Pressable onPress={onRemove} style={styles.removeButton} hitSlop={8}>
          <Icon name="close-circle" size={20} color={theme.colors.mediumGray} />
        </Pressable>
      </View>

      {/* Tier chips */}
      <View style={styles.tierRow}>
        {TIERS.map(t => (
          <Pressable
            key={t.value}
            onPress={() => onUpdate({ tier: t.value })}
            style={[
              styles.tierChip,
              (row.tier || 'primary') === t.value && styles.tierChipActive,
            ]}
          >
            <Text
              style={[
                styles.tierLabel,
                (row.tier || 'primary') === t.value && styles.tierLabelActive,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Suggestion chips (autocomplete from common materials) */}
      {suggestions.length > 0 && (
        <View style={styles.suggestRow}>
          {suggestions.map(s => (
            <Pressable
              key={s}
              onPress={() => onUpdate({ name: s })}
              style={styles.suggestChip}
            >
              <Text style={styles.suggestText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  warn: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    lineHeight: 18,
    marginBottom: 10,
  },

  rowWrap: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.text,
  },
  pctInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'center',
  },
  removeButton: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  tierChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  tierLabel: { fontSize: 11, color: theme.colors.text },
  tierLabelActive: { color: '#FFFFFF', fontWeight: '600' },

  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  suggestChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#F3F1FF',
  },
  suggestText: {
    fontSize: 11,
    color: theme.colors.accent,
    fontWeight: '500',
  },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  addLabel: {
    fontSize: 13,
    color: theme.colors.accent,
    fontWeight: '500',
  },
});

export default MaterialsEditor;
