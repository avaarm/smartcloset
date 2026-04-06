import { ClothingItem, Season } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

// Define outfit structure
export interface Outfit {
  id: string;
  name: string;
  items: ClothingItem[];
  season?: Season[];
  occasion?: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Generate outfit suggestions based on available clothing items
 * @param items All clothing items in the wardrobe
 * @param count Number of outfits to generate
 * @returns Array of outfit suggestions
 */
export const generateOutfitSuggestions = (items: ClothingItem[], count: number = 3): Outfit[] => {
  const outfits: Outfit[] = [];
  
  // Group items by category
  const tops = items.filter(item => item.category === 'tops');
  const bottoms = items.filter(item => item.category === 'bottoms');
  const dresses = items.filter(item => item.category === 'dresses');
  const outerwear = items.filter(item => item.category === 'outerwear');
  const shoes = items.filter(item => item.category === 'shoes');
  const accessories = items.filter(item => item.category === 'accessories');
  
  // Helper function to get random item from array
  const getRandomItem = <T>(array: T[]): T | undefined => {
    if (array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
  };
  
  // Helper function to check if seasons overlap
  const seasonsOverlap = (item1: ClothingItem, item2: ClothingItem): boolean => {
    if (!item1.season || !item2.season) return true;
    return item1.season.some((season: Season) => item2.season!.includes(season));
  };
  
  // Generate outfits based on current season
  const currentMonth = new Date().getMonth();
  let currentSeason: Season;
  
  // Determine current season
  if (currentMonth >= 2 && currentMonth <= 4) {
    currentSeason = 'spring' as const;
  } else if (currentMonth >= 5 && currentMonth <= 7) {
    currentSeason = 'summer' as const;
  } else if (currentMonth >= 8 && currentMonth <= 10) {
    currentSeason = 'fall' as const;
  } else {
    currentSeason = 'winter' as const;
  }
  
  // Filter items by current season
  const seasonalTops = tops.filter(item => !item.season || item.season.includes(currentSeason));
  const seasonalBottoms = bottoms.filter(item => !item.season || item.season.includes(currentSeason));
  const seasonalDresses = dresses.filter(item => !item.season || item.season.includes(currentSeason));
  const seasonalOuterwear = outerwear.filter(item => !item.season || item.season.includes(currentSeason));
  const seasonalShoes = shoes.filter(item => !item.season || item.season.includes(currentSeason));
  
  // Try to create outfits with tops and bottoms
  for (let i = 0; i < count * 2 && outfits.length < count; i++) {
    if (seasonalTops.length > 0 && seasonalBottoms.length > 0) {
      const top = getRandomItem(seasonalTops);
      const bottom = getRandomItem(seasonalBottoms);
      
      if (top && bottom && seasonsOverlap(top, bottom)) {
        const outfitItems: ClothingItem[] = [top, bottom];
        
        // Add shoes if available and matching season
        const shoe = getRandomItem(seasonalShoes);
        if (shoe && (outfitItems.every(item => seasonsOverlap(item, shoe)))) {
          outfitItems.push(shoe);
        }
        
        // Add outerwear if it's fall or winter
        if ((currentSeason === 'fall' || currentSeason === 'winter') && seasonalOuterwear.length > 0) {
          const jacket = getRandomItem(seasonalOuterwear);
          if (jacket && (outfitItems.every(item => seasonsOverlap(item, jacket)))) {
            outfitItems.push(jacket);
          }
        }
        
        // Add an accessory if available
        if (accessories.length > 0) {
          const accessory = getRandomItem(accessories);
          if (accessory) {
            outfitItems.push(accessory);
          }
        }
        
        // Create outfit object
        const outfit: Outfit = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`,
          name: `${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Outfit`,
          items: outfitItems,
          season: [currentSeason],
          occasion: 'casual',
          createdAt: new Date().toISOString()
        };
        
        outfits.push(outfit);
      }
    }
  }
  
  // If we don't have enough outfits, try to create some with dresses
  if (outfits.length < count && seasonalDresses.length > 0) {
    for (let i = 0; i < count && outfits.length < count; i++) {
      const dress = getRandomItem(seasonalDresses);
      
      if (dress) {
        const outfitItems: ClothingItem[] = [dress];
        
        // Add shoes if available and matching season
        const shoe = getRandomItem(seasonalShoes);
        if (shoe && seasonsOverlap(dress, shoe)) {
          outfitItems.push(shoe);
        }
        
        // Add outerwear if it's fall or winter
        if ((currentSeason === 'fall' || currentSeason === 'winter') && seasonalOuterwear.length > 0) {
          const jacket = getRandomItem(seasonalOuterwear);
          if (jacket && seasonsOverlap(dress, jacket)) {
            outfitItems.push(jacket);
          }
        }
        
        // Add an accessory if available
        if (accessories.length > 0) {
          const accessory = getRandomItem(accessories);
          if (accessory) {
            outfitItems.push(accessory);
          }
        }
        
        // Create outfit object
        const outfit: Outfit = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-dress-${i}`,
          name: `${dress.color || ''} Dress Outfit`,
          items: outfitItems,
          season: [currentSeason],
          occasion: 'casual',
          createdAt: new Date().toISOString()
        };
        
        outfits.push(outfit);
      }
    }
  }
  
  return outfits;
};

// Storage key for saved outfits (guest fallback)
const SAVED_OUTFITS_KEY = '@smartcloset_saved_outfits';

// ─── Guest-mode AsyncStorage fallback ────────────────────────────────────────

const getLocalOutfits = async (): Promise<Outfit[]> => {
  const outfits = await AsyncStorage.getItem(SAVED_OUTFITS_KEY);
  return outfits ? JSON.parse(outfits) : [];
};

const saveLocalOutfit = async (outfit: Outfit): Promise<void> => {
  const savedOutfits = await getLocalOutfits();
  await AsyncStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify([...savedOutfits, outfit]));
};

const deleteLocalOutfit = async (outfitId: string): Promise<void> => {
  const savedOutfits = await getLocalOutfits();
  await AsyncStorage.setItem(
    SAVED_OUTFITS_KEY,
    JSON.stringify(savedOutfits.filter(o => o.id !== outfitId)),
  );
};

// ─── DB mapping ──────────────────────────────────────────────────────────────

const mapDbToOutfit = (row: any, items: ClothingItem[]): Outfit => ({
  id: row.id,
  name: row.name,
  items,
  season: row.season || [],
  occasion: row.occasion,
  createdAt: row.date_created || row.created_at,
});

// ─── Public API ──────────────────────────────────────────────────────────────

export const saveOutfit = async (outfit: Outfit): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return saveLocalOutfit(outfit);

