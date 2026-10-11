/**
 * Turns a search result into a wishlist item.
 *
 * A result carries a title, a price, a shop and a photo, and none of them says
 * reliably what the thing is: "Andiamo Large" is a bag, "Lava red" is a colour,
 * and a shop that sells every brand is not the brand. So the photo goes through
 * the same analysis as a photo taken in Add Item, the title and the shop fill in
 * what the photo can't say, and when the analysis isn't available (signed out,
 * offline, AI turned off) the item is still added from the title alone.
 */

import type { ClothingItem } from '../types';
import type { ClothingCategory } from '../types/clothing';
import { analyzeClothingImage, recognitionToItemFields, type RecognitionResult } from './imageRecognition';
import { brandFromHost, sourceKindOf } from './retailerDomains';
import { toSecureImageUrl, type LensResult } from './lensSearchService';
import { brandFromText, canonicalBrand } from '../utils/brandNames';
import { categoryFromText } from '../utils/clothingCategories';
import { normalizeColorName } from '../utils/colorNames';
import { inferType } from '../utils/clothingTypes';

/** The photo analysis takes a few seconds; past this the item is added from its title alone. */
export const ANALYSIS_WAIT_MS = 20000;

type Analyzer = (imageUri: string, options?: { title?: string }) => Promise<RecognitionResult>;

export const parsePrice = (priceStr?: string): number | undefined => {
  if (!priceStr) return undefined;
  const n = parseFloat(priceStr.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** `promise`'s value, or undefined if it fails or takes longer than `ms`. */
const orNothing = async <T>(promise: Promise<T>, ms: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export interface BuiltWishlistItem {
  item: ClothingItem;
  /** True when the photo analysis supplied the category (not just the title). */
  fromPhoto: boolean;
}

export const buildWishlistItem = async (
  r: LensResult,
  opts: { analyze?: Analyzer; id?: string; now?: Date; waitMs?: number } = {},
): Promise<BuiltWishlistItem> => {
  const analyze: Analyzer = opts.analyze ?? analyzeClothingImage;
  const imageUrl = toSecureImageUrl(r.imageUrl) || r.imageUrl;

  const result = imageUrl
    ? await orNothing(analyze(imageUrl, { title: r.title }), opts.waitMs ?? ANALYSIS_WAIT_MS)
    : undefined;
  const fromAi = result?.isReal ? recognitionToItemFields(result) : {};

  // The photo says what the thing is; the title only when the photo could not.
  const titleCategory = categoryFromText(r.title);
  const category: ClothingCategory = fromAi.category ?? titleCategory ?? 'accessories';
  const type = (fromAi.category === category ? fromAi.type : undefined) ?? inferType(category, r.title);

  // Only a brand's own site names its brand; otherwise the title or the photo (a logo) can.
  const brand = canonicalBrand(brandFromHost(r.source) || brandFromText(r.title) || fromAi.brand || '');

  const color = fromAi.color ? titleCase(fromAi.color) : (() => {
    const fromTitle = normalizeColorName(r.title);
    return fromTitle && fromTitle !== 'multicolor' ? titleCase(fromTitle) : '';
  })();

  // A resale listing's price is a used price; a shop's or a brand's is the new price.
  const price = parsePrice(r.price);
  const resale = sourceKindOf(r) === 'resale';
  const now = opts.now ?? new Date();

  const item: ClothingItem = {
    id: opts.id ?? `wish_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    name: r.title,
    category,
    subcategory: type,
    retailerImage: r.imageUrl,
    color,
    season: [],
    brand,
    retailer: r.source,
    dateAdded: now.toISOString(),
    isWishlist: true,
    wearCount: 0,
    cost: resale ? price : undefined,
    retailCost: resale ? undefined : price,
    notes: `Found via search. Source: ${r.url}`,
    tags: [],
    favorite: false,
  };
  return { item, fromPhoto: !!fromAi.category };
};
