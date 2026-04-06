import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem, Outfit, OutfitHistory } from '../types';
import { getClothingItems, updateClothingItem } from './storage';
import { supabase } from '../config/supabase';

const OUTFIT_HISTORY_KEY = '@smartcloset_outfit_history';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

const mapDbToHistory = (row: any): OutfitHistory => ({
  id: row.id,
  outfitId: row.outfit_id,
  dateWorn: row.date_worn || row.created_at,
  occasion: row.occasion,
  rating: row.rating,
  notes: row.notes,
});

// ─── Guest-mode AsyncStorage fallback ────────────────────────────────────────

const getLocalHistory = async (): Promise<OutfitHistory[]> => {
  const history = await AsyncStorage.getItem(OUTFIT_HISTORY_KEY);
  return history ? JSON.parse(history) : [];
};

const addLocalHistory = async (entry: OutfitHistory): Promise<void> => {
  const history = await getLocalHistory();
  await AsyncStorage.setItem(OUTFIT_HISTORY_KEY, JSON.stringify([entry, ...history]));
};

const deleteLocalHistory = async (historyId: string): Promise<void> => {
  const history = await getLocalHistory();
  await AsyncStorage.setItem(
    OUTFIT_HISTORY_KEY,
    JSON.stringify(history.filter(e => e.id !== historyId)),
  );
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class WearTrackingService {
  /**
   * Mark a clothing item as worn today
   */
  static async markItemWorn(itemId: string): Promise<void> {
    try {
      const userId = await getAuthUserId();

      if (userId) {
        // Supabase: increment wear_count and set last_worn directly
        const { error } = await supabase.rpc('increment_wear_count', { item_id: itemId });
        // If the RPC doesn't exist, fall back to a read-update cycle
        if (error) {
          const items = await getClothingItems();
          const item = items.find(i => i.id === itemId);
          if (!item) throw new Error('Item not found');
          await updateClothingItem({
            ...item,
            wearCount: (item.wearCount || 0) + 1,
            lastWorn: new Date().toISOString(),
          });
        }
      } else {
        const items = await getClothingItems();
        const item = items.find(i => i.id === itemId);
        if (!item) throw new Error('Item not found');
        await updateClothingItem({
          ...item,
          wearCount: (item.wearCount || 0) + 1,
          lastWorn: new Date().toISOString(),
        });
      }
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
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
      const userId = await getAuthUserId();
      if (!userId) return getLocalHistory();

      const { data, error } = await supabase
        .from('outfit_history')
        .select('*')
        .order('date_worn', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapDbToHistory);
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
      const userId = await getAuthUserId();
      if (!userId) return addLocalHistory(entry);

      const { error } = await supabase.from('outfit_history').insert({
        user_id: userId,
        outfit_id: entry.outfitId,
        date_worn: entry.dateWorn,
        occasion: entry.occasion,
        rating: entry.rating,
        notes: entry.notes,
      });
      if (error) throw error;
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
      const userId = await getAuthUserId();
      if (!userId) {
        const history = await getLocalHistory();
        return history.filter(entry => entry.outfitId === outfitId);
      }

      const { data, error } = await supabase
        .from('outfit_history')
        .select('*')
        .eq('outfit_id', outfitId)
        .order('date_worn', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapDbToHistory);
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
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const userId = await getAuthUserId();
      if (!userId) {
        const history = await getLocalHistory();
        return history.filter(entry => new Date(entry.dateWorn) >= cutoffDate);
      }

      const { data, error } = await supabase
        .from('outfit_history')
        .select('*')
        .gte('date_worn', cutoffDate.toISOString())
        .order('date_worn', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapDbToHistory);
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
      const userId = await getAuthUserId();
      if (!userId) return deleteLocalHistory(historyId);

      const { error } = await supabase
        .from('outfit_history')
        .delete()
        .eq('id', historyId);
      if (error) throw error;
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
      const userId = await getAuthUserId();
      let filteredHistory: OutfitHistory[];

      if (!userId) {
        const history = await getLocalHistory();
        filteredHistory = history.filter(entry => {
          const d = new Date(entry.dateWorn);
          return d >= startDate && d <= endDate;
        });
      } else {
        const { data, error } = await supabase
          .from('outfit_history')
          .select('*')
          .gte('date_worn', startDate.toISOString())
          .lte('date_worn', endDate.toISOString());
        if (error) throw error;
        filteredHistory = (data || []).map(mapDbToHistory);
      }

      const uniqueOutfits = new Set(filteredHistory.map(entry => entry.outfitId));
      const ratings = filteredHistory.filter(entry => entry.rating).map(entry => entry.rating!);
      const averageRating = ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

      return {
        totalWears: filteredHistory.length,
        uniqueItems: new Set(),
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
