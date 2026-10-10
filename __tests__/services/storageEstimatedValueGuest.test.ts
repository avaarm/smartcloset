/**
 * Item values for a guest (on-device store), and that a backup carries them.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getClothingItems, getOwnedClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { exportData, importData } from '../../src/services/backupService';
import { itemValue, totalValue } from '../../src/utils/itemValue';
import type { ClothingItem } from '../../src/types';

const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'x',
  name: 'Tee',
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

const seed = async (items: any[]) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true'); // no demo wardrobe on top
  await AsyncStorage.setItem('@smartcloset_items', JSON.stringify(items));
};
const stored = async (): Promise<ClothingItem[]> => JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!);

describe('guest store: values', () => {
  it('keeps the value and source it was saved with', async () => {
    await seed([]);
    await saveClothingItem(item({ estimatedValue: 85, valueSource: 'user' }));
    expect((await getClothingItems())[0]).toMatchObject({ estimatedValue: 85, valueSource: 'user' });
  });

  it('an item saved before values existed gets an estimate, so totals work without a backfill', async () => {
    await seed([item({ id: 'old', cost: 40 }), item({ id: 'older', category: 'bags', brand: 'Gucci' })]);
    const owned = await getOwnedClothingItems();
    expect(owned.map(itemValue)).toEqual([40, 720]);
    expect(totalValue(owned)).toBe(760);
  });

  it('an edit that sets the value saves it', async () => {
    await seed([item({ id: 'a', cost: 40 })]);
    await updateClothingItem(item({ id: 'a', cost: 40, estimatedValue: 250, valueSource: 'user' }));
    expect((await stored())[0]).toMatchObject({ estimatedValue: 250, valueSource: 'user' });
  });

  it('an edit that does not carry the value leaves the stored one alone', async () => {
    await seed([item({ id: 'a', estimatedValue: 250, valueSource: 'user' })]);
    await updateClothingItem(item({ id: 'a', name: 'Renamed', favorite: true }));
    expect((await stored())[0]).toMatchObject({ name: 'Renamed', estimatedValue: 250, valueSource: 'user' });
  });

  it('the wear tracker leaves the stored value alone', async () => {
    await seed([item({ id: 'a', estimatedValue: 250, valueSource: 'user' })]);
    await updateClothingItem(item({ id: 'a', wearCount: 3 }), { includeWear: true });
    expect((await stored())[0]).toMatchObject({ wearCount: 3, estimatedValue: 250, valueSource: 'user' });
  });

  it('going back to the estimate replaces the typed value', async () => {
    await seed([item({ id: 'a', cost: 40, estimatedValue: 250, valueSource: 'user' })]);
    await updateClothingItem(item({ id: 'a', cost: 40, estimatedValue: 40, valueSource: 'estimate' }));
    expect((await stored())[0]).toMatchObject({ estimatedValue: 40, valueSource: 'estimate' });
  });

  it('a value of 0 is kept', async () => {
    await seed([item({ id: 'a', estimatedValue: 50, valueSource: 'user' })]);
    await updateClothingItem(item({ id: 'a', estimatedValue: 0, valueSource: 'user' }));
    expect((await stored())[0].estimatedValue).toBe(0);
  });
});

describe('backup', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('exports the values and a restore brings them back', async () => {
    await seed([
      item({ id: 'a', estimatedValue: 250, valueSource: 'user' }),
      item({ id: 'b', estimatedValue: 40, valueSource: 'estimate' }),
      item({ id: 'c' }),
    ]);
    const backup = await exportData();
    expect(backup.items.map(i => [i.id, i.estimatedValue, i.valueSource])).toEqual([
      ['a', 250, 'user'],
      ['b', 40, 'estimate'],
      ['c', undefined, undefined],
    ]);

    await seed([]);
    await importData(JSON.parse(JSON.stringify(backup)));
    expect((await getClothingItems()).map(i => [i.id, i.estimatedValue, i.valueSource])).toEqual([
      ['a', 250, 'user'],
      ['b', 40, 'estimate'],
      ['c', undefined, undefined],
    ]);
  });
});