    const itemIds = outfit.items.map(item => item.id);
    const { error } = await supabase.from('outfits').insert({
      user_id: userId,
      name: outfit.name,
      item_ids: itemIds,
      season: outfit.season || [],
      occasion: outfit.occasion,
    });
    if (error) throw error;
  } catch (error) {
    console.error('Error saving outfit:', error);
    throw error;
  }
};

export const getSavedOutfits = async (): Promise<Outfit[]> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return getLocalOutfits();

    const { data: outfitRows, error } = await supabase
      .from('outfits')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!outfitRows || outfitRows.length === 0) return [];

    // Collect all unique item IDs across all outfits
    const allItemIds = [...new Set(outfitRows.flatMap((o: any) => o.item_ids || []))];
    let itemsMap: Record<string, ClothingItem> = {};

    if (allItemIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('clothing_items')
        .select('*')
        .in('id', allItemIds);
      if (itemRows) {
        const { mapDbToClothingItem } = require('./storage');
        for (const row of itemRows) {
          itemsMap[row.id] = mapDbToClothingItem ? mapDbToClothingItem(row) : row;
        }
      }
    }

    return outfitRows.map((row: any) => {
      const items = (row.item_ids || [])
        .map((id: string) => itemsMap[id])
        .filter(Boolean);
      return mapDbToOutfit(row, items);
    });
  } catch (error) {
    console.error('Error getting saved outfits:', error);
    return [];
  }
};

export const deleteSavedOutfit = async (outfitId: string): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return deleteLocalOutfit(outfitId);

    const { error } = await supabase
      .from('outfits')
      .delete()
      .eq('id', outfitId);
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting saved outfit:', error);
    throw error;
  }
};
