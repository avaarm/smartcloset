/**
 * The choices the app offers for an item's category, season and occasion, in
 * one place so the Add form, filters, builders and insights can't drift apart.
 */

import type { ClothingCategory, Occasion } from '../types/clothing';
import type { Season } from '../types';

// ─── Categories ──────────────────────────────────────────────────────────────

// Declared as a Record so adding a category to the type fails to compile until
// it has a label here; the key order is the order every picker shows them in.
export const CATEGORY_LABELS: Record<ClothingCategory, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  outerwear: 'Outerwear',
  shoes: 'Shoes',
  bags: 'Bags',
  jewelry: 'Jewelry',
  hats: 'Hats',
  activewear: 'Activewear',
  swimwear: 'Swimwear',
  accessories: 'Accessories',
};

export const CLOTHING_CATEGORIES = Object.keys(CATEGORY_LABELS) as ClothingCategory[];

export const CATEGORY_ICONS: Record<ClothingCategory, string> = {
  tops: 'shirt-outline',
  bottoms: 'resize-outline',
  dresses: 'woman-outline',
  outerwear: 'snow-outline',
  shoes: 'footsteps-outline',
  bags: 'bag-handle-outline',
  jewelry: 'diamond-outline',
  // Ionicons has no hat; the mortarboard is its only headwear shape.
  hats: 'school-outline',
  activewear: 'barbell-outline',
  swimwear: 'water-outline',
  accessories: 'glasses-outline',
};

export const CATEGORY_COLORS: Record<ClothingCategory, string> = {
  tops: '#D9B978',
  bottoms: '#9C7A4A',
  dresses: '#C48A82',
  outerwear: '#C4A962',
  shoes: '#C4975A',
  bags: '#7A5A3C',
  jewelry: '#B58BA0',
  hats: '#8FA38B',
  activewear: '#6F8FA3',
  swimwear: '#5FA3A3',
  accessories: '#8A6D4E',
};

/** The small pieces that finish an outfit; an outfit takes at most one of them. */
export const EXTRA_CATEGORIES: readonly ClothingCategory[] = ['bags', 'jewelry', 'hats', 'accessories'];

export const isClothingCategory = (value: unknown): value is ClothingCategory =>
  typeof value === 'string' && (CLOTHING_CATEGORIES as string[]).includes(value);

/** "bags" -> "Bags". Unknown values (old data) are title-cased rather than shown raw. */
export const categoryLabel = (category: string | null | undefined): string => {
  if (!category) return '';
  if (isClothingCategory(category)) return CATEGORY_LABELS[category];
  return category.charAt(0).toUpperCase() + category.slice(1);
};

// ─── Seasons ─────────────────────────────────────────────────────────────────

export const SEASONS: readonly Season[] = ['spring', 'summer', 'fall', 'winter'];

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

export const SEASON_ICONS: Record<Season, string> = {
  spring: 'flower-outline',
  summer: 'sunny-outline',
  fall: 'leaf-outline',
  winter: 'snow-outline',
};

/** A season name from AI or old data ("Autumn", "FALL") as one of ours, or null. */
export const normalizeSeason = (raw: unknown): Season | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'autumn') return 'fall';
  return (SEASONS as readonly string[]).includes(s) ? (s as Season) : null;
};

/**
 * The seasons in a list from saved data or AI, as ours in calendar order:
 * "Autumn" reads as fall, unknown names are dropped, and "all" stands for all four.
 */
export const normalizeSeasons = (raw: readonly unknown[] | null | undefined): Season[] => {
  const list = raw ?? [];
  if (list.some(r => typeof r === 'string' && r.trim().toLowerCase() === 'all')) return [...SEASONS];
  return SEASONS.filter(s => list.some(r => normalizeSeason(r) === s));
};

/** An item that covers every season is stored with all four listed. */
export const isAllSeasons = (seasons: readonly Season[]): boolean =>
  SEASONS.every(s => seasons.includes(s));

/**
 * What tapping a chip in the Season picker does. "All seasons" selects all four
 * (or clears them when already on); picking one season while "All" is on narrows
 * to just that season; otherwise a season toggles.
 */
export const toggleSeasonChoice = (current: readonly Season[], tapped: Season | 'all'): Season[] => {
  const all = isAllSeasons(current);
  if (tapped === 'all') return all ? [] : [...SEASONS];
  if (all) return [tapped];
  return SEASONS.filter(s => (s === tapped ? !current.includes(s) : current.includes(s)));
};

// ─── Occasions ───────────────────────────────────────────────────────────────

export const OCCASION_LABELS: Record<Occasion, string> = {
  casual: 'Casual',
  formal: 'Formal',
  business: 'Business',
  sports: 'Sports',
  party: 'Party',
  everyday: 'Everyday',
};

export const OCCASIONS = Object.keys(OCCASION_LABELS) as Occasion[];

/** An occasion from AI or old data as one of ours, or null when it isn't one. */
export const normalizeOccasion = (raw: unknown): Occasion | null => {
  if (typeof raw !== 'string') return null;
  const o = raw.trim().toLowerCase();
  return (OCCASIONS as string[]).includes(o) ? (o as Occasion) : null;
};
