/**
 * seedDemoData — one-shot seeder that fills the guest's closet with demo data.
 *
 * Called by storage.ts on first launch (guest mode). Seeds:
 *   - Personal wardrobe (enhancedClothingItems, outfits; seeded by storage.ts itself)
 *   - Body profile
 *   - Outfit history
 *   - Wishlist
 *
 * Nothing is seeded for stylists, clients, the marketplace or messaging: those are
 * real accounts on the server, and the old on-device stores are removed by
 * purgeLegacyProData (localData.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveBodyProfile, type BodyProfile } from './profileService';
import type { ClothingItem } from '../types';

// Bump this version string when adding new seeders so existing installs re-seed.
const DEMO_SEEDED_KEY = '@smartcloset_demo_seeded_v4';

/**
 * Seed a body profile so the BodyProfile screen has data and OutfitScreen's
 * smart suggestions work without forcing the user through onboarding.
 */
const seedBodyProfile = async (): Promise<void> => {
  const profile: BodyProfile = {
    skinTone: 'medium',
    undertone: 'warm',
    bodyType: 'hourglass',
    recommendedPalette: [
      '#D4A574', // camel
      '#2C3E50', // navy
      '#8B4513', // saddle brown
      '#F5E6D3', // cream
      '#6B4423', // cocoa
      '#E8B4B8', // dusty rose
      '#4A5759', // slate
      '#C9A66B', // honey gold
    ],
    avoidColors: [
      '#FF00FF', // magenta — clashes with warm undertone
      '#00FFFF', // cyan
      '#CCCCCC', // washed-out gray
    ],
    recommendedFits: {
      tops: ['fitted', 'wrap', 'v-neck', 'belted'],
      bottoms: ['high-waisted', 'straight-leg', 'tailored'],
      dresses: ['wrap', 'fit-and-flare', 'belted sheath'],
    },
    sizeHints: {
      tops: 'M',
      bottoms: '28',
      shoes: '8',
    },
    updatedAt: new Date().toISOString(),
  };

  await saveBodyProfile(profile);
};

/**
 * Seed outfit history — one worn entry every 1–3 days over the last 45 days
 * so the calendar, analytics, and wear-tracking screens all have data.
 */
const seedOutfitHistory = async (): Promise<void> => {
  const OUTFIT_HISTORY_KEY = '@smartcloset_outfit_history';
  // Use outfit IDs from enhancedSampleData.enhancedOutfits
  const outfitIds = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'];
  const occasions = [
    'work', 'brunch', 'errands', 'client meeting', 'dinner', 'coffee',
    'workout', 'date night', 'travel', 'weekend', 'family event',
    'presentation', 'casual day', 'networking', 'shopping',
  ];
  const notes = [
    'Felt great!',
    'Got compliments',
    'Comfortable all day',
    'Need to iron next time',
    'Perfect for the weather',
    undefined,
    undefined,
    'A bit warm',
    'Loved this combo',
    'Will wear again',
    undefined,
  ];

  const entries: any[] = [];
  const now = Date.now();
  const oneDay = 86400000;

  // Generate ~30 entries over the last 45 days, cycling through outfits.
  let daysBack = 1;
  let i = 0;
  while (daysBack <= 45 && entries.length < 30) {
    const gap = 1 + (i % 3); // 1–3 day spacing
    daysBack += gap;
    if (daysBack > 45) break;

    const outfitId = outfitIds[i % outfitIds.length];
    // Rate biased toward 4–5 (people tend to rate outfits they chose to wear)
    const rating = [5, 4, 5, 3, 4, 5, 4, 5, 4, 5][i % 10];
    entries.push({
      id: `h_seed_${i}_${Date.now()}`,
      outfitId,
      dateWorn: new Date(now - daysBack * oneDay).toISOString(),
      occasion: occasions[i % occasions.length],
      rating,
      notes: notes[i % notes.length],
    });
    i++;
  }

  await AsyncStorage.setItem(OUTFIT_HISTORY_KEY, JSON.stringify(entries));
};

/**
 * The sample wishlist. Every photo shows what its name says, and the two prices are what the
 * piece costs new and what it costs used (resale).
 */
