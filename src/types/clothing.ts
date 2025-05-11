export type ClothingCategory = 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface ClothingItemBase {
  /** Unique identifier for the clothing item */
  id: string;
  /** Name of the clothing item */
  name: string;
  /** Category of the clothing item */
  category: ClothingCategory;
  /** Brand name (optional) */
  brand?: string;
  /** URL of the item's image (optional) */
  imageUrl?: string;
  /** Color of the item (optional) */
  color?: string;
}

export interface ClothingItem extends ClothingItemBase {
  /** Season(s) the item is suitable for (optional) */
  season?: Season;
}
