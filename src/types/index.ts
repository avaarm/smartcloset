export type MaterialTier =
  | 'primary'
  | 'secondary'
  | 'lining'
  | 'fill'
  | 'trim'
  | 'upper'
  | 'sole'
  | 'hardware';

export interface MaterialComponent {
  /** Canonical lowercase name: cotton, wool, polyester, leather, nylon, etc. */
  name: string;
  /** Percent by weight if known (0–100). Omit for non-blend components. */
  percentage?: number;
  /** Which part of the garment. Defaults to 'primary'. */
  tier?: MaterialTier;
}

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  retailerImage?: string;
  userImage?: string;
  brand?: string;
  color: string;
  season: Season[];
  dateAdded: string;
  isWishlist: boolean;
  wearCount?: number;
  lastWorn?: string;
  /** What the user actually paid (can be a sale / secondhand / gift price). */
  cost?: number;
  /** Full retail / new / MSRP price — used for wardrobe value + savings math. */
  retailCost?: number;
  purchaseDate?: string;
  notes?: string;
  tags?: string[];
  favorite?: boolean;
  retailer?: string;
  /** Full material composition with tier + percentage — seeds the fabric DB. */
  materials?: MaterialComponent[];
}

export type ClothingCategory = 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';

export enum ClothingCategoryEnum {
  TOPS = 'tops',
  BOTTOMS = 'bottoms',
  DRESSES = 'dresses',
  OUTERWEAR = 'outerwear',
  SHOES = 'shoes',
  ACCESSORIES = 'accessories'
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export enum SeasonEnum {
  SPRING = 'spring',
  SUMMER = 'summer',
  FALL = 'fall',
  WINTER = 'winter'
}

export interface Outfit {
  id: string;
  name: string;
  items: string[]; // Array of ClothingItem ids
  season: Season[];
  occasion?: string;
  dateCreated: string;
  lastWorn?: string;
  wearCount?: number;
  favorite?: boolean;
  notes?: string;
}

export interface WardrobeStats {
  totalItems: number;
  itemsByCategory: Record<ClothingCategory, number>;
  itemsBySeason: Record<Season, number>;
  totalValue: number;
  mostWornItem?: ClothingItem;
  leastWornItem?: ClothingItem;
  averageWearCount: number;
  wishlistCount: number;
}

export interface OutfitHistory {
  id: string;
  outfitId: string;
  dateWorn: string;
  occasion?: string;
  rating?: number;
  notes?: string;
}
