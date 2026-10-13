/**
 * How worn a piece is. Used when it is listed for a swap or a sale, and shown on the item.
 * The values are what the database stores (see the clothing_items condition constraint).
 */

export type ItemCondition = 'new_with_tags' | 'like_new' | 'good' | 'well_loved';

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Good',
  well_loved: 'Well loved',
};

export const ITEM_CONDITIONS = Object.keys(ITEM_CONDITION_LABELS) as ItemCondition[];

export const isItemCondition = (value: unknown): value is ItemCondition =>
  typeof value === 'string' && (ITEM_CONDITIONS as string[]).includes(value);

/** The label to show for a stored condition, or '' for none or an unknown value. */
export const conditionLabel = (value: string | null | undefined): string =>
  isItemCondition(value) ? ITEM_CONDITION_LABELS[value] : '';

/** The size as it is stored: trimmed, one line, at most 20 characters; '' when blank. */
export const cleanSize = (raw: string | null | undefined): string =>
  (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);

/** Care lines as they are stored: trimmed, non-empty, no repeats, at most 20, each at most 80 characters. */
export const cleanCareInstructions = (lines: ReadonlyArray<string> | null | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines ?? []) {
    const text = (line ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 20) break;
  }
  return out;
};
