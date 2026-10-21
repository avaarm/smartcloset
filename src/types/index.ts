import type { ClothingCategory, MaterialComponent, MaterialTier, Season } from './clothing';
import type { ItemCondition } from '../utils/itemCondition';

// One definition of each, in clothing.ts, so the two modules can't drift apart.
export type { ClothingCategory, MaterialComponent, MaterialTier, Season };

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  /** The specific kind inside the category ("Tote", "Ankle boots", "Belt"); see utils/clothingTypes. */
  subcategory?: string;
  /** The size on the label ("M", "8", "EU 38"); free text, at most 20 characters. */
  size?: string;
  /** How worn it is; shown when it is listed for a swap. */
  condition?: ItemCondition;
  /** Care words read off the tag ("Machine wash cold"). */
  careInstructions?: string[];
  /** The "Made in ..." country from the tag. */
  originCountry?: string;
  /** The text read from a photo of the material/care tag, as read. */
  tagText?: string;
  retailerImage?: string;
  userImage?: string;
  /**
   * Every photo of the piece, cover first (at most MAX_ITEM_IMAGES; see utils/itemImages). `userImage` and
   * `retailerImage` keep holding the cover, so anything that shows one picture is unchanged. Items saved
   * before this field existed have no list: itemImages() builds it from the cover.
   */
  images?: string[];
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
