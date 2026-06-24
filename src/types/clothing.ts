export type ClothingCategory = 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';

export type Season = 'spring' | 'summer' | 'fall' | 'winter' | 'all';

export type Occasion = 'casual' | 'formal' | 'business' | 'sports' | 'party' | 'everyday';

export type PatternType = 'solid' | 'striped' | 'plaid' | 'floral' | 'polka_dot' | 'graphic' | 'other';

export type MaterialType = 'cotton' | 'wool' | 'polyester' | 'leather' | 'denim' | 'silk' | 'linen' | 'other';

/**
 * Which part of the garment a material component applies to. Clothing often
 * has a mixed composition (e.g. "70% cotton / 30% polyester shell, polyester
 * lining"), and shoes/bags have distinct layers (upper, lining, sole).
 */
export type MaterialTier =
  | 'primary'    // dominant/outer material
  | 'secondary'  // additional shell material in a blend
  | 'lining'
  | 'fill'       // padding, insulation
  | 'trim'       // piping, collar, cuff details
  | 'upper'      // shoe upper
  | 'sole'       // shoe sole
  | 'hardware';  // buckles, zippers, chains (bags, shoes, outerwear)

/**
 * A single material component in a garment's composition.
 *
 * Examples:
 *   { name: 'cotton', percentage: 70, tier: 'primary' }
 *   { name: 'polyester', percentage: 30, tier: 'primary' }
 *   { name: 'polyester', tier: 'lining' }
 *   { name: 'leather', tier: 'upper' }
 *   { name: 'rubber', tier: 'sole' }
 */
export interface MaterialComponent {
  /** Canonical lowercase name: cotton, wool, polyester, leather, nylon, etc. */
  name: string;
  /** Percent by weight if known (0–100). Omit for non-blend components. */
  percentage?: number;
  /** Which part of the garment this applies to. Defaults to 'primary'. */
  tier?: MaterialTier;
}

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
  /** Primary (dominant) material — kept for back-compat; derive from materials[0]. */
  material?: MaterialType;
  /** Full material composition by tier + percentage. The source of truth for
   *  fabric reporting. Accepts multiple entries at the same tier for blends. */
  materials?: MaterialComponent[];
}
