/**
 * seedDemoData — one-shot seeder that fills every mode with demo data.
 *
 * Called by storage.ts on first launch (guest mode). Seeds:
 *   - Personal wardrobe (enhancedClothingItems, outfits)
 *   - Stylist mode (profile, clients, appointments, recommendations)
 *   - Client mode (client account linked to a stylist, relationships)
 *   - Marketplace (stylist listings, reviews)
 *   - Messaging (threads, sample messages)
 *   - Account data (available modes)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSampleStylistData } from './stylistService';
import { loadSampleMarketplaceData, setCurrentClientAccount } from './marketplaceService';
import { loadSampleMessagingData } from './messagingService';
import { loadSampleAccountData } from './accountService';
import { saveBodyProfile, type BodyProfile } from './profileService';
import type { ClothingItem } from '../types';

// Bump this version string when adding new seeders so existing installs re-seed.
const DEMO_SEEDED_KEY = '@smartcloset_demo_seeded_v4';

/**
 * Seed a client account so the "Client" tab has data.
 * Links to stylist_sample_001 (Emma Rodriguez) from the stylist seeder.
 */
const seedClientAccount = async () => {
  const CLIENT_ACCOUNTS_KEY = '@smartcloset_client_accounts';
  const clientAccount = {
    id: 'client_sample_001',
    accountType: 'client' as const,
    userId: 'user_sample_001',
    name: 'Alex Morgan',
    email: 'alex@smartcloset.app',
    phone: '(310) 555-0199',
    profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
    currentStylistId: 'stylist_sample_001',
    stylistHistory: ['stylist_sample_001'],
    preferences: {
      style: ['Modern Minimal', 'Smart Casual', 'Scandinavian'],
      colors: ['Navy', 'White', 'Camel', 'Black', 'Olive'],
      budget: { min: 100, max: 500 },
      sizes: {
        tops: 'M',
        bottoms: '30',
        shoes: '10',
        dresses: 'M',
      },
      bodyType: 'Athletic',
      lifestyle: 'Professional, active weekends, occasional travel',
    },
    goals: [
      'Build a capsule wardrobe for work',
      'Find versatile pieces for travel',
      'Develop a more polished weekend style',
    ],
    joinedDate: new Date(Date.now() - 90 * 86400000).toISOString(),
    isActive: true,
  };

  await AsyncStorage.setItem(
    CLIENT_ACCOUNTS_KEY,
    JSON.stringify([clientAccount]),
  );
  // Also set as current client so ClientDashboard loads immediately
  await setCurrentClientAccount(clientAccount as any);
};

/**
 * Seed stylist recommendations so Recommendations tab has data.
 */
