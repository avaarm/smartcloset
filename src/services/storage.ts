import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem } from '../types';
import { enhancedClothingItems, enhancedOutfits } from '../data/enhancedSampleData';
import { supabase } from '../config/supabase';
import { seedAllDemoData } from './seedDemoData';

const STORAGE_KEY = '@smartcloset_items';
const INITIALIZED_KEY = '@smartcloset_initialized_v6';
const SAVED_OUTFITS_KEY = '@smartcloset_saved_outfits';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
};

export const mapDbToClothingItem = (row: any): ClothingItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  retailerImage: row.retailer_image,
  userImage: row.user_image,
  brand: row.brand,
  color: row.color,
  season: row.season || [],
  dateAdded: row.date_added || row.created_at,
  isWishlist: row.is_wishlist ?? false,
  wearCount: row.wear_count ?? 0,
  lastWorn: row.last_worn,
  cost: row.cost ? Number(row.cost) : undefined,
  retailCost: row.retail_cost ? Number(row.retail_cost) : undefined,
  purchaseDate: row.purchase_date,
  notes: row.notes,
  tags: row.tags || [],
  favorite: row.favorite ?? false,
  retailer: row.retailer,
  materials: row.materials || undefined,
});

const mapClothingItemToDb = (item: Partial<ClothingItem>, userId: string) => ({
  user_id: userId,
  name: item.name,
  category: item.category,
  color: item.color,
  season: item.season || [],
  retailer_image: item.retailerImage,
  user_image: item.userImage,
  brand: item.brand,
  is_wishlist: item.isWishlist || false,
  wear_count: item.wearCount || 0,
  last_worn: item.lastWorn,
  cost: item.cost,
  retail_cost: item.retailCost,
  purchase_date: item.purchaseDate,
  notes: item.notes,
  tags: item.tags || [],
  favorite: item.favorite || false,
  retailer: item.retailer,
  materials: item.materials || null,
});

// ─── Guest-mode AsyncStorage fallback ────────────────────────────────────────

const initializeLocalStorage = async (): Promise<void> => {
  try {
    const initialized = await AsyncStorage.getItem(INITIALIZED_KEY);
    if (!initialized) {
      // Seed the wardrobe with sample data on first launch
      const items = enhancedClothingItems.map(item => ({
        ...item,
        dateAdded: item.dateAdded || new Date().toISOString(),
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));

      // Also seed saved outfits — resolve item IDs to full ClothingItem objects
      const itemsById: Record<string, ClothingItem> = {};
      items.forEach(item => { itemsById[item.id] = item; });

      const seededOutfits = enhancedOutfits
        .map(o => ({
          id: o.id,
          name: o.name,
          items: (o.items as unknown as string[])
            .map(id => itemsById[id])
            .filter(Boolean),
          season: o.season,
          occasion: o.occasion,
          wearCount: (o as any).wearCount ?? 0,
          lastWorn: (o as any).lastWorn,
          favorite: (o as any).favorite ?? false,
          notes: (o as any).notes,
          tags: (o as any).tags || [],
          createdAt: o.dateCreated || new Date().toISOString(),
        }))
        .filter(o => o.items.length >= 2);

      await AsyncStorage.setItem(SAVED_OUTFITS_KEY, JSON.stringify(seededOutfits));
      await AsyncStorage.setItem(INITIALIZED_KEY, 'true');

      // Also seed all other modes (stylist, client, marketplace, messaging)
      await seedAllDemoData();
    }
  } catch (error) {
    console.error('Error initializing local storage:', error);
  }
};

const getLocalItems = async (): Promise<ClothingItem[]> => {
  await initializeLocalStorage();
  const items = await AsyncStorage.getItem(STORAGE_KEY);
  return items ? JSON.parse(items) : [];
};

const saveLocalItem = async (item: ClothingItem): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = [...existingItems, { ...item, id: Date.now().toString() }];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

const updateLocalItem = async (updatedItem: ClothingItem): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = existingItems.map(item =>
    item.id === updatedItem.id ? updatedItem : item
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

const deleteLocalItem = async (id: string): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = existingItems.filter(item => item.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

// ─── Public API ──────────────────────────────────────────────────────────────

export const saveClothingItem = async (item: ClothingItem): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return saveLocalItem(item);

    const { error } = await supabase
      .from('clothing_items')
      .insert(mapClothingItemToDb(item, userId));
    if (error) throw error;
  } catch (error) {
    console.error('Error saving clothing item:', error);
    throw error;
  }
};

/**
 * Page through clothing items for the signed-in user.
 *
 * Defaults to the first 200 items — the wardrobe screen virtualizes scrolling
 * so it doesn't need everything at once. Pass { offset, limit } to fetch more,
 * or { all: true } to walk the full list (slower; used by export/analytics).
 *
 * RLS scopes by auth.uid() server-side; we don't need a .eq('user_id', ...)
 * here, but adding it would make the query plan slightly cheaper if you have
 * a (user_id, created_at) index.
 */
export const getClothingItems = async (
  opts: { offset?: number; limit?: number; all?: boolean } = {},
): Promise<ClothingItem[]> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return getLocalItems();

    if (opts.all) {
      // Walk pages until we hit a partial page, to avoid Supabase's default
      // 1000-row hard cap on a single response.
      const PAGE = 1000;
      const acc: any[] = [];
      let from = 0;
      // Cap at 50k to avoid runaway loops if a user has astronomically many items.
      const MAX = 50_000;
      while (acc.length < MAX) {
        const { data, error } = await supabase
          .from('clothing_items')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        acc.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return acc.map(mapDbToClothingItem);
    }

    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 200;
    const { data, error } = await supabase
      .from('clothing_items')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data || []).map(mapDbToClothingItem);
  } catch (error) {
    console.error('Error getting clothing items:', error);
    return [];
  }
};

export const updateClothingItem = async (updatedItem: ClothingItem): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return updateLocalItem(updatedItem);

    const { error } = await supabase
      .from('clothing_items')
      .update({
        name: updatedItem.name,
        category: updatedItem.category,
        color: updatedItem.color,
        season: updatedItem.season,
        retailer_image: updatedItem.retailerImage,
        user_image: updatedItem.userImage,
        brand: updatedItem.brand,
        is_wishlist: updatedItem.isWishlist,
        wear_count: updatedItem.wearCount,
        last_worn: updatedItem.lastWorn,
        cost: updatedItem.cost,
        retail_cost: updatedItem.retailCost,
        notes: updatedItem.notes,
        tags: updatedItem.tags,
        favorite: updatedItem.favorite,
        retailer: updatedItem.retailer,
        materials: updatedItem.materials || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', updatedItem.id);
    if (error) throw error;
  } catch (error) {
    console.error('Error updating clothing item:', error);
    throw error;
  }
};

export const deleteClothingItem = async (id: string): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return deleteLocalItem(id);

    const { error } = await supabase
      .from('clothing_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting clothing item:', error);
    throw error;
  }
};

export const resetStorage = async (): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      // Clear initialized flag and re-seed everything
      await AsyncStorage.removeItem(INITIALIZED_KEY);
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem(SAVED_OUTFITS_KEY);
      await initializeLocalStorage();
      return;
    }

    const { error } = await supabase
      .from('clothing_items')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  } catch (error) {
    console.error('Error resetting storage:', error);
    throw error;
  }
};
