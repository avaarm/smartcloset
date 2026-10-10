/**
 * Dollar value of wardrobe items.
 *
 * Contract used by the Add Item form, the Wardrobe header, Home and the
 * Wishlist. (Skeleton: the value workstream replaces the bodies, keeping these
 * exports and their meaning.)
 */
import type { ClothingItem } from '../types';

export type ValueSource = 'paid' | 'retail' | 'match' | 'brand' | 'category';

export interface ValueEstimate {
  value: number;
  /** What the number is based on, for the "Estimated from ..." hint. */
  source: ValueSource;
}

export type ValueInputs = Pick<ClothingItem, 'category' | 'brand' | 'cost' | 'retailCost' | 'materials' | 'name' | 'tags'>;

/** Worked-out value for an item that has no value of its own yet. */
export const estimateItemValue = (item: ValueInputs, opts: { matchedPrice?: number } = {}): ValueEstimate => {
  const paid = item.cost ?? 0;
  if (paid > 0) return { value: Math.round(paid), source: 'paid' };
  const retail = item.retailCost ?? 0;
  if (retail > 0) return { value: Math.round(retail * 0.5), source: 'retail' };
  if (opts.matchedPrice && opts.matchedPrice > 0) return { value: Math.round(opts.matchedPrice * 0.5), source: 'match' };
  return { value: 40, source: 'category' };
};

/** The value to show and add up for one item: its own estimatedValue, else a fresh estimate. */
export const itemValue = (item: ClothingItem): number =>
  item.estimatedValue != null && Number.isFinite(item.estimatedValue) && item.estimatedValue >= 0
    ? item.estimatedValue
    : estimateItemValue(item).value;

/** Sum of itemValue over the items. Callers pass owned items only (never the wishlist). */
export const totalValue = (items: ClothingItem[]): number => items.reduce((sum, i) => sum + itemValue(i), 0);

/** "$1,234" (whole dollars, thousands separators). */
export const formatMoney = (n: number): string =>
  `$${Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US')}`;
