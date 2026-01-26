import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem, Outfit, OutfitHistory } from '../types';
import { getClothingItems, updateClothingItem } from './storage';

const OUTFIT_HISTORY_KEY = '@smartcloset_outfit_history';

export class WearTrackingService {
  /**
   * Mark a clothing item as worn today
   */
  static async markItemWorn(itemId: string): Promise<void> {
    try {
      const items = await getClothingItems();
      const item = items.find(i => i.id === itemId);
      
      if (!item) {
        throw new Error('Item not found');
      }

      const updatedItem: ClothingItem = {
        ...item,
        wearCount: (item.wearCount || 0) + 1,
        lastWorn: new Date().toISOString(),
      };

      await updateClothingItem(updatedItem);
    } catch (error) {
      console.error('Error marking item as worn:', error);
      throw error;
    }
  }

  /**
   * Mark multiple items as worn (e.g., an outfit)
   */
  static async markItemsWorn(itemIds: string[]): Promise<void> {
    try {
      const promises = itemIds.map(id => this.markItemWorn(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error marking items as worn:', error);
      throw error;
    }
  }

  /**
   * Mark an outfit as worn and track it in history
   */
  static async markOutfitWorn(
    outfit: any,
    occasion?: string,
    rating?: number,
    notes?: string
  ): Promise<void> {
    try {
      // Extract item IDs from outfit items (handle both ClothingItem[] and string[])
      const itemIds = outfit.items.map((item: any) => 
        typeof item === 'string' ? item : item.id
      );
      
      // Mark all items in the outfit as worn
      await this.markItemsWorn(itemIds);

      // Create outfit history entry
      const historyEntry: OutfitHistory = {
        id: Date.now().toString(),
        outfitId: outfit.id,
        dateWorn: new Date().toISOString(),
        occasion,
        rating,
        notes,
      };

      // Save to outfit history
      await this.addOutfitHistory(historyEntry);
    } catch (error) {
      console.error('Error marking outfit as worn:', error);
      throw error;
    }
  }

  /**
   * Get outfit history
   */
  static async getOutfitHistory(): Promise<OutfitHistory[]> {
    try {
      const history = await AsyncStorage.getItem(OUTFIT_HISTORY_KEY);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error getting outfit history:', error);
      return [];
    }
  }

  /**
   * Add an entry to outfit history
   */
  static async addOutfitHistory(entry: OutfitHistory): Promise<void> {
    try {
      const history = await this.getOutfitHistory();
      const updatedHistory = [entry, ...history];
      await AsyncStorage.setItem(OUTFIT_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Error adding outfit history:', error);
      throw error;
    }
  }

  /**
   * Get history for a specific outfit
   */
  static async getOutfitHistoryById(outfitId: string): Promise<OutfitHistory[]> {
    try {
      const history = await this.getOutfitHistory();
      return history.filter(entry => entry.outfitId === outfitId);
    } catch (error) {
      console.error('Error getting outfit history by ID:', error);
      return [];
    }
  }

  /**
   * Get recent wear history (last N days)
   */
  static async getRecentWearHistory(days: number = 30): Promise<OutfitHistory[]> {
    try {
      const history = await this.getOutfitHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      return history.filter(entry => {
        const entryDate = new Date(entry.dateWorn);
        return entryDate >= cutoffDate;
      });
    } catch (error) {
      console.error('Error getting recent wear history:', error);
      return [];
    }
  }

  /**
   * Delete an outfit history entry
   */
  static async deleteOutfitHistory(historyId: string): Promise<void> {
    try {
      const history = await this.getOutfitHistory();
      const updatedHistory = history.filter(entry => entry.id !== historyId);
      await AsyncStorage.setItem(OUTFIT_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Error deleting outfit history:', error);
      throw error;
    }
  }

  /**
   * Get wear statistics for a date range
   */
  static async getWearStats(startDate: Date, endDate: Date): Promise<{
    totalWears: number;
    uniqueItems: Set<string>;
    uniqueOutfits: Set<string>;
    averageRating: number;
  }> {
    try {
      const history = await this.getOutfitHistory();
      const filteredHistory = history.filter(entry => {
        const entryDate = new Date(entry.dateWorn);
        return entryDate >= startDate && entryDate <= endDate;
      });

      const uniqueOutfits = new Set(filteredHistory.map(entry => entry.outfitId));
      const ratings = filteredHistory.filter(entry => entry.rating).map(entry => entry.rating!);
      const averageRating = ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

      return {
        totalWears: filteredHistory.length,
        uniqueItems: new Set(), // Would need to expand outfits to get items
        uniqueOutfits,
        averageRating,
      };
    } catch (error) {
      console.error('Error getting wear stats:', error);
      return {
        totalWears: 0,
        uniqueItems: new Set(),
        uniqueOutfits: new Set(),
        averageRating: 0,
      };
    }
  }
}
