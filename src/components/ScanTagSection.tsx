/**
 * ScanTagSection: the body of the "Label" section of Add/Edit item. The Scan tag button, a note after a scan, the
 * "Made in" field and the care instructions. The title and spacing come from the screen's FormSection.
 *
 * useTagFields holds what only this section edits (care, country of origin and the stored tag text). It is state
 * only, no I/O, so the screen calls it unconditionally; the section itself is a flag wrapper (design 6.1).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ClothingItem, MaterialComponent } from '../types';
import { tagScanActive } from '../config/ratingFlags';
import theme from '../styles/theme';
import { cleanCareInstructions } from '../utils/itemCondition';
import { CARE_PHRASES } from '../utils/careNames';
import { ChipMultiSelect } from './ChipSelect';
import { singleLineDoneProps } from './KeyboardSafe';
import ScanTagButton from './ScanTagButton';
import type { TagApplyChoice, TagCurrentValues } from './tagApply';

export type { TagApplyChoice, TagCurrentValues };

export interface TagFieldsApi {
  careInstructions: string[];
  originCountry: string;
  tagText: string;
  filledFromTag: boolean;
  setCareInstructions: (next: string[]) => void;
  setOriginCountry: (next: string) => void;
  setTagText: (next: string) => void;
  dismissNote: () => void;
  /** Spread into the save payload. undefined leaves the stored value alone, '' and [] clear it (storage.ts convention). */
  toItemFields: () => { careInstructions?: string[]; originCountry?: string; tagText?: string };
}

export interface ScanTagSectionProps {
  tag: TagFieldsApi;
  category?: string;
  materials: MaterialComponent[];
  onMaterialsChange: (next: MaterialComponent[]) => void;
  size: string;
  onSizeChange: (s: string) => void;
  brand: string;
  onBrandChange: (s: string) => void;
  isGuest: boolean;
  autoOpen?: boolean;
}

export const FILLED_NOTE = 'Filled from the tag. Check the numbers.';
export const MAX_ORIGIN_LENGTH = 60;

// ─── The fields this section owns ───────────────────────────────────────────

/**
 * Care, country of origin and tag text of the item being added or edited. Starts from the stored item once.
 * A value is only sent on save when the person changed it: `undefined` leaves the stored value alone, and a
 * value that was there and is now empty clears it.
 */
export function useTagFields(
  editItem?: Pick<ClothingItem, 'careInstructions' | 'originCountry' | 'tagText'> | null,
): TagFieldsApi {
  const [loaded] = useState(() => ({
    care: cleanCareInstructions(editItem?.careInstructions),
    origin: (editItem?.originCountry ?? '').trim(),
    tagText: editItem?.tagText ?? '',
  }));
  const [careInstructions, setCareInstructions] = useState<string[]>(loaded.care);
  const [originCountry, setOriginCountry] = useState(loaded.origin);
  const [tagText, setTagTextState] = useState(loaded.tagText);
  const [filledFromTag, setFilledFromTag] = useState(false);

  // Only a scan changes the tag text, so a new one is also what shows the "Filled from the tag" note.
  const setTagText = useCallback((next: string) => {
    setTagTextState(next);
    if (next !== '') setFilledFromTag(true);
  }, []);
  const dismissNote = useCallback(() => setFilledFromTag(false), []);

  const toItemFields = useCallback((): { careInstructions?: string[]; originCountry?: string; tagText?: string } => {
    const out: { careInstructions?: string[]; originCountry?: string; tagText?: string } = {};
    if (careInstructions.length > 0) out.careInstructions = careInstructions;
    else if (loaded.care.length > 0) out.careInstructions = [];
    const origin = originCountry.trim();
    if (origin !== '') out.originCountry = origin;
    else if (loaded.origin !== '') out.originCountry = '';
    if (tagText !== '') out.tagText = tagText;
    else if (loaded.tagText !== '') out.tagText = '';
    return out;
  }, [careInstructions, originCountry, tagText, loaded]);

  return {
    careInstructions,
    originCountry,
    tagText,
    filledFromTag,
    setCareInstructions,
    setOriginCountry,
    setTagText,
    dismissNote,
    toItemFields,
  };
}

// ─── The section ────────────────────────────────────────────────────────────

