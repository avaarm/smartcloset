export type ClothingCategory = 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';

export type Season = 'spring' | 'summer' | 'fall' | 'winter' | 'all';

export type Occasion = 'casual' | 'formal' | 'business' | 'sports' | 'party' | 'everyday';

export type PatternType = 'solid' | 'striped' | 'plaid' | 'floral' | 'polka_dot' | 'graphic' | 'other';

export type MaterialType = 'cotton' | 'wool' | 'polyester' | 'leather' | 'denim' | 'silk' | 'linen' | 'other';

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
  season?: Season[];
  /** Occasion the item is suitable for (optional) */
  occasion?: Occasion;
  /** Pattern of the item (optional) */
  pattern?: PatternType;
  /** Material of the item (optional) */
  material?: MaterialType;
}
