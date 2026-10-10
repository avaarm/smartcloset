import { ClothingItem, Season } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rehomeItemImages } from './localImagePaths';
import { supabase } from '../config/supabase';
import { getAuthUserId } from './authUser';
import { EXTRA_CATEGORIES } from '../utils/clothingOptions';

// Define outfit structure
export interface Outfit {
  id: string;
  name: string;
  items: ClothingItem[];
  season?: Season[];
  occasion?: string;
  createdAt: string;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface OutfitSuggestionOptions {
  /**
   * What the outfits are for; casual when omitted. Only 'sports' changes what
   * can be suggested: activewear then forms the outfit, where in any other
   * occasion it (and swimwear) is never part of one.
   */
  occasion?: string;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Items with no season listed are suitable year-round. */
const isYearRound = (item: ClothingItem): boolean => !item.season || item.season.length === 0;

const seasonsOverlap = (a: ClothingItem, b: ClothingItem): boolean =>
  isYearRound(a) || isYearRound(b) || a.season.some((season: Season) => b.season.includes(season));

const getRandomItem = <T>(array: T[]): T | undefined =>
  array.length === 0 ? undefined : array[Math.floor(Math.random() * array.length)];

const dressOutfitName = (dress: ClothingItem): string =>
  dress.color ? `${capitalize(dress.color)} Dress Outfit` : 'Dress Outfit';

const currentSeasonName = (): Season => {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
};

/**
 * Generate outfit suggestions based on available clothing items.
 *
 * An outfit is a top and a bottom (or a dress) plus shoes, optionally with
 * outerwear in the cold and ONE small extra: a bag, jewelry, a hat or an
 * accessory. The extras only ever finish an outfit; they never stand in for a
 * top, bottom, dress or shoes.
 *
 * @param items All clothing items in the wardrobe
 * @param count Number of outfits to generate
 * @returns Array of outfit suggestions
 */
export const generateOutfitSuggestions = (
  items: ClothingItem[],
  count: number = 3,
  options: OutfitSuggestionOptions = {},
): Outfit[] => {
  const outfits: Outfit[] = [];
  const currentSeason = currentSeasonName();
  const wantsLayer = currentSeason === 'fall' || currentSeason === 'winter';

  const inCategory = (...categories: ClothingItem['category'][]) =>
    items.filter(item => categories.includes(item.category));
  const inSeason = (list: ClothingItem[]) =>
    list.filter(item => isYearRound(item) || item.season.includes(currentSeason));

  const tops = inCategory('tops');
  const bottoms = inCategory('bottoms');
  const dresses = inCategory('dresses');
  const outerwear = inCategory('outerwear');
  const shoes = inCategory('shoes');
  const extras = inCategory(...EXTRA_CATEGORIES);

  const makeOutfit = (
    id: string,
    name: string,
    pieces: ClothingItem[],
    extra: Partial<Outfit> = {},
  ): Outfit => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${id}`,
    name,
    items: pieces,
    occasion: 'casual',
    createdAt: new Date().toISOString(),
    ...extra,
  });

  /**
   * Add shoes, a fall/winter layer and one extra to the core pieces. With
   * `matchSeasons` each must share a season with everything already chosen.
   */
  const finish = (
    core: ClothingItem[],
    pool: { shoes: ClothingItem[]; outerwear: ClothingItem[]; extras: ClothingItem[] },
    matchSeasons: boolean,
  ): ClothingItem[] => {
    const pieces = [...core];
    const tryAdd = (candidate: ClothingItem | undefined) => {
      if (candidate && (!matchSeasons || pieces.every(piece => seasonsOverlap(piece, candidate)))) {
        pieces.push(candidate);
      }
    };
    tryAdd(getRandomItem(pool.shoes));
    if (wantsLayer) tryAdd(getRandomItem(pool.outerwear));
    tryAdd(getRandomItem(pool.extras));
    return pieces;
  };

  // Sports: the activewear itself is the outfit (e.g. leggings and a sports top).
  const activewear = inCategory('activewear');
  if (options.occasion === 'sports' && activewear.length > 0) {
    for (let i = 0; i < count; i++) {
      const first = getRandomItem(activewear)!;
      const second = getRandomItem(activewear.filter(item => item !== first));
      const core = second ? [first, second] : [first];
      outfits.push(
        makeOutfit(`sports-${i}`, 'Workout Outfit', finish(core, { shoes, outerwear: [], extras }, false), {
          occasion: 'sports',
        }),
      );
    }
    return outfits;
  }

  // Filter items by current season
  const seasonal = {
    tops: inSeason(tops),
    bottoms: inSeason(bottoms),
    dresses: inSeason(dresses),
    outerwear: inSeason(outerwear),
    shoes: inSeason(shoes),
    extras: inSeason(extras),
  };

  // Try to create outfits with tops and bottoms
  for (let i = 0; i < count * 2 && outfits.length < count; i++) {
    const top = getRandomItem(seasonal.tops);
    const bottom = getRandomItem(seasonal.bottoms);
    if (top && bottom && seasonsOverlap(top, bottom)) {
      outfits.push(
        makeOutfit(
          String(i),
          `${capitalize(currentSeason)} Outfit`,
          finish([top, bottom], seasonal, true),
          { season: [currentSeason] },
        ),
      );
    }
  }

  // If we don't have enough outfits, try to create some with dresses
  if (outfits.length < count && seasonal.dresses.length > 0) {
    for (let i = 0; i < count && outfits.length < count; i++) {
      const dress = getRandomItem(seasonal.dresses)!;
      outfits.push(
        makeOutfit(`dress-${i}`, dressOutfitName(dress), finish([dress], seasonal, true), {
          season: [currentSeason],
        }),
      );
    }
  }

  // Final fallback: strict seasonal matching found nothing (e.g. every top's
  // season list happens to exclude the current season, or no two items share
  // a season). Ignore season constraints entirely rather than surfacing zero
  // suggestions when the wardrobe actually has enough items to combine.
  if (outfits.length === 0) {
    const anySeason = { shoes, outerwear, extras };
    for (let i = 0; i < count * 2 && outfits.length < count; i++) {
      if (tops.length > 0 && bottoms.length > 0) {
        const core = [getRandomItem(tops)!, getRandomItem(bottoms)!];
        outfits.push(makeOutfit(`fallback-${i}`, 'Outfit Idea', finish(core, anySeason, false)));
      } else if (dresses.length > 0) {
        const dress = getRandomItem(dresses)!;
        outfits.push(makeOutfit(`fallback-dress-${i}`, dressOutfitName(dress), finish([dress], anySeason, false)));
      } else {
        break;
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
  if (!outfits) return [];
  return (JSON.parse(outfits) as Outfit[]).map(o => ({ ...o, items: (o.items || []).map(rehomeItemImages) }));
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

/** Same pieces, in any order. */
const sameItems = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Save an outfit. Saving a set of items that is already saved is a no-op, so a
 * second tap on a suggestion's bookmark can't create a duplicate.
 */
export const saveOutfit = async (outfit: Outfit): Promise<void> => {
  try {
    const itemIds = outfit.items.map(item => item.id);
    const userId = await getAuthUserId();
    if (!userId) {
      const existing = await getLocalOutfits();
      if (existing.some(o => sameItems((o.items || []).map(i => i.id), itemIds))) return;
      return saveLocalOutfit(outfit);
    }

    const { data: existing, error: existingError } = await supabase
      .from('outfits')
      .select('item_ids')
      .eq('user_id', userId);
    if (existingError) throw existingError;
    if ((existing || []).some((o: any) => sameItems(o.item_ids || [], itemIds))) return;

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
      const { data: itemRows, error: itemsError } = await supabase
        .from('clothing_items')
        .select('*')
        .in('id', allItemIds);
      if (itemsError) throw itemsError;
      if (itemRows) {
        const { mapDbToClothingItem } = require('./storage');
        const { withSignedImages } = require('./imageUrls');
        const mapped = await withSignedImages(
          itemRows.map((row: any) => (mapDbToClothingItem ? mapDbToClothingItem(row) : row)),
        );
        for (const item of mapped) {
          itemsMap[item.id] = item;
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
    // Rethrow: returning [] here made a failed load look like "no saved outfits"
    // (and wiped an already-loaded list on a failed pull-to-refresh).
    console.error('Error getting saved outfits:', error);
    throw error;
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
