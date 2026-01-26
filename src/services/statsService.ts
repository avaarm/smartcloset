import { ClothingItem, WardrobeStats, ClothingCategory, Season, ClothingCategoryEnum, SeasonEnum } from '../types';

export class StatsService {
  static calculateWardrobeStats(items: ClothingItem[]): WardrobeStats {
    const wardrobeItems = items.filter(item => !item.isWishlist);
    
    // Calculate items by category
    const itemsByCategory = wardrobeItems.reduce((acc, item) => {
      const category = item.category as ClothingCategory;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<ClothingCategory, number>);

    // Initialize all categories with 0
    Object.values(ClothingCategoryEnum).forEach(category => {
      if (!itemsByCategory[category as ClothingCategory]) {
        itemsByCategory[category as ClothingCategory] = 0;
      }
    });

    // Calculate items by season
    const itemsBySeason = wardrobeItems.reduce((acc, item) => {
      item.season?.forEach(season => {
        const s = season as Season;
        acc[s] = (acc[s] || 0) + 1;
      });
      return acc;
    }, {} as Record<Season, number>);

    // Initialize all seasons with 0
    Object.values(SeasonEnum).forEach(season => {
      if (!itemsBySeason[season as Season]) {
        itemsBySeason[season as Season] = 0;
      }
    });

    // Calculate total value
    const totalValue = wardrobeItems.reduce((sum, item) => sum + (item.cost || 0), 0);

    // Find most and least worn items
    const itemsWithWearCount = wardrobeItems.filter(item => (item.wearCount || 0) > 0);
    const mostWornItem = itemsWithWearCount.reduce((max, item) => 
      (item.wearCount || 0) > (max.wearCount || 0) ? item : max
    , itemsWithWearCount[0]);

    const leastWornItem = itemsWithWearCount.reduce((min, item) => 
      (item.wearCount || 0) < (min.wearCount || 0) ? item : min
    , itemsWithWearCount[0]);

    // Calculate average wear count
    const totalWearCount = wardrobeItems.reduce((sum, item) => sum + (item.wearCount || 0), 0);
    const averageWearCount = wardrobeItems.length > 0 ? totalWearCount / wardrobeItems.length : 0;

    // Count wishlist items
    const wishlistCount = items.filter(item => item.isWishlist).length;

    return {
      totalItems: wardrobeItems.length,
      itemsByCategory,
      itemsBySeason,
      totalValue,
      mostWornItem,
      leastWornItem,
      averageWearCount,
      wishlistCount,
    };
  }

  static getCostPerWear(item: ClothingItem): number {
    if (!item.cost || !item.wearCount || item.wearCount === 0) {
      return item.cost || 0;
    }
    return item.cost / item.wearCount;
  }

  static getUnwornItems(items: ClothingItem[]): ClothingItem[] {
    return items.filter(item => !item.isWishlist && (!item.wearCount || item.wearCount === 0));
  }

  static getMostWornItems(items: ClothingItem[], limit: number = 5): ClothingItem[] {
    return items
      .filter(item => !item.isWishlist && (item.wearCount || 0) > 0)
      .sort((a, b) => (b.wearCount || 0) - (a.wearCount || 0))
      .slice(0, limit);
  }

  static getBestValueItems(items: ClothingItem[], limit: number = 5): ClothingItem[] {
    return items
      .filter(item => !item.isWishlist && item.cost && item.wearCount && item.wearCount > 0)
      .sort((a, b) => this.getCostPerWear(a) - this.getCostPerWear(b))
      .slice(0, limit);
  }

  static getSeasonalBreakdown(items: ClothingItem[], season: Season): ClothingItem[] {
    return items.filter(item => 
      !item.isWishlist && item.season?.includes(season)
    );
  }

  static getRecentlyAdded(items: ClothingItem[], limit: number = 5): ClothingItem[] {
    return items
      .filter(item => !item.isWishlist)
      .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
      .slice(0, limit);
  }

  static getFavorites(items: ClothingItem[]): ClothingItem[] {
    return items.filter(item => !item.isWishlist && item.favorite);
  }
}
