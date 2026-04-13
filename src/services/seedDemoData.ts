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

const DEMO_SEEDED_KEY = '@smartcloset_demo_seeded_v3';

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
