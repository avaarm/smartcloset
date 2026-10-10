/**
 * Dollar value of wardrobe items.
 *
 * Contract used by the Add Item form, the Wardrobe header, Home and the
 * Wishlist: estimateItemValue() works out a value for an item that has none of
 * its own, itemValue() is the number to show and add up, totalValue() adds up
 * owned items, formatMoney() prints it.
 */
import type { ClothingItem } from '../types';
import {
  BRAND_TIERS,
  BrandTier,
  CATEGORY_BASE_PRICE,
  DEFAULT_RESALE_FACTOR,
  FALLBACK_BASE_PRICE,
  HOLDS_VALUE_RESALE_FACTOR,
  HOLDS_VALUE_TIERS,
  MATERIAL_MULTIPLIER,
  TIER_MULTIPLIER,
} from './itemValueTables';

export type ValueSource = 'paid' | 'retail' | 'match' | 'brand' | 'category';

export interface ValueEstimate {
  value: number;
  /** What the number is based on, for the "Estimated from ..." hint. */
  source: ValueSource;
}

export type ValueInputs = Pick<
  ClothingItem,
  'category' | 'brand' | 'cost' | 'retailCost' | 'materials' | 'material' | 'name' | 'tags'
>;

const MIN_VALUE = 5;
const MAX_VALUE = 50_000;

/** Material components that make up what you see and feel (not lining, padding, soles or hardware). */
const SHELL_TIERS = new Set(['primary', 'secondary', 'upper']);

// ─── Text matching ───────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
};

/**
 * Lowercase words separated by single spaces: accents folded, "&" read as
 * "and", apostrophes dropped ("Levi's" is "levis"), other punctuation a space.
 * Folds by table rather than String.normalize so it behaves the same on every
 * JS engine.
 */
const normalize = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '')
    .toLowerCase()
    .replace(/[àáâãäåçèéêëìíîïñòóôõöùúûü]/g, c => ACCENTS[c])
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Every run of words in `text` that is a key of `index`, longest first, then leftmost. */
const phraseMatches = <T>(text: string, index: Map<string, T>, maxWords: number) => {
  const words = text ? text.split(' ') : [];
  const found: Array<{ length: number; value: T }> = [];
  for (let length = Math.min(maxWords, words.length); length >= 1; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const key = words.slice(start, start + length).join(' ');
      if (index.has(key)) found.push({ length, value: index.get(key) as T });
    }
  }
  return found;
};

const buildIndex = <T>(entries: Array<[string, T]>) => {
  const index = new Map<string, T>();
  let maxWords = 1;
  for (const [phrase, value] of entries) {
    const key = normalize(phrase);
    if (!key || index.has(key)) continue;
    index.set(key, value);
    maxWords = Math.max(maxWords, key.split(' ').length);
  }
  return { index, maxWords };
};

const brandIndex = buildIndex(
  (Object.keys(BRAND_TIERS) as BrandTier[]).flatMap(tier =>
    BRAND_TIERS[tier].map((name): [string, BrandTier] => [name, tier]),
  ),
);
const materialIndex = buildIndex(Object.entries(MATERIAL_MULTIPLIER));

/**
 * The tier of a known brand, matched as whole words anywhere in the text
 * ("Polo Ralph Lauren Kids" is Ralph Lauren; "Coachella" is not Coach). When a
 * collaboration names two brands the longer name wins, then the pricier tier.
 */
const brandTier = (brand: unknown): BrandTier | undefined => {
  const matches = phraseMatches(normalize(brand), brandIndex.index, brandIndex.maxWords);
  matches.sort((a, b) => b.length - a.length || TIER_MULTIPLIER[b.value] - TIER_MULTIPLIER[a.value]);
  return matches[0]?.value;
};

// ─── Estimate ────────────────────────────────────────────────────────────────

const positive = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

const clampValue = (n: number): number => Math.min(MAX_VALUE, Math.max(MIN_VALUE, Math.round(n)));

/** Multiplier for the item's fabric; 1 when none is known. */
const materialMultiplier = (item: ValueInputs): number => {
  const shell = (item.materials ?? []).filter(m => m && (!m.tier || SHELL_TIERS.has(m.tier)));
  if (shell.length > 0) {
    // The biggest share of the shell sets the price (the first listed on a tie
    // or when no percentages were entered): a 5% cashmere blend is not cashmere.
    const dominant = shell.reduce((best, m) => ((m.percentage ?? 0) > (best.percentage ?? 0) ? m : best));
    const hit = phraseMatches(normalize(dominant.name), materialIndex.index, materialIndex.maxWords)[0];
    return hit ? hit.value : 1;
  }
  const text = normalize([item.material, item.name, ...(Array.isArray(item.tags) ? item.tags : [])].join(' '));
  const hit = phraseMatches(text, materialIndex.index, materialIndex.maxWords)[0];
  return hit ? hit.value : 1;
};

/** Share of a new price that the item is worth now. */
const resaleFactor = (tier: BrandTier | undefined): number =>
  tier && HOLDS_VALUE_TIERS.includes(tier) ? HOLDS_VALUE_RESALE_FACTOR : DEFAULT_RESALE_FACTOR;

/**
 * Worked-out value for an item that has no value of its own yet.
 *
 * What the owner typed comes first, because an estimate that second-guesses a
 * price they just entered reads as a bug:
 *   1. a price paid is taken as the value (what they paid is what they think
 *      it is worth; they can change it);
 *   2. otherwise the new price, as it sells second hand: 60% of it, 80% for
 *      luxury, designer and premium brands that hold their value;
 *   3. otherwise the same for the price of a product the item was matched to;
 *   4. otherwise a typical price for the category, scaled by the brand's tier
 *      and by the fabric ("brand" when the brand was recognised, else "category").
 * Whole dollars, between $5 and $50,000.
 */
export const estimateItemValue = (item: ValueInputs, opts: { matchedPrice?: number } = {}): ValueEstimate => {
  const paid = positive(item.cost);
  if (paid) return { value: clampValue(paid), source: 'paid' };

  const tier = brandTier(item.brand);
  const retail = positive(item.retailCost);
  if (retail) return { value: clampValue(retail * resaleFactor(tier)), source: 'retail' };

  const matched = positive(opts.matchedPrice);
  if (matched) return { value: clampValue(matched * resaleFactor(tier)), source: 'match' };

  const base = CATEGORY_BASE_PRICE[item.category] ?? FALLBACK_BASE_PRICE;
  const value = base * (tier ? TIER_MULTIPLIER[tier] : 1) * materialMultiplier(item);
  return { value: clampValue(value), source: tier ? 'brand' : 'category' };
};

/** The value to show and add up for one item: its own estimatedValue, else a fresh estimate. */
export const itemValue = (item: ClothingItem): number =>
  item.estimatedValue != null && Number.isFinite(item.estimatedValue) && item.estimatedValue >= 0
    ? item.estimatedValue
    : estimateItemValue(item).value;

/** Sum of itemValue over the items. Callers pass owned items only (never the wishlist). */
export const totalValue = (items: ClothingItem[]): number => items.reduce((sum, i) => sum + itemValue(i), 0);

/** "$1,234" (whole dollars, thousands separators). Written out rather than toLocaleString so it never depends on locale data. */
export const formatMoney = (n: number): string => {
  const rounded = Math.round(Number.isFinite(n) ? n : 0);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}$${digits}`;
};

/** "$1,234.50" (cents, thousands separators), for prices people type with cents. */
export const formatMoneyCents = (n: number): string => {
  const cents = Math.round((Number.isFinite(n) ? n : 0) * 100);
  const abs = Math.abs(cents);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
};