const seedRecommendations = async () => {
  const RECOMMENDATIONS_KEY = '@smartcloset_stylist_recommendations';
  const recs = [
    {
      id: 'rec_001',
      stylistId: 'stylist_sample_001',
      clientId: 'client_001',
      clientName: 'Sarah Johnson',
      category: 'wardrobe-tip' as const,
      title: 'Spring Capsule Refresh',
      description:
        'Replace heavy winter layers with breathable linen and cotton pieces. Focus on light neutrals: cream, sand, soft blue.',
      items: [
        {
          name: 'Linen Button-Down (White)',
          brand: 'COS',
          price: 89,
          category: 'tops',
          imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400',
          notes: 'Great for layering with blazers or alone with rolled sleeves',
        },
        {
          name: 'Wide-Leg Chinos (Sand)',
          brand: 'Everlane',
          price: 78,
          category: 'bottoms',
          imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400',
          notes: 'Pair with both sneakers and loafers',
        },
      ],
      status: 'sent' as const,
      priority: 'high' as const,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 'rec_002',
      stylistId: 'stylist_sample_001',
      clientId: 'client_002',
      clientName: 'Michael Chen',
      category: 'outfit' as const,
      title: 'Business Travel Wardrobe',
      description:
        'Wrinkle-resistant pieces that transition from meetings to dinners. All items fit a carry-on.',
      items: [
        {
          name: 'Performance Blazer (Navy)',
          brand: 'Ministry of Supply',
          price: 295,
          category: 'outerwear',
          imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73b4177ae68?w=400',
          notes: 'Machine washable, packs flat',
        },
        {
          name: 'Merino Polo (Charcoal)',
          brand: 'Wool&Prince',
          price: 128,
          category: 'tops',
          imageUrl: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400',
          notes: 'Odor-resistant, works for 3+ wears',
        },
      ],
      status: 'viewed' as const,
      priority: 'medium' as const,
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: 'rec_003',
      stylistId: 'stylist_sample_001',
      clientId: 'client_003',
      clientName: 'Jessica Martinez',
      category: 'purchase' as const,
      title: 'Weekend Elevated Basics',
      description:
        'Upgrade everyday pieces — same comfort level, more polished look. Focus on fit and fabric quality.',
      items: [
        {
          name: 'Cashmere Crewneck (Oatmeal)',
          brand: 'Naadam',
          price: 125,
          category: 'tops',
          imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400',
          notes: 'Layer over white tee for effortless look',
        },
      ],
      status: 'implemented' as const,
      priority: 'low' as const,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: 'rec_004',
      stylistId: 'stylist_sample_001',
      clientId: 'client_sample_001',
      clientName: 'Alex Morgan',
      category: 'style-guide' as const,
      title: 'Office to Evening Transition',
      description:
        'Key pieces that take you from 9-5 to dinner plans without a full outfit change. Swap accessories, not clothes.',
      items: [
        {
          name: 'Silk Shell Top (Ivory)',
          brand: 'Vince',
          price: 195,
          category: 'tops',
          imageUrl: 'https://images.unsplash.com/photo-1564257577802-5c0c7e0b7b99?w=400',
          notes: 'Works under a blazer by day, with statement earrings by night',
        },
        {
          name: 'Tailored Ankle Pants (Black)',
          brand: 'Theory',
          price: 265,
          category: 'bottoms',
          imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400',
          notes: 'Cropped length shows off shoes — switch loafers to heels for evening',
        },
      ],
      status: 'sent' as const,
      priority: 'high' as const,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ];

  await AsyncStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recs));
};

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
 * Seed wishlist items — appends a few aspirational pieces (isWishlist=true)
 * to the existing wardrobe so the Wishlist tab has content on first launch.
 */
