import type { ClothingItem } from '../types';

export type WardrobeSummary = {
  /** Items the user owns (wishlist excluded). */
  owned: number;
  wishlist: number;
  /** What the owned items cost the user. */
  value: number;
  /** Newest-first, for the Home "Recently added" strip. */
  recent: ClothingItem[];
};

const RECENT_COUNT = 10;

export const summarizeWardrobe = (items: ClothingItem[]): WardrobeSummary => {
  const ownedItems = items.filter(item => !item.isWishlist);
  const added = (item: ClothingItem) => (item.dateAdded ? new Date(item.dateAdded).getTime() : 0);
  return {
    owned: ownedItems.length,
    wishlist: items.length - ownedItems.length,
    value: ownedItems.reduce((sum, item) => sum + (item.cost || 0), 0),
    recent: [...items].sort((a, b) => added(b) - added(a)).slice(0, RECENT_COUNT),
  };
};
