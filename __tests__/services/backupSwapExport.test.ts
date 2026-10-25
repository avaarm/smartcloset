/** Export Data carries the member's swap activity when it can be read, and never fails because it can't. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportData, importData } from '../../src/services/backupService';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';

const mockExportSwaps = jest.fn();
jest.mock('../../src/services/swapService', () => ({ exportMySwapData: (...a: any[]) => mockExportSwaps(...a) }));
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
  (getClothingItems as jest.Mock).mockReset().mockResolvedValue([]);
  (getSavedOutfits as jest.Mock).mockReset().mockResolvedValue([]);
  mockExportSwaps.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('exportData and swaps', () => {
  // SW0 bumps the file version to 1.1 in the same edit that adds the section (7.7); the ratings pass A adds its own
  // section later and does not touch the version.
  it('includes the swap section', async () => {
    const swap = { settings: { termsVersion: '2026-10' }, listings: [{ id: 'l1' }], swaps: [{ id: 's1', myMessages: [{ body: 'hi' }] }] };
    mockExportSwaps.mockResolvedValue(swap);
    const backup = await exportData();
    expect(backup.version).toBe('1.1');
    expect(backup.swap).toEqual(swap);
  });

  it('leaves the section out for a guest, offline, or a server without swaps, and still exports', async () => {
    mockExportSwaps.mockRejectedValue(new Error('not_authenticated'));
    const backup = await exportData();
    expect('swap' in backup).toBe(false);
    expect('pro' in backup).toBe(false);
    expect(backup.items).toEqual([]);
  });

  it('restoring a backup that has a swap section ignores it', async () => {
    mockExportSwaps.mockResolvedValue({ settings: null, listings: [], swaps: [] });
    const backup = await exportData();
    await importData(JSON.parse(JSON.stringify(backup)));
    expect(JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!)).toEqual([]);
    expect(await AsyncStorage.getItem('@smartcloset_swap')).toBeNull();
  });
});
