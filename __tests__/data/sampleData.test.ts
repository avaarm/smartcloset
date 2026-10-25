/**
 * The sample wardrobe, wishlist and outfits a guest starts with. They are the first
 * thing an App Store reviewer or a new user sees, so every photo has to show what the
 * item's name says: no photo shared by two items, no item whose category contradicts
 * its own name, and no outfit that names an item that is not there.
 *
 * It also pins what the first-launch seed writes: the closet, body profile, outfit history
 * and wishlist, and nothing for the retired stylist, client, marketplace or messaging stores.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enhancedClothingItems, enhancedOutfits } from '../../src/data/enhancedSampleData';
import { RETIRED_PRO_KEYS } from '../../src/services/localData';
import { reseedAllDemoData, sampleWishlistItems, seedAllDemoData } from '../../src/services/seedDemoData';
import { getClothingItems } from '../../src/services/storage';
import { categoryFromText } from '../../src/utils/clothingCategories';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

const wardrobe = enhancedClothingItems;
const wishlist = sampleWishlistItems();
const everything = [...wardrobe, ...(wishlist as typeof wardrobe)];

describe('sample items', () => {
  it('have an id of their own', () => {
    const ids = wardrobe.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const wishIds = wishlist.map(i => i.id);
    expect(new Set(wishIds).size).toBe(wishIds.length);
  });

  it('have a photo of their own: no two items share one', () => {
    const photos = everything.map(i => i.retailerImage);
    expect(photos.every(p => typeof p === 'string' && p.startsWith('https://'))).toBe(true);
    const shared = photos.filter((p, i) => photos.indexOf(p) !== i);
    expect(shared).toEqual([]);
  });

  it('have a name of their own', () => {
    const names = everything.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('are in a real category that agrees with what their name calls them', () => {
    for (const item of everything) {
      expect(CLOTHING_CATEGORIES).toContain(item.category);
      const named = categoryFromText(item.name);
      if (named) expect([item.name, item.category]).toEqual([item.name, named]);
    }
  });

  it('have a colour, a brand and a season', () => {
    for (const item of everything) {
      expect(item.color).toBeTruthy();
      expect(item.brand).toBeTruthy();
      expect((item.season ?? []).length).toBeGreaterThan(0);
    }
  });

  it('are wardrobe pieces or wishes, not both', () => {
    expect(wardrobe.every(i => i.isWishlist === false)).toBe(true);
    expect(wishlist.every(i => i.isWishlist === true)).toBe(true);
  });

  it('cover the kinds of thing a wardrobe holds', () => {
    const categories = new Set(everything.map(i => i.category));
    for (const c of ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'jewelry', 'hats', 'accessories']) {
      expect(categories).toContain(c);
    }
  });
});

describe('sample wishlist prices', () => {
  it('give every wish a new price and a lower used price', () => {
    for (const wish of wishlist) {
      expect(wish.retailCost).toBeGreaterThan(0);
      expect(wish.cost).toBeGreaterThan(0);
      expect(wish.cost!).toBeLessThan(wish.retailCost!);
    }
  });
});

describe('sample outfits', () => {
  const ids = new Set(wardrobe.map(i => i.id));

  it('only name items that exist', () => {
    for (const outfit of enhancedOutfits) {
      for (const id of outfit.items) expect(ids).toContain(id);
    }
  });

  it('keep at least two pieces each, so every one is still seeded', () => {
    for (const outfit of enhancedOutfits) expect(outfit.items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the guest demo seed', () => {
  const keys = async () => (await AsyncStorage.getAllKeys()).slice().sort();
  const retiredPresent = async () => (await keys()).filter(k => RETIRED_PRO_KEYS.includes(k));

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('seeds the body profile, the outfit history and the wishlist, once', async () => {
    await seedAllDemoData();

    expect(await keys()).toEqual([
      '@smartcloset_body_profile',
      '@smartcloset_demo_seeded_v4',
      '@smartcloset_items',
      '@smartcloset_outfit_history',
    ]);
    const items = JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);
    expect(items.map((i: { id: string }) => i.id)).toEqual(wishlist.map(w => w.id));
    expect(JSON.parse((await AsyncStorage.getItem('@smartcloset_outfit_history'))!).length).toBeGreaterThan(0);

    // The flag stops a second run: nothing is written again.
    await AsyncStorage.removeItem('@smartcloset_outfit_history');
    await seedAllDemoData();
    expect(await AsyncStorage.getItem('@smartcloset_outfit_history')).toBeNull();
  });

  it('writes nothing for stylists, clients, the marketplace, messaging or the simulated account', async () => {
    await seedAllDemoData();
    expect(await retiredPresent()).toEqual([]);

    await reseedAllDemoData();
    expect(await retiredPresent()).toEqual([]);
    const items = JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);
    expect(items).toHaveLength(wishlist.length); // the re-seed does not add the wishlist twice
  });

  it('writes none of them on a guest first launch through the closet either', async () => {
    const items = await getClothingItems();

    expect(items.length).toBeGreaterThan(enhancedClothingItems.length); // the wardrobe and the wishlist
    expect(await AsyncStorage.getItem('@smartcloset_demo_seeded_v4')).toBe('true');
    expect(await retiredPresent()).toEqual([]);
  });

  it('does not import or call the stylist, marketplace, messaging or account services', () => {
    // seedDemoData used to pull the account service in for loadSampleAccountData; the
    // account service is being cut down, and nothing may still need what it loses.
    for (const file of ['seedDemoData.ts', 'sampleDataRefresh.ts', 'storage.ts']) {
      const text = fs.readFileSync(path.join(__dirname, '../../src/services', file), 'utf8');
      expect(text).not.toMatch(/loadSample(Account|Stylist|Marketplace|Messaging)Data/);
      expect(text).not.toMatch(/from '\.\/(accountService|stylistService|marketplaceService|messagingService)'/);
    }
  });
});
