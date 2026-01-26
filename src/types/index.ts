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
  cost?: number;
  purchaseDate?: string;
  notes?: string;
  tags?: string[];
  favorite?: boolean;
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