export const sampleWishlistItems = (): Partial<ClothingItem>[] => [
    {
      id: 'wish_001',
      name: 'Red Top-Handle Bag',
      category: 'bags',
      retailerImage: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500',
      color: 'red',
      season: ['fall' as any, 'winter' as any],
      brand: 'Salvatore Ferragamo',
      retailer: 'Farfetch',
      dateAdded: new Date().toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 2800,
      cost: 1680,
      tags: ['evening', 'luxury', 'leather'],
      favorite: true,
      notes: 'Dream bag — save for it',
    },
    {
      id: 'wish_002',
      name: 'Powder Blue Wool Coat',
      category: 'outerwear' as any,
      retailerImage: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=500',
      color: 'light blue',
      season: ['fall' as any, 'winter' as any],
      brand: 'Max Mara',
      retailer: 'Max Mara',
      dateAdded: new Date(Date.now() - 3 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 2390,
      cost: 1435,
      tags: ['luxury', 'timeless', 'investment'],
      favorite: true,
    },
    {
      id: 'wish_003',
      name: 'Red Flyknit Sneakers',
      category: 'shoes' as any,
      retailerImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
      color: 'red',
      season: ['spring' as any, 'summer' as any, 'fall' as any],
      brand: 'Nike',
      retailer: 'Nike',
      dateAdded: new Date(Date.now() - 7 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 160,
      cost: 95,
      tags: ['sporty', 'statement'],
      favorite: false,
    },
    {
      id: 'wish_004',
      name: 'Red Satin Gown',
      category: 'dresses' as any,
      retailerImage: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500',
      color: 'red',
      season: ['summer' as any, 'spring' as any],
      brand: 'Reformation',
      retailer: 'Reformation',
      dateAdded: new Date(Date.now() - 14 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 348,
      cost: 210,
      tags: ['evening', 'gown', 'satin'],
      favorite: true,
    },
    {
      id: 'wish_005',
      name: 'Blue Plaid Blazer',
      category: 'outerwear' as any,
      retailerImage: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500',
      color: 'blue',
      season: ['fall' as any, 'winter' as any],
      brand: 'Hugo Boss',
      retailer: 'Hugo Boss',
      dateAdded: new Date(Date.now() - 21 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 540,
      cost: 325,
      tags: ['work', 'elevated', 'tailored'],
      favorite: false,
    },
    {
      id: 'wish_006',
      name: 'Crystal Drop Earrings',
      category: 'jewelry',
      retailerImage: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=500',
      color: 'silver',
      season: ['spring' as any, 'summer' as any, 'fall' as any, 'winter' as any],
      brand: 'BaubleBar',
      retailer: 'BaubleBar',
      dateAdded: new Date(Date.now() - 30 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      retailCost: 68,
      cost: 40,
      tags: ['evening', 'jewelry', 'statement'],
      favorite: false,
    },
  ];

/**
 * Seed wishlist items — appends a few aspirational pieces (isWishlist=true)
 * to the existing wardrobe so the Wishlist tab has content on first launch.
 */
const seedWishlistItems = async (): Promise<void> => {
  const ITEMS_KEY = '@smartcloset_items';
  const existingRaw = await AsyncStorage.getItem(ITEMS_KEY);
  const existing: ClothingItem[] = existingRaw ? JSON.parse(existingRaw) : [];

  // Skip if a wishlist item is already present (idempotent).
  if (existing.some(it => it.isWishlist)) return;

  const wishlistItems = sampleWishlistItems();

  const merged = [...existing, ...wishlistItems];
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(merged));
};

/**
 * Main entry — call once on first launch. Idempotent via DEMO_SEEDED_KEY.
 */
export const seedAllDemoData = async (): Promise<void> => {
  try {
    const already = await AsyncStorage.getItem(DEMO_SEEDED_KEY);
    if (already) return; // Already seeded

    console.log('[seedDemoData] Seeding all demo data...');

    await seedBodyProfile();
    await seedOutfitHistory();
    await seedWishlistItems();

    await AsyncStorage.setItem(DEMO_SEEDED_KEY, 'true');
    console.log('[seedDemoData] All demo data seeded successfully');
  } catch (error) {
    console.error('[seedDemoData] Error seeding demo data:', error);
  }
};

/**
 * Force re-seed — clears the flag and re-runs.
 */
export const reseedAllDemoData = async (): Promise<void> => {
  await AsyncStorage.removeItem(DEMO_SEEDED_KEY);
  await seedAllDemoData();
};
