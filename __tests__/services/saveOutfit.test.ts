jest.mock('../../src/config/supabase', () => ({ supabase: {} }));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: jest.fn(async () => null) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSavedOutfits, saveOutfit } from '../../src/services/outfitService';

const item = (id: string): any => ({ id, name: id, category: 'tops', color: 'red', season: [], dateAdded: '', isWishlist: false });
const outfit = (name: string, ids: string[]): any => ({ id: name, name, items: ids.map(item), season: [], createdAt: '2026-01-01' });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('saveOutfit', () => {
  it('saves a new outfit', async () => {
    await saveOutfit(outfit('A', ['1', '2']));
    expect((await getSavedOutfits()).map(o => o.name)).toEqual(['A']);
  });

  it('ignores a second save of the same pieces, in any order', async () => {
    await saveOutfit(outfit('A', ['1', '2']));
    await saveOutfit(outfit('A again', ['2', '1']));
    expect((await getSavedOutfits()).map(o => o.name)).toEqual(['A']);
  });

  it('saves a different combination, including one that only overlaps', async () => {
    await saveOutfit(outfit('A', ['1', '2']));
    await saveOutfit(outfit('B', ['1', '3']));
    await saveOutfit(outfit('C', ['1', '2', '3']));
    expect((await getSavedOutfits()).map(o => o.name)).toEqual(['A', 'B', 'C']);
  });
});
