import { ClothingItem } from '../data/sampleClothes';
import { Season } from '../types/clothing';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define outfit structure
export interface Outfit {
  id: string;
  name: string;
  items: ClothingItem[];
  season?: Season[];
  occasion?: string;
  createdAt: string;
}

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
    return item1.season.some(season => item2.season.includes(season));
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
          id: Date.now().toString() + i,
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
          id: Date.now().toString() + i + 'dress',
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

// Storage key for saved outfits
const SAVED_OUTFITS_KEY = '@smartcloset_saved_outfits';

// Function to save an outfit to AsyncStorage
export const saveOutfit = async (outfit: Outfit): Promise<void> => {
  try {
    const savedOutfits = await getSavedOutfits();
    const updatedOutfits = [...savedOutfits, outfit];
    await AsyncStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify(updatedOutfits));
  } catch (error) {
    console.error('Error saving outfit:', error);
    throw error;
  }
};

// Function to get saved outfits from AsyncStorage
export const getSavedOutfits = async (): Promise<Outfit[]> => {
  try {
    const outfits = await AsyncStorage.getItem(SAVED_OUTFITS_KEY);
    return outfits ? JSON.parse(outfits) : [];
  } catch (error) {
    console.error('Error getting saved outfits:', error);
    return [];
  }
};

// Function to delete a saved outfit
export const deleteSavedOutfit = async (outfitId: string): Promise<void> => {
  try {
    const savedOutfits = await getSavedOutfits();
    const updatedOutfits = savedOutfits.filter(outfit => outfit.id !== outfitId);
    await AsyncStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify(updatedOutfits));
  } catch (error) {
    console.error('Error deleting saved outfit:', error);
    throw error;
  }
};
