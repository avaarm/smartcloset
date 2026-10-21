/**
 * An item's gallery (`images`) survives a backup: it is written to the file as it is, restored as it was, and a
 * backup made before the field existed restores fine (the gallery is then built from the cover).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportData, importData } from '../../src/services/backupService';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';
import { itemImages } from '../../src/utils/itemImages';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));
jest.mock('../../src/services/ratingService', () => ({ exportMyRatings: jest.fn(async () => { throw new Error('offline'); }) }));
jest.mock('../../src/services/swapService', () => ({ exportMySwapData: jest.fn(async () => { throw new Error('offline'); }) }));

const mockItems = getClothingItems as jest.Mock;
const mockOutfits = getSavedOutfits as jest.Mock;

const item = (id: string, extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id, name: id, category: 'tops', color: 'black', season: ['fall'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false, ...extra,
});

const GALLERY = ['file:///mock/documents/a.jpg', 'https://shop.example/b.jpg', 'file:///mock/documents/c.jpg'];
const restoredItems = async (): Promise<ClothingItem[]> => JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockOutfits.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('backup and the gallery', () => {
  it('exports the gallery with the item, cover first', async () => {
    mockItems.mockReset().mockResolvedValue([item('a', { userImage: GALLERY[0], retailerImage: GALLERY[0], images: GALLERY })]);
    const backup = await exportData();
    expect(backup.items[0].images).toEqual(GALLERY);
    expect(backup.items[0].userImage).toBe(GALLERY[0]);
  });

  it('survives the file: export, write as JSON, read back, restore', async () => {
    mockItems.mockReset().mockResolvedValue([
      item('a', { userImage: GALLERY[0], retailerImage: GALLERY[0], images: GALLERY }),
      item('w', { isWishlist: true, retailerImage: 'https://shop.example/w1.jpg', images: ['https://shop.example/w1.jpg', 'https://shop.example/w2.jpg'] }),
    ]);
    const backup = await exportData();
    await importData(JSON.parse(JSON.stringify(backup, null, 2)));
    const restored = await restoredItems();
    expect(restored.find(i => i.id === 'a')!.images).toEqual(GALLERY);
    expect(restored.find(i => i.id === 'w')!.images).toEqual(['https://shop.example/w1.jpg', 'https://shop.example/w2.jpg']);
    expect(restored.map(i => itemImages(i))).toEqual([GALLERY, ['https://shop.example/w1.jpg', 'https://shop.example/w2.jpg']]);
  });

  it('restores a backup made before the field existed: no gallery added, the cover still stands in for it', async () => {
    const oldFile = {
      version: '1.1',
      timestamp: '2026-09-01T00:00:00.000Z',
      items: [
        { id: 'old', name: 'Old tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false, userImage: 'file:///mock/documents/o.jpg', retailerImage: 'file:///mock/documents/o.jpg' },
        { id: 'bare', name: 'No photo', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false },
      ],
      outfits: [],
      metadata: { totalItems: 2, totalOutfits: 0, exportDate: '1/9/2026' },
    };
    await expect(importData(oldFile as any)).resolves.toBeUndefined();
    const restored = await restoredItems();
    expect(restored).toEqual(oldFile.items);
    expect(restored.some(i => 'images' in i)).toBe(false);
    expect(itemImages(restored[0])).toEqual(['file:///mock/documents/o.jpg']);
    expect(itemImages(restored[1])).toEqual([]);
  });
});