const seedWishlistItems = async (): Promise<void> => {
  const ITEMS_KEY = '@smartcloset_items';
  const existingRaw = await AsyncStorage.getItem(ITEMS_KEY);
  const existing: ClothingItem[] = existingRaw ? JSON.parse(existingRaw) : [];

  // Skip if a wishlist item is already present (idempotent).
  if (existing.some(it => it.isWishlist)) return;

  const wishlistItems: Partial<ClothingItem>[] = [
    {
      id: 'wish_001',
      name: 'Burgundy Leather Clutch',
      category: 'accessories' as any,
      retailerImage: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500',
      color: 'burgundy',
      season: ['fall' as any, 'winter' as any],
      brand: 'Bottega Veneta',
      retailer: 'Net-a-Porter',
      dateAdded: new Date().toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 2800,
      tags: ['evening', 'luxury', 'leather'],
      favorite: true,
      notes: 'Dream bag — save for it',
    },
    {
      id: 'wish_002',
      name: 'Cream Cashmere Coat',
      category: 'outerwear' as any,
      retailerImage: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=500',
      color: 'cream',
      season: ['fall' as any, 'winter' as any],
      brand: 'Max Mara',
      retailer: 'Max Mara',
      dateAdded: new Date(Date.now() - 3 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 2390,
      tags: ['luxury', 'timeless', 'investment'],
      favorite: true,
    },
    {
      id: 'wish_003',
      name: 'White Leather Sneakers',
      category: 'shoes' as any,
      retailerImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
      color: 'white',
      season: ['spring' as any, 'summer' as any, 'fall' as any],
      brand: 'Common Projects',
      retailer: 'SSENSE',
      dateAdded: new Date(Date.now() - 7 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 425,
      tags: ['minimalist', 'versatile'],
      favorite: false,
    },
    {
      id: 'wish_004',
      name: 'Silk Slip Dress',
      category: 'dresses' as any,
      retailerImage: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500',
      color: 'champagne',
      season: ['summer' as any, 'spring' as any],
      brand: 'Reformation',
      retailer: 'Reformation',
      dateAdded: new Date(Date.now() - 14 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 248,
      tags: ['evening', 'date', 'silk'],
      favorite: true,
    },
    {
      id: 'wish_005',
      name: 'Wide-Leg Wool Trousers',
      category: 'bottoms' as any,
      retailerImage: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500',
      color: 'charcoal',
      season: ['fall' as any, 'winter' as any],
      brand: 'Toteme',
      retailer: 'MyTheresa',
      dateAdded: new Date(Date.now() - 21 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 540,
      tags: ['work', 'elevated', 'tailored'],
      favorite: false,
    },
    {
      id: 'wish_006',
      name: 'Gold Hoop Earrings',
      category: 'accessories' as any,
      retailerImage: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=500',
      color: 'gold',
      season: ['spring' as any, 'summer' as any, 'fall' as any, 'winter' as any],
      brand: 'Mejuri',
      retailer: 'Mejuri',
      dateAdded: new Date(Date.now() - 30 * 86400000).toISOString(),
      isWishlist: true,
      wearCount: 0,
      cost: 148,
      tags: ['everyday', 'jewelry'],
      favorite: false,
    },
  ];

  const merged = [...existing, ...wishlistItems];
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(merged));
};

/**
 * Seed booking requests — incoming requests from (prospective) clients to the
 * stylist account. Mix of statuses so the stylist dashboard shows real counts.
 */
const seedBookingRequests = async (): Promise<void> => {
  const BOOKING_REQUESTS_KEY = '@smartcloset_booking_requests';
  const existing = await AsyncStorage.getItem(BOOKING_REQUESTS_KEY);
  if (existing && JSON.parse(existing).length > 0) return; // Idempotent

  const requests = [
    {
      id: 'booking_seed_001',
      stylistId: 'stylist_sample_001',
      clientId: 'client_prospect_001',
      clientName: 'Priya Patel',
      clientEmail: 'priya.patel@example.com',
      clientPhone: '(415) 555-0134',
      requestedService: 'Virtual Consultation',
      preferredDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      preferredTime: '14:00',
      message:
        "Hi Emma! I'm starting a new role and want to rebuild my work wardrobe. Loved your portfolio — hoping you can help.",
      status: 'pending' as const,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 'booking_seed_002',
      stylistId: 'stylist_sample_001',
      clientId: 'client_prospect_002',
      clientName: 'Marcus Williams',
      clientEmail: 'marcus.w@example.com',
      requestedService: 'Wardrobe Audit',
      preferredDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      preferredTime: '10:00',
      message:
        'Moving from casual tech role to finance — need a full refresh. Budget is flexible for investment pieces.',
      status: 'accepted' as const,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      respondedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: 'booking_seed_003',
      stylistId: 'stylist_sample_001',
      clientId: 'client_sample_001',
      clientName: 'Alex Morgan',
      clientEmail: 'alex@smartcloset.app',
      clientPhone: '(310) 555-0199',
      requestedService: 'Seasonal Capsule Package',
      preferredDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      preferredTime: '16:00',
      message: "Ready for the spring package we discussed. Same day/time as last time if possible.",
      status: 'pending' as const,
      createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    },
    {
      id: 'booking_seed_004',
      stylistId: 'stylist_sample_001',
      clientId: 'client_prospect_003',
      clientName: 'Jordan Lee',
      clientEmail: 'jordan.lee@example.com',
      requestedService: 'Single Outfit Styling',
      preferredDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      preferredTime: '11:00',
      message: 'Need an outfit for a wedding. One-time session.',
      status: 'declined' as const,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      respondedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
  ];

  await AsyncStorage.setItem(BOOKING_REQUESTS_KEY, JSON.stringify(requests));
};

/**
 * Main entry — call once on first launch. Idempotent via DEMO_SEEDED_KEY.
 */
export const seedAllDemoData = async (): Promise<void> => {
  try {
    const already = await AsyncStorage.getItem(DEMO_SEEDED_KEY);
    if (already) return; // Already seeded

    console.log('[seedDemoData] Seeding all demo data...');

    // Run all seeders (order matters: account first, then services)
    await loadSampleAccountData();
    await loadSampleStylistData();
    await loadSampleMarketplaceData();
    await loadSampleMessagingData();
    await seedClientAccount();
    await seedRecommendations();
    await seedBodyProfile();
    await seedOutfitHistory();
    await seedWishlistItems();
    await seedBookingRequests();

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