function ScanTagSectionInner({
  tag,
  category,
  materials,
  onMaterialsChange,
  size,
  onSizeChange,
  brand,
  onBrandChange,
  isGuest,
  autoOpen,
}: ScanTagSectionProps) {
  const [careOpen, setCareOpen] = useState(false);

  const current = useMemo<TagCurrentValues>(
    () => ({ materials, size, brand, originCountry: tag.originCountry, careInstructions: tag.careInstructions }),
    [materials, size, brand, tag.originCountry, tag.careInstructions],
  );

  const { setCareInstructions, setOriginCountry, setTagText, dismissNote, careInstructions } = tag;
  const apply = useCallback(
    (choice: TagApplyChoice) => {
      const changesForm =
        !!choice.materials ||
        !!choice.careInstructions ||
        choice.originCountry !== undefined ||
        choice.size !== undefined ||
        choice.brand !== undefined;
      if (choice.materials) onMaterialsChange(choice.materials);
      if (choice.careInstructions) setCareInstructions(cleanCareInstructions([...careInstructions, ...choice.careInstructions]));
      if (choice.originCountry !== undefined) setOriginCountry(choice.originCountry);
      if (choice.size !== undefined) onSizeChange(choice.size);
      if (choice.brand !== undefined) onBrandChange(choice.brand);
      setTagText(choice.tagText);
      // The tag text is kept either way; the note is only for a scan that filled something in.
      if (!changesForm) dismissNote();
    },
    [
      careInstructions,
      onMaterialsChange,
      onSizeChange,
      onBrandChange,
      setCareInstructions,
      setOriginCountry,
      setTagText,
      dismissNote,
    ],
  );

  const options = useMemo(() => {
    const extra = careInstructions.filter(line => !CARE_PHRASES.includes(line));
    return [...CARE_PHRASES, ...extra].map(line => ({ label: line, value: line }));
  }, [careInstructions]);

  const toggleCare = useCallback(
    (line: string) => {
      setCareInstructions(careInstructions.includes(line) ? careInstructions.filter(l => l !== line) : cleanCareInstructions([...careInstructions, line]));
    },
    [careInstructions, setCareInstructions],
  );

  return (
    <View style={styles.wrap}>
      <ScanTagButton onApply={apply} current={current} category={category} guest={isGuest} autoOpen={autoOpen} />

      {tag.filledFromTag ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <Text style={styles.noteText}>{FILLED_NOTE}</Text>
          <Pressable
            onPress={tag.dismissNote}
            accessibilityRole="button"
            accessibilityLabel="Dismiss note"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.noteClose}
          >
            <Icon name="close" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View>
        <Text style={styles.label}>Made in</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Made in"
          placeholder="Country of origin"
          placeholderTextColor={theme.colors.textMuted}
          value={tag.originCountry}
          onChangeText={text => tag.setOriginCountry(text.slice(0, MAX_ORIGIN_LENGTH))}
          maxLength={MAX_ORIGIN_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          {...singleLineDoneProps}
        />
      </View>

      <View>
        <Pressable
          onPress={() => setCareOpen(open => !open)}
          accessibilityRole="button"
          accessibilityLabel={`Care instructions (${careInstructions.length})`}
          accessibilityState={{ expanded: careOpen }}
          style={styles.careHeader}
        >
          <Text style={styles.careTitle}>{`Care instructions (${careInstructions.length})`}</Text>
          <Icon name={careOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
        </Pressable>
        {careOpen ? (
          <ChipMultiSelect<string>
            options={options}
            selected={careInstructions}
            onToggle={toggleCare}
            accessibilityLabel="Care instructions"
          />
        ) : careInstructions.length > 0 ? (
          <View style={styles.chips}>
            {careInstructions.map(line => (
              <Pressable
                key={line}
                onPress={() => toggleCare(line)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${line}`}
                hitSlop={4}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{line}</Text>
                <Icon name="close" size={14} color={theme.colors.textMuted} style={styles.chipIcon} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const ScanTagSection: React.FC<ScanTagSectionProps> = props => (tagScanActive() ? <ScanTagSectionInner {...props} /> : null);
export default ScanTagSection;

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: theme.colors.accentSubtle,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  noteText: { flex: 1, fontSize: 14, color: theme.colors.text },
  noteClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 6, marginLeft: 4, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#FFFFFF',
  },
  careHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  careTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.mutedBackground,
  },
  chipText: { fontSize: 14, color: theme.colors.text },
  chipIcon: { marginLeft: 6 },
});
