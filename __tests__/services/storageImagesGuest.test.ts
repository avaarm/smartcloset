/**
 * A guest's items live on the device: the gallery is stored with the item, read back with its paths re-anchored
 * to the current Documents folder, and an edit replaces it.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

// jest.setup.js mocks react-native-fs with DocumentDirectoryPath = /mock/documents
const NOW = 'file:///mock/documents';
const OLD = 'file:///var/mobile/Containers/Data/Application/OLD/Documents';

const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'x', name: 'Tee', category: 'tops', color: 'black', season: ['fall'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false, ...extra,
});
const seed = async (items: any[]) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true'); // no demo wardrobe on top
  await AsyncStorage.setItem('@smartcloset_items', JSON.stringify(items));
};
const stored = async (): Promise<ClothingItem[]> => JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);

describe('guest store: photos', () => {
  it('keeps the gallery it was saved with', async () => {
    await seed([]);
    await saveClothingItem(item({ userImage: `${NOW}/a.jpg`, images: [`${NOW}/a.jpg`, `${NOW}/b.jpg`] }));
    expect((await getClothingItems())[0].images).toEqual([`${NOW}/a.jpg`, `${NOW}/b.jpg`]);
  });

  it('reads the gallery back from the folder the app lives in now, after the container moved', async () => {
    await seed([item({ userImage: `${OLD}/a.jpg`, retailerImage: `${OLD}/a.jpg`, images: [`${OLD}/a.jpg`, `${OLD}/b.jpg`, 'https://shop.example/c.jpg'] })]);
    const [got] = await getClothingItems();
    expect(got.userImage).toBe(`${NOW}/a.jpg`);
    expect(got.images).toEqual([`${NOW}/a.jpg`, `${NOW}/b.jpg`, 'https://shop.example/c.jpg']);
  });

  it('an edit replaces the gallery', async () => {
    await seed([item({ userImage: `${NOW}/a.jpg`, images: [`${NOW}/a.jpg`, `${NOW}/b.jpg`] })]);
    await updateClothingItem(item({ userImage: `${NOW}/b.jpg`, retailerImage: `${NOW}/b.jpg`, images: [`${NOW}/b.jpg`] }));
    expect((await stored())[0].images).toEqual([`${NOW}/b.jpg`]);
  });

  it('an item saved before galleries existed reads back with none', async () => {
    await seed([item({ userImage: `${NOW}/a.jpg` })]);
    expect((await getClothingItems())[0].images).toBeUndefined();
  });
});
