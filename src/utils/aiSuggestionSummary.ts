/**
 * The "AI Suggestions" box at the bottom of the Add Item form: what the photo
 * analysis suggested, worded to match what the form shows.
 */

import type { RecognitionResult } from '../services/imageRecognition';
import { OCCASION_LABELS, categoryLabel, isClothingCategory, normalizeOccasion } from './clothingOptions';

/** Under this the AI is mostly guessing, so its value isn't offered as a suggestion. */
export const MIN_SUGGESTION_CONFIDENCE = 0.5;

export type AiSuggestionKey = 'category' | 'color' | 'material' | 'occasion' | 'brand' | 'pattern';

export type AiSuggestionRow = { key: AiSuggestionKey; label: string; text: string };

/** What the form currently holds for the fields the AI also suggests. */
export type AiSuggestionForm = {
  category: string;
  color: string;
  /** The primary material from the materials editor; '' when there is none. */
  material: string;
  /** null is the "Any occasion" choice. */
  occasion: string | null;
  brand: string;
};

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const percent = (confidence: number): number => Math.round(Math.min(1, Math.max(0, confidence)) * 100);

type RowInput = {
  key: AiSuggestionKey;
  label: string;
  /** The AI's value as shown to the user ("Shoes", "Brown"). */
  suggested: string | undefined;
  confidence: number | undefined;
  /** The same field as the form has it now, '' when the form has no choice for it. */
  inForm?: string;
  /** True when the form has a different value than the one suggested. */
  differs?: boolean;
};

const buildRow = ({ key, label, suggested, confidence, inForm = '', differs = false }: RowInput): AiSuggestionRow | null => {
  const value = suggested?.trim();
  if (!value || typeof confidence !== 'number' || !(confidence >= MIN_SUGGESTION_CONFIDENCE)) return null;
  const text = `${value} (${percent(confidence)}% confidence)`;
  // "set to", not "you chose": an untouched field holds the form's default, not a choice.
  return { key, label, text: differs && inForm ? `${text} · set to ${inForm}` : text };
};

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Rows for the box, or [] when there is nothing honest to show: the analysis
 * wasn't a real one (guest, AI off, offline), or no value is confident enough.
 * A row whose value the user has since changed in the form says so rather than
 * contradicting it.
 */
export const buildAiSuggestionRows = (
  result: RecognitionResult | null | undefined,
  form: AiSuggestionForm,
): AiSuggestionRow[] => {
  if (!result || !result.isReal) return [];
  const { confidence } = result;

  const pattern = result.pattern && result.pattern !== 'solid' && result.pattern !== 'other' ? result.pattern : undefined;
  // An occasion the form has no chip for can't be applied, so it isn't offered.
  const occasion = normalizeOccasion(result.occasion);

  const rows = [
    buildRow({
      key: 'category',
      label: 'Category',
      // A category outside our eleven can't be applied, so it isn't offered.
      suggested: isClothingCategory(result.category) ? categoryLabel(result.category) : undefined,
      confidence: confidence.category,
      inForm: categoryLabel(form.category),
      differs: !!form.category && form.category !== result.category,
    }),
    buildRow({
      key: 'color',
      label: 'Color',
      suggested: result.color && sentenceCase(result.color),
      confidence: confidence.color,
      inForm: form.color.trim(),
      differs: !!result.color && !!form.color.trim() && !sameText(form.color, result.color),
    }),
    buildRow({
      key: 'material',
      label: 'Material',
      suggested: result.material && sentenceCase(result.material),
      confidence: confidence.material,
      inForm: sentenceCase(form.material.trim()),
      differs: !!result.material && !!form.material.trim() && !sameText(form.material, result.material),
    }),
    buildRow({
      key: 'occasion',
      label: 'Occasion',
      suggested: occasion ? OCCASION_LABELS[occasion] : undefined,
      confidence: confidence.occasion,
      inForm: form.occasion ? sentenceCase(form.occasion) : 'Any occasion',
      differs: !!occasion && !sameText(form.occasion ?? '', occasion),
    }),
    buildRow({
      key: 'brand',
      label: 'Brand',
      suggested: result.brand,
      confidence: confidence.brand,
      inForm: form.brand.trim(),
      differs: !!result.brand && !!form.brand.trim() && !sameText(form.brand, result.brand),
    }),
    buildRow({
      key: 'pattern',
      label: 'Pattern',
      suggested: pattern && sentenceCase(pattern.replace('_', ' ')),
      confidence: confidence.pattern,
    }),
  ];

  return rows.filter((row): row is AiSuggestionRow => row !== null);
};
