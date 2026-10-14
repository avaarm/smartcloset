/** Backups count the closet (owned items) apart from the wishlist, and still carry both. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportData, importData, getBackupStats } from '../../src/services/backupService';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));
const mockExportRatings = jest.fn();
jest.mock('../../src/services/ratingService', () => ({ exportMyRatings: (...a: unknown[]) => mockExportRatings(...a) }));

const mockItems = getClothingItems as jest.Mock;
const mockOutfits = getSavedOutfits as jest.Mock;

const item = (id: string, extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name: id,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

// Two owned pieces and three wishlist pieces: a count of everything would read 5.
const MIXED = [
  item('o1'),
  item('w1', { isWishlist: true }),
  item('o2'),
  item('w2', { isWishlist: true }),
  item('w3', { isWishlist: true }),
];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockItems.mockReset().mockResolvedValue(MIXED);
  mockOutfits.mockReset().mockResolvedValue([{ id: 'out1' }]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('exportData', () => {
  it('counts only owned items as items, and the wishlist on its own', async () => {
    const backup = await exportData();
    expect(backup.metadata.totalItems).toBe(2);
    expect(backup.metadata.wishlistCount).toBe(3);
    expect(backup.metadata.totalOutfits).toBe(1);
  });

  it('still carries the wishlist entries in the file, so a restore brings them back', async () => {
    const backup = await exportData();
    expect(backup.items.map(i => i.id)).toEqual(['o1', 'w1', 'o2', 'w2', 'w3']);

    await importData(JSON.parse(JSON.stringify(backup)));
    const restored: ClothingItem[] = JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);
    expect(restored.filter(i => i.isWishlist).map(i => i.id)).toEqual(['w1', 'w2', 'w3']);
    expect(restored.filter(i => !i.isWishlist)).toHaveLength(2);
  });

  it('reads a wishlist-only closet as zero items', async () => {
    mockItems.mockResolvedValue([item('w1', { isWishlist: true })]);
    const backup = await exportData();
    expect(backup.metadata.totalItems).toBe(0);
    expect(backup.metadata.wishlistCount).toBe(1);
  });
});

describe('getBackupStats', () => {
  it('reports owned items only as the item count', async () => {
    expect((await getBackupStats()).itemsCount).toBe(2);
  });

  it('reports zero, not a wishlist count, when the items cannot be read', async () => {
    mockItems.mockRejectedValue(new Error('offline'));
    expect((await getBackupStats()).itemsCount).toBe(0);
  });
});

describe('exportData and ratings', () => {
  const ratings = {
    itemRatings: [{ itemId: 'o1', overall: 4, note: 'Soft, runs a little long', contributed: false }],
    brandRatings: [{ brandLabel: 'Zara', overall: 3 }],
    consents: [{ purpose: 'share_ratings', granted: false, policyVersion: null, decidedAt: null }],
  };

  beforeEach(() => mockExportRatings.mockReset());

  it('carries the member\'s own ratings, notes and consent answers in an optional section, in the 1.1 file', async () => {
    mockExportRatings.mockResolvedValue(ratings);
    const backup = await exportData();
    expect(backup.version).toBe('1.1');
    expect(backup.ratings).toEqual(ratings);
    // The rest of the file is as before.
    expect(backup.metadata.totalItems).toBe(2);
    expect(backup.items).toHaveLength(5);
  });

  it('leaves the section out when the ratings cannot be read, and the export still succeeds', async () => {
    mockExportRatings.mockRejectedValue(new Error('offline'));
    const backup = await exportData();
    expect('ratings' in backup).toBe(false);
    expect(backup.items).toHaveLength(5);
    expect(backup.outfits).toEqual([{ id: 'out1' }]);
  });

  it('restoring a backup that has a ratings section ignores it and still needs only the version, items and outfits', async () => {
    mockExportRatings.mockResolvedValue(ratings);
    const backup = await exportData();
    await importData(JSON.parse(JSON.stringify(backup)));
    expect(JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!)).toHaveLength(5);
    expect(await AsyncStorage.getAllKeys()).toEqual(
      expect.not.arrayContaining(['@smartcloset_ratings']),
    );

    const withoutRatings: Partial<typeof backup> = { ...backup };
    delete withoutRatings.ratings;
    await expect(importData(withoutRatings as typeof backup)).resolves.toBeUndefined();
  });
});
