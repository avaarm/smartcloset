/**
 * A guest's device that saved the old sample wardrobe (photos that did not match the
 * names) gets the corrected samples once; anything the guest added or renamed is left
 * alone, and wear history and favourites carry over.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEGACY_SAMPLES,
  LEGACY_WISHLIST,
  SAMPLE_REFRESH_KEY,
  refreshLegacySampleData,
  refreshSampleItems,
} from '../../src/services/sampleDataRefresh';
import { enhancedClothingItems } from '../../src/data/enhancedSampleData';
import { sampleWishlistItems } from '../../src/services/seedDemoData';
import type { ClothingItem } from '../../src/types';

const KEYS = { items: '@test_items', outfits: '@test_outfits' };

const stored = (over: Partial<ClothingItem> & { id: string; name: string }): ClothingItem => ({
  category: 'outerwear',
  color: 'black',
  season: [],
  dateAdded: '2024-01-01T00:00:00Z',
  isWishlist: false,
  retailerImage: 'https://images.unsplash.com/old.jpg',
  ...over,
});

const byId = (id: string) => enhancedClothingItems.find(i => i.id === id)!;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LEGACY_SAMPLES', () => {
  it('only points at items that exist now, or removes them', () => {
    const ids = new Set(enhancedClothingItems.map(i => i.id));
    for (const [, , replacement] of LEGACY_SAMPLES) {
      if (replacement !== null) expect(ids).toContain(replacement);
    }
  });

  it('names an old sample once', () => {
    const keys = LEGACY_SAMPLES.map(([id, name]) => `${id}|${name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never lists a name that is still in use for that id (that would loop a fresh sample into itself)', () => {
    for (const [id, name] of LEGACY_SAMPLES) {
      expect(enhancedClothingItems.some(i => i.id === id && i.name === name)).toBe(false);
    }
  });

  it('covers every sample wish', () => {
    expect(Object.keys(LEGACY_WISHLIST).sort()).toEqual(sampleWishlistItems().map(w => w.id as string).sort());
  });
});

describe('refreshSampleItems', () => {
  it('replaces an old sample with the corrected one, keeping wear history and the favourite heart', () => {
    const old = stored({ id: '40', name: 'Puffer Jacket' });
    const wool = stored({ id: '17', name: 'Wool Coat' });
    const turtleneck = stored({ id: '2', name: 'Black Turtleneck', wearCount: 15, lastWorn: '2024-11-08', favorite: false });
    const result = refreshSampleItems([old, wool, turtleneck]);

    // the puffer jacket had no photo of a puffer jacket, so it is gone; the wool coat was always right
    expect(result.map(i => i.id)).toEqual(['17', '2']);
    expect(result[0]).toBe(wool);
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: '2',
        name: byId('2').name,
        retailerImage: byId('2').retailerImage,
        wearCount: 15,
        lastWorn: '2024-11-08',
        favorite: false,
      }),
    );
  });

  it('gives the second "28" its own id', () => {
    const scarf = stored({ id: '28', name: 'Silk Scarf' });
    const tee = stored({ id: '28', name: 'Graphic T-Shirt' });
    const result = refreshSampleItems([scarf, tee]);
    expect(result.map(i => i.id)).toEqual(['28', '53']);
    expect(result.map(i => i.name)).toEqual([byId('28').name, byId('53').name]);
  });

  it('leaves alone what the guest added or renamed', () => {
    const mine = stored({ id: 'u1', name: 'My jacket' });
    const renamed = stored({ id: '40', name: 'Puffer Jacket (mine)' });
    const sameNameOtherId = stored({ id: '999', name: 'Puffer Jacket' });
    expect(refreshSampleItems([mine, renamed, sameNameOtherId])).toEqual([mine, renamed, sameNameOtherId]);
  });

  it('replaces the old sample wishes, and not a wish the guest renamed', () => {
    const wish = stored({ id: 'wish_002', name: 'Cream Cashmere Coat', isWishlist: true, favorite: true });
    const renamed = stored({ id: 'wish_003', name: 'My sneakers', isWishlist: true });
    const [fresh, kept] = refreshSampleItems([wish, renamed]);
    const expected = sampleWishlistItems().find(w => w.id === 'wish_002')!;
    expect(fresh).toEqual(expect.objectContaining({ id: 'wish_002', name: expected.name, retailerImage: expected.retailerImage }));
    expect(fresh.isWishlist).toBe(true);
    expect(kept).toBe(renamed);
  });

  it('does nothing to a list with no old samples, and to an empty one', () => {
    const items = enhancedClothingItems.slice(0, 5);
    expect(refreshSampleItems(items)).toEqual(items);
    expect(refreshSampleItems([])).toEqual([]);
  });
});

describe('refreshLegacySampleData', () => {
  it('updates the saved items and the copies inside saved outfits, once', async () => {
    await AsyncStorage.setItem(
      KEYS.items,
      JSON.stringify([stored({ id: '2', name: 'Black Turtleneck' }), stored({ id: 'u1', name: 'Mine' })]),
    );
    await AsyncStorage.setItem(
      KEYS.outfits,
      JSON.stringify([{ id: 'o1', name: 'Look', items: [stored({ id: '2', name: 'Black Turtleneck' }), stored({ id: '43', name: 'Chelsea Boots' })] }]),
    );

    await refreshLegacySampleData(KEYS);

    const items = JSON.parse((await AsyncStorage.getItem(KEYS.items))!);
    expect(items.map((i: ClothingItem) => i.name)).toEqual([byId('2').name, 'Mine']);
    const outfits = JSON.parse((await AsyncStorage.getItem(KEYS.outfits))!);
    expect(outfits[0].items.map((i: ClothingItem) => i.name)).toEqual([byId('2').name]);
    expect(await AsyncStorage.getItem(SAMPLE_REFRESH_KEY)).toBe('true');

    // A second run does not touch anything, even when an old sample is saved again.
    await AsyncStorage.setItem(KEYS.items, JSON.stringify([stored({ id: '2', name: 'Black Turtleneck' })]));
    await refreshLegacySampleData(KEYS);
    expect(JSON.parse((await AsyncStorage.getItem(KEYS.items))!)[0].name).toBe('Black Turtleneck');
  });

  it('is fine when nothing is saved yet', async () => {
    await refreshLegacySampleData(KEYS);
    expect(await AsyncStorage.getItem(KEYS.items)).toBeNull();
    expect(await AsyncStorage.getItem(SAMPLE_REFRESH_KEY)).toBe('true');
  });

  it('leaves the data as it was and tries again next time when it cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(KEYS.items, '{not json');
    await refreshLegacySampleData(KEYS);
    expect(await AsyncStorage.getItem(KEYS.items)).toBe('{not json');
    expect(await AsyncStorage.getItem(SAMPLE_REFRESH_KEY)).toBeNull();
    warn.mockRestore();
  });
});
