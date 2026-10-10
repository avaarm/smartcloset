/** Wear tracking only ever touches clothes the user owns (guest store). */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { WearTrackingService } from '../../src/services/wearTrackingService';

const row = (id: string, extra: any = {}) => ({
  id, name: id, category: 'tops', color: 'black', season: ['fall'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false, ...extra,
});
const stored = async (id: string) =>
  JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!).find((i: any) => i.id === id);

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true');
  await AsyncStorage.setItem(
    '@smartcloset_items',
    JSON.stringify([row('own', { wearCount: 1 }), row('wish', { isWishlist: true, wearCount: 5, lastWorn: '2026-02-02T00:00:00Z' })]),
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('WearTrackingService with a wishlist item in the store', () => {
  it('marks an owned item worn', async () => {
    await WearTrackingService.markItemWorn('own');
    const own = await stored('own');
    expect(own.wearCount).toBe(2);
    expect(own.lastWorn).toBeTruthy();
  });

  it('refuses to wear a wishlist item and leaves it untouched', async () => {
    await expect(WearTrackingService.markItemWorn('wish')).rejects.toThrow('Item not found');
    expect(await stored('wish')).toMatchObject({ wearCount: 5, lastWorn: '2026-02-02T00:00:00Z', isWishlist: true });
  });

  it('an outfit made only of a wishlist item is refused and not logged', async () => {
    await expect(
      WearTrackingService.markOutfitWorn({ id: 'o', items: [{ id: 'wish' }] }),
    ).rejects.toThrow('Item not found');
    expect(await stored('wish')).toMatchObject({ wearCount: 5 });
    expect(await WearTrackingService.getOutfitHistory()).toEqual([]);
  });

  it('an outfit with an owned and a wishlist item wears the owned one, skips the wishlist one, and is logged', async () => {
    await WearTrackingService.markOutfitWorn({ id: 'o', items: [{ id: 'own' }, { id: 'wish' }] });
    expect(await stored('own')).toMatchObject({ wearCount: 2 });
    expect((await stored('own')).lastWorn).toBeTruthy();
    expect(await stored('wish')).toMatchObject({ wearCount: 5, lastWorn: '2026-02-02T00:00:00Z', isWishlist: true });
    expect((await WearTrackingService.getOutfitHistory()).map(h => h.outfitId)).toEqual(['o']);
  });

  it('the order of a mixed outfit does not matter, and an id that no longer exists is skipped too', async () => {
    await WearTrackingService.markOutfitWorn({ id: 'o', items: ['wish', 'gone', 'own'] });
    expect(await stored('own')).toMatchObject({ wearCount: 2 });
    expect(await stored('wish')).toMatchObject({ wearCount: 5 });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('wears every owned item of a mixed outfit once, none lost to the others writing at the same time', async () => {
    await AsyncStorage.setItem(
      '@smartcloset_items',
      JSON.stringify([row('a', { wearCount: 0 }), row('wish', { isWishlist: true }), row('b', { wearCount: 4 }), row('c')]),
    );
    await WearTrackingService.markItemsWorn(['a', 'wish', 'b', 'c', 'b']);
    expect(await stored('a')).toMatchObject({ wearCount: 1 });
    expect(await stored('b')).toMatchObject({ wearCount: 5 }); // listed twice, worn once
    expect(await stored('c')).toMatchObject({ wearCount: 1 });
    expect(await stored('wish')).not.toHaveProperty('lastWorn');
  });

  it('an outfit with no items at all is logged as before', async () => {
    await WearTrackingService.markOutfitWorn({ id: 'empty', items: [] });
    expect((await WearTrackingService.getOutfitHistory()).map(h => h.outfitId)).toEqual(['empty']);
  });

  it('undo changes an owned item and ignores a wishlist one', async () => {
    await WearTrackingService.undoLastWear('own', '2025-12-01T00:00:00Z');
    expect(await stored('own')).toMatchObject({ wearCount: 0, lastWorn: '2025-12-01T00:00:00Z' });

    await WearTrackingService.undoLastWear('wish', undefined);
    expect(await stored('wish')).toMatchObject({ wearCount: 5, lastWorn: '2026-02-02T00:00:00Z' });
  });
});
