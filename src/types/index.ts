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
}

export enum ClothingCategory {
  TOPS = 'tops',
  BOTTOMS = 'bottoms',
  DRESSES = 'dresses',
  OUTERWEAR = 'outerwear',
  SHOES = 'shoes',
  ACCESSORIES = 'accessories'
}

export enum Season {
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
}
