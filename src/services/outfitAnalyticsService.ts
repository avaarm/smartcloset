import { getSavedOutfits } from './outfitService';
import { WearTrackingService } from './wearTrackingService';
import { OutfitHistory } from '../types';

export interface OutfitAnalytics {
  totalOutfits: number;
  totalWears: number;
  mostWornOutfit: {
    id: string;
    name: string;
    wearCount: number;
  } | null;
  leastWornOutfit: {
    id: string;
    name: string;
    wearCount: number;
  } | null;
  averageWearCount: number;
  recentlyWornOutfits: OutfitHistory[];
  wearsByMonth: { month: string; count: number }[];
  favoriteOccasions: { occasion: string; count: number }[];
  averageRating: number;
  unwornOutfits: number;
}

export class OutfitAnalyticsService {
  /**
   * Get comprehensive outfit analytics
   */
  static async getOutfitAnalytics(): Promise<OutfitAnalytics> {
    try {
      const savedOutfits = await getSavedOutfits();
      const allHistory = await WearTrackingService.getOutfitHistory();

      // Calculate wear counts per outfit
      const wearCounts = new Map<string, number>();
      allHistory.forEach((entry) => {
        const count = wearCounts.get(entry.outfitId) || 0;
        wearCounts.set(entry.outfitId, count + 1);
      });

      // Find most and least worn outfits
      let mostWornOutfit = null;
      let leastWornOutfit = null;
      let maxWears = 0;
      let minWears = Infinity;

      savedOutfits.forEach((outfit) => {
        const wearCount = wearCounts.get(outfit.id) || 0;
        
        if (wearCount > maxWears) {
          maxWears = wearCount;
          mostWornOutfit = {
            id: outfit.id,
            name: outfit.name,
            wearCount,
          };
        }

        if (wearCount < minWears && wearCount > 0) {
          minWears = wearCount;
          leastWornOutfit = {
            id: outfit.id,
            name: outfit.name,
            wearCount,
          };
        }
      });

      // Calculate average wear count
      const totalWears = allHistory.length;
      const averageWearCount = savedOutfits.length > 0 ? totalWears / savedOutfits.length : 0;

      // Get recently worn outfits (last 30 days)
      const recentlyWornOutfits = await WearTrackingService.getRecentWearHistory(30);

      // Calculate wears by month (last 6 months)
      const wearsByMonth = this.calculateWearsByMonth(allHistory);

      // Calculate favorite occasions
      const favoriteOccasions = this.calculateFavoriteOccasions(allHistory);

      // Calculate average rating
      const ratingsArray = allHistory
        .filter((entry) => entry.rating)
        .map((entry) => entry.rating!);
      const averageRating =
        ratingsArray.length > 0
          ? ratingsArray.reduce((sum, rating) => sum + rating, 0) / ratingsArray.length
          : 0;

      // Count unworn outfits
      const unwornOutfits = savedOutfits.filter(
        (outfit) => !wearCounts.has(outfit.id) || wearCounts.get(outfit.id) === 0
      ).length;

      return {
        totalOutfits: savedOutfits.length,
        totalWears,
        mostWornOutfit,
        leastWornOutfit,
        averageWearCount,
        recentlyWornOutfits,
        wearsByMonth,
        favoriteOccasions,
        averageRating,
        unwornOutfits,
      };
    } catch (error) {
      console.error('Error getting outfit analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate wears by month for the last 6 months
   */
  private static calculateWearsByMonth(
    history: OutfitHistory[]
  ): { month: string; count: number }[] {
    const monthCounts = new Map<string, number>();
    const now = new Date();

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthCounts.set(monthKey, 0);
    }

    // Count wears per month
    history.forEach((entry) => {
      const date = new Date(entry.dateWorn);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (monthCounts.has(monthKey)) {
        monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
      }
    });

    return Array.from(monthCounts.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  }

  /**
   * Calculate favorite occasions
   */
  private static calculateFavoriteOccasions(
    history: OutfitHistory[]
  ): { occasion: string; count: number }[] {
    const occasionCounts = new Map<string, number>();

    history.forEach((entry) => {
      if (entry.occasion) {
        const count = occasionCounts.get(entry.occasion) || 0;
        occasionCounts.set(entry.occasion, count + 1);
      }
    });

    return Array.from(occasionCounts.entries())
      .map(([occasion, count]) => ({ occasion, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * Get outfit wear trend (increasing, decreasing, stable)
   */
  static async getWearTrend(): Promise<'increasing' | 'decreasing' | 'stable'> {
    try {
      const history = await WearTrackingService.getOutfitHistory();
      
      if (history.length < 2) {
        return 'stable';
      }

      // Compare last 30 days vs previous 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const recentWears = history.filter((entry) => {
        const date = new Date(entry.dateWorn);
        return date >= thirtyDaysAgo && date <= now;
      }).length;

      const previousWears = history.filter((entry) => {
        const date = new Date(entry.dateWorn);
        return date >= sixtyDaysAgo && date < thirtyDaysAgo;
      }).length;

      if (recentWears > previousWears * 1.2) {
        return 'increasing';
      } else if (recentWears < previousWears * 0.8) {
        return 'decreasing';
      }
      return 'stable';
    } catch (error) {
      console.error('Error getting wear trend:', error);
      return 'stable';
    }
  }
}
