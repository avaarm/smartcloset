import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClothingItem } from '../types';
import { enhancedClothingItems, enhancedOutfits } from '../data/enhancedSampleData';
import { supabase } from '../config/supabase';
import { getAuthUserId } from './authUser';
import { canonicalizeImageUrl, withSignedImages } from './imageUrls';
import { seedAllDemoData } from './seedDemoData';
import { rehomeItemImages } from './localImagePaths';
import { removeCloudImages } from './imageStorage';

const STORAGE_KEY = '@smartcloset_items';
const INITIALIZED_KEY = '@smartcloset_initialized_v6';
const SAVED_OUTFITS_KEY = '@smartcloset_saved_outfits';

// ─── Helpers ─────────────────────────────────────────────────────────────────


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
  occasion: row.occasion || undefined,
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
  retailer_image: canonicalizeImageUrl(item.retailerImage),
  user_image: canonicalizeImageUrl(item.userImage),
  brand: item.brand,
  is_wishlist: item.isWishlist || false,
  wear_count: item.wearCount || 0,
  last_worn: item.lastWorn,
  cost: item.cost,
  retail_cost: item.retailCost,
  purchase_date: item.purchaseDate,
  occasion: item.occasion,
  notes: item.notes,
  tags: item.tags || [],
  favorite: item.favorite || false,
  retailer: item.retailer,
  materials: item.materials,
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
  return items ? (JSON.parse(items) as ClothingItem[]).map(rehomeItemImages) : [];
};

const saveLocalItem = async (item: ClothingItem): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = [...existingItems, { ...item, id: Date.now().toString() }];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

const updateLocalItem = async (
  updatedItem: ClothingItem,
  opts: { includeWear?: boolean } = {},
): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = existingItems.map(item => {
    if (item.id !== updatedItem.id) return item;
    // Keep the stored wear data unless the caller is the wear tracker itself.
    return opts.includeWear
      ? updatedItem
      : { ...updatedItem, wearCount: item.wearCount, lastWorn: item.lastWorn };
  });
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

const deleteLocalItem = async (id: string): Promise<void> => {
  const existingItems = await getLocalItems();
  const updatedItems = existingItems.filter(item => item.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
};

// ─── Public API ──────────────────────────────────────────────────────────────

/** True when Postgrest rejected the request because `column` doesn't exist
 * yet on the live table — i.e. a migration (see supabase/migrations/) hasn't
 * been pushed to this Supabase project. PGRST204 on insert/update, PGRST203
 * on some update paths; both carry the column name in the message. */
const isMissingColumnError = (error: any, column: string): boolean =>
  (error?.code === 'PGRST204' || error?.code === 'PGRST203') &&
  typeof error?.message === 'string' &&
  error.message.includes(`'${column}'`);

export const saveClothingItem = async (item: ClothingItem): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return saveLocalItem(item);

    const payload = mapClothingItemToDb(item, userId);
    const { error } = await supabase.from('clothing_items').insert(payload);
    if (error) {
      if (isMissingColumnError(error, 'materials')) {
        // The 003_materials_composition migration hasn't been applied to this
        // project yet. Save without it rather than blocking the whole item.
        console.warn('[storage] clothing_items.materials column missing (migration not applied) — saving without it');
        const { materials, ...fallbackPayload } = payload;
        const { error: fallbackError } = await supabase.from('clothing_items').insert(fallbackPayload);
        if (fallbackError) throw fallbackError;
        return;
      }
      throw error;
    }
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
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        acc.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return withSignedImages(acc.map(mapDbToClothingItem));
    }

    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 200;
    const { data, error } = await supabase
      .from('clothing_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return withSignedImages((data || []).map(mapDbToClothingItem));
  } catch (error) {
    console.error('Error getting clothing items:', error);
    throw error;
  }
};

/** One item by id, freshly read. Null if it no longer exists (deleted elsewhere). */
export const getClothingItem = async (id: string): Promise<ClothingItem | null> => {
  const userId = await getAuthUserId();
  if (!userId) {
    const items = await getLocalItems();
    return items.find(i => i.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from('clothing_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [item] = await withSignedImages([mapDbToClothingItem(data)]);
  return item;
};

/** Everything the user owns: all pages, wishlist items excluded. */
export const getOwnedClothingItems = async (): Promise<ClothingItem[]> =>
  (await getClothingItems({ all: true })).filter(item => !item.isWishlist);

/**
 * Save edits to an existing item.
 *
 * Wear data (wear_count / last_worn) is only written when `includeWear` is set,
 * which only the wear-tracking service does. Edit screens hold a snapshot of the
 * item from when they were opened, so writing its wear fields back would silently
 * undo any wear logged since (e.g. "Mark as worn", then Edit, then Save).
 *
 * Optional fields are sent as null when empty so clearing one in the form
 * actually clears it (undefined would be dropped from the request and leave the
 * old value in place).
 */
export const updateClothingItem = async (
  updatedItem: ClothingItem,
  opts: { includeWear?: boolean } = {},
): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return updateLocalItem(updatedItem, opts);

    const payload: Record<string, any> = {
      name: updatedItem.name,
      category: updatedItem.category,
      color: updatedItem.color,
      season: updatedItem.season,
      retailer_image: canonicalizeImageUrl(updatedItem.retailerImage),
      user_image: canonicalizeImageUrl(updatedItem.userImage),
      brand: updatedItem.brand ?? null,
      is_wishlist: updatedItem.isWishlist,
      cost: updatedItem.cost ?? null,
      retail_cost: updatedItem.retailCost ?? null,
      purchase_date: updatedItem.purchaseDate ?? null,
      occasion: updatedItem.occasion ?? null,
      notes: updatedItem.notes ?? null,
      tags: updatedItem.tags,
      favorite: updatedItem.favorite,
      retailer: updatedItem.retailer ?? null,
      materials: updatedItem.materials ?? null,
      updated_at: new Date().toISOString(),
    };
    if (opts.includeWear) {
      payload.wear_count = updatedItem.wearCount;
      payload.last_worn = updatedItem.lastWorn ?? null;
    }

    // Remember the photos this row used so ones that were replaced can be removed.
    const { data: before } = await supabase
      .from('clothing_items')
      .select('user_image, retailer_image')
      .eq('id', updatedItem.id)
      .eq('user_id', userId)
      .maybeSingle();

    const { error } = await supabase.from('clothing_items').update(payload).eq('id', updatedItem.id);
    if (!error && before) {
      const keep = [payload.user_image, payload.retailer_image];
      await removeCloudImages(
        [before.user_image, before.retailer_image].filter(u => u && !keep.includes(u)),
      );
    }
    if (error) {
      if (isMissingColumnError(error, 'materials')) {
        console.warn('[storage] clothing_items.materials column missing (migration not applied) — updating without it');
        const { materials, ...fallbackPayload } = payload;
        const { error: fallbackError } = await supabase
          .from('clothing_items')
          .update(fallbackPayload)
          .eq('id', updatedItem.id);
        if (fallbackError) throw fallbackError;
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error updating clothing item:', error);
    throw error;
  }
};

export const deleteClothingItem = async (id: string): Promise<void> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return deleteLocalItem(id);

    const { data: row } = await supabase
      .from('clothing_items')
      .select('user_image, retailer_image')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    const { error } = await supabase
      .from('clothing_items')
      .delete()
      .eq('id', id);
    if (error) throw error;

    // The row is gone, so its photos are unreferenced: remove them too.
    if (row) await removeCloudImages([row.user_image, row.retailer_image]);
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
