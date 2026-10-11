/**
 * The sample wardrobe a guest starts with used to show photos that did not match
 * their names (a "Puffer Jacket" with a photo of a camel wrap coat, three kinds of
 * boots sharing one photo of heels). The data now matches, but a device that already
 * saved the old samples keeps them, so this brings those up to date once.
 *
 * Only a sample the guest has not renamed is touched (it is found by its id AND its
 * old name), so anything they added or edited stays as it is. Wear history and the
 * favourite heart carry over. Samples that had no photo that matched are removed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClothingItem } from '../types';
import { enhancedClothingItems } from '../data/enhancedSampleData';
import { sampleWishlistItems } from './seedDemoData';

export const SAMPLE_REFRESH_KEY = '@smartcloset_sample_photos_fix_v1';

/** [id, name it used to have, id of what replaces it, or null when it is removed]. */
export const LEGACY_SAMPLES: ReadonlyArray<readonly [string, string, string | null]> = [
  ['2', 'Black Turtleneck', '2'],
  ['12', 'Little Black Dress', '12'],
  ['21', 'White Leather Sneakers', '21'],
  ['26', 'Leather Tote Bag', '26'],
  ['3', 'Striped Breton Top', '3'],
  ['4', 'Silk Blouse', '4'],
  ['8', 'Black Skinny Jeans', '8'],
  ['9', 'Pleated Midi Skirt', '9'],
  ['10', 'Wide Leg Trousers', '10'],
  ['13', 'Floral Maxi Dress', '13'],
  ['14', 'Wrap Dress', null],
  ['22', 'Black Ankle Boots', '22'],
  ['24', 'Loafers', '24'],
  ['27', 'Gold Hoop Earrings', '27'],
  ['28', 'Silk Scarf', '28'],
  ['28', 'Graphic T-Shirt', '53'],
  ['30', 'Cashmere Cardigan', '30'],
  ['31', 'Linen Button-Down', null],
  ['32', 'Cropped Sweater', '32'],
  ['33', 'Cargo Pants', '33'],
  ['34', 'Leather Leggings', '34'],
  ['35', 'Corduroy Pants', '35'],
  ['36', 'Denim Mini Skirt', null],
  ['37', 'Satin Slip Dress', null],
  ['38', 'Midi Shirt Dress', null],
  ['39', 'Blazer Dress', '39'],
  ['40', 'Puffer Jacket', null],
  ['41', 'Trench Coat', null],
  ['42', 'Bomber Jacket', null],
  ['43', 'Chelsea Boots', null],
  ['44', 'Ballet Flats', '44'],
  ['45', 'Running Sneakers', null],
  ['46', 'Strappy Sandals', null],
  ['47', 'Crossbody Bag', '47'],
  ['48', 'Sunglasses', null],
  ['49', 'Leather Belt', null],
  ['50', 'Wool Beanie', '50'],
];

/** The sample wishlist as it used to be named, by id. */
export const LEGACY_WISHLIST: Readonly<Record<string, string>> = {
  wish_001: 'Burgundy Leather Clutch',
  wish_002: 'Cream Cashmere Coat',
  wish_003: 'White Leather Sneakers',
  wish_004: 'Silk Slip Dress',
  wish_005: 'Wide-Leg Wool Trousers',
  wish_006: 'Gold Hoop Earrings',
};

/** The current definition of `item` when it is an old, unedited sample: the new item, or null to remove it. Undefined when it is not one. */
const replacementFor = (item: Pick<ClothingItem, 'id' | 'name' | 'isWishlist'>): ClothingItem | null | undefined => {
  if (item.isWishlist) {
    if (LEGACY_WISHLIST[item.id] !== item.name) return undefined;
    return (sampleWishlistItems().find(w => w.id === item.id) as ClothingItem | undefined) ?? undefined;
  }
  const legacy = LEGACY_SAMPLES.find(([id, name]) => id === item.id && name === item.name);
  if (!legacy) return undefined;
  const newId = legacy[2];
  if (newId === null) return null;
  return enhancedClothingItems.find(i => i.id === newId) ?? undefined;
};

/** `stored` brought up to date: the new definition with the guest's own wear history and favourite kept. */
const updated = (stored: ClothingItem, fresh: ClothingItem): ClothingItem => ({
  ...fresh,
  wearCount: stored.wearCount ?? fresh.wearCount,
  lastWorn: stored.lastWorn ?? fresh.lastWorn,
  favorite: stored.favorite ?? fresh.favorite,
});

/** The items with every old, unedited sample replaced (or removed); anything else is returned as it is. */
export const refreshSampleItems = (items: ClothingItem[]): ClothingItem[] => {
  const out: ClothingItem[] = [];
  for (const item of items) {
    const fresh = replacementFor(item);
    if (fresh === undefined) out.push(item);
    else if (fresh !== null) out.push(updated(item, fresh));
  }
  return out;
};

/**
 * Brings the saved items and the saved outfits (which hold copies of their items) up to date,
 * once per device. A failure leaves the data as it was and tries again next time.
 */
export const refreshLegacySampleData = async (
  keys: { items: string; outfits: string },
): Promise<void> => {
  try {
    if (await AsyncStorage.getItem(SAMPLE_REFRESH_KEY)) return;

    const rawItems = await AsyncStorage.getItem(keys.items);
    if (rawItems) {
      const items: ClothingItem[] = JSON.parse(rawItems);
      if (Array.isArray(items)) {
        await AsyncStorage.setItem(keys.items, JSON.stringify(refreshSampleItems(items)));
      }
    }

    const rawOutfits = await AsyncStorage.getItem(keys.outfits);
    if (rawOutfits) {
      const outfits: Array<{ items?: ClothingItem[] }> = JSON.parse(rawOutfits);
      if (Array.isArray(outfits)) {
        const refreshed = outfits.map(outfit =>
          Array.isArray(outfit.items) ? { ...outfit, items: refreshSampleItems(outfit.items) } : outfit,
        );
        await AsyncStorage.setItem(keys.outfits, JSON.stringify(refreshed));
      }
    }

    await AsyncStorage.setItem(SAMPLE_REFRESH_KEY, 'true');
  } catch (error) {
    console.warn('[sampleDataRefresh] could not update the sample items:', error);
  }
};
