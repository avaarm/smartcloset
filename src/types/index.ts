import type { ClothingCategory, MaterialComponent, MaterialTier, Season } from './clothing';

// One definition of each, in clothing.ts, so the two modules can't drift apart.
export type { ClothingCategory, MaterialComponent, MaterialTier, Season };

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
  occasion?: string;
  pattern?: string;
  material?: string;
  /** Full material composition with tier + percentage — seeds the fabric DB. */
  materials?: MaterialComponent[];
  /** What the item is worth today, in dollars. Estimated when added; the owner can edit it. */
  estimatedValue?: number;
  /** 'user' once the owner typed a value, 'estimate' when the app worked it out. */
  valueSource?: 'user' | 'estimate';
}

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
