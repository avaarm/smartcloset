/**
 * Export Data carries the member's stylist data (pro-accounts.md 7.10, 8.2) when the server can give it. A guest and a
 * server without the feature simply have none; any other failure is written into the file as { unavailable: true } and
 * named in the line that travels with the file, so an omission is never silent. The export never fails because of it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { Share } from 'react-native';
import { backupSummary, exportData, importData, saveAndShareBackup } from '../../src/services/backupService';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';

let mockSession: any = null;
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockSession } }) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));
const mockExportRatings = jest.fn();
jest.mock('../../src/services/ratingService', () => ({ exportMyRatings: (...a: unknown[]) => mockExportRatings(...a) }));
const mockExportSwaps = jest.fn();
jest.mock('../../src/services/swapService', () => ({ exportMySwapData: (...a: unknown[]) => mockExportSwaps(...a) }));

const PRO = {
  settings: {
    adultConfirmedAt: '2026-10-20T10:00:00Z',
    stylistTerms: { version: '2026-10', acceptedAt: '2026-10-20T10:01:00Z' },
    clientTerms: null,
    suspended: false,
  },
  stylistProfile: null,
  invites: [{ createdAt: '2026-10-21T09:00:00Z', expiresAt: '2026-10-28T09:00:00Z', status: 'used' }],
  connections: [
    {
      role: 'stylist',
      otherLabel: 'Bea',
      status: 'active',
      startedAt: '2026-10-21T10:00:00Z',
      looks: [{ title: 'Autumn layers', body: 'Try the grey coat', status: 'sent', items: ['Grey coat'] }],
      sessions: [],
      myMessages: [{ body: 'Hello Bea', sentAt: '2026-10-21T10:05:00Z' }],
    },
  ],
};
const SWAP = { settings: null, listings: [{ id: 'l1' }], swaps: [] };
const RATINGS = { itemRatings: [], brandRatings: [], consents: [] };

const signedIn = () => { mockSession = { access_token: 't', user: { id: 'u1' } }; };

let errorSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession = null;
  mockRpc.mockReset();
  mockExportRatings.mockReset().mockResolvedValue(RATINGS);
  mockExportSwaps.mockReset().mockResolvedValue(SWAP);
  (getClothingItems as jest.Mock).mockReset().mockResolvedValue([]);
  (getSavedOutfits as jest.Mock).mockReset().mockResolvedValue([]);
  (RNFS.writeFile as jest.Mock).mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('exportData and the stylist section', () => {
  it('includes the section the server returned, between swap and metadata, in the same 1.1 file', async () => {
    signedIn();
    mockRpc.mockResolvedValue({ data: PRO, error: null });
    const backup = await exportData();
    expect(backup.version).toBe('1.1');
    expect(backup.pro).toEqual(PRO);
    const keys = Object.keys(backup);
    expect(keys.indexOf('pro')).toBeGreaterThan(keys.indexOf('swap'));
    expect(keys.indexOf('metadata')).toBeGreaterThan(keys.indexOf('pro'));
  });

  it('asks the server for it directly, with no status read first, so a paused or suspended person can still take their data', async () => {
    signedIn();
    mockRpc.mockResolvedValue({ data: PRO, error: null });
    await exportData();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('export_my_pro_data');
  });

  it('leaves the section out for a guest, without a network call, and still exports', async () => {
    const backup = await exportData();
    expect('pro' in backup).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(backup.ratings).toEqual(RATINGS);
    expect(backup.swap).toEqual(SWAP);
  });

  it('leaves the section out for a server that does not have the function', async () => {
    signedIn();
    for (const error of [
      { code: 'PGRST202', message: 'Could not find the function public.export_my_pro_data without parameters in the schema cache' },
      { code: '42883', message: 'function export_my_pro_data() does not exist' },
      { status: 404, message: 'Not Found' },
    ]) {
      mockRpc.mockResolvedValue({ data: null, error });
      const backup = await exportData();
      expect('pro' in backup).toBe(false);
    }
  });

  it('leaves the section out when the server says nobody is signed in', async () => {
    signedIn();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } });
    expect('pro' in (await exportData())).toBe(false);
  });

  it.each([
    ['offline, as a rejected request', () => mockRpc.mockRejectedValue(new TypeError('Network request failed'))],
    ['offline, as an answer', () => mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })],
    ['a server error', () => mockRpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })],
    ['a refusal the export should not give', () => mockRpc.mockResolvedValue({ data: null, error: { message: 'pro_disabled' } })],
    ['an answer with no body at all', () => mockRpc.mockResolvedValue(undefined)],
  ])('writes { unavailable: true } for %s, and the rest of the file is complete', async (_name, arrange) => {
    signedIn();
    arrange();
    (getClothingItems as jest.Mock).mockResolvedValue([{ id: 'a', name: 'a', category: 'tops', color: 'black', season: [], dateAdded: '2026-01-01T00:00:00Z' }]);
    const backup = await exportData();
    expect(backup.pro).toEqual({ unavailable: true });
    expect(backup.items).toHaveLength(1);
    expect(backup.ratings).toEqual(RATINGS);
    expect(backup.swap).toEqual(SWAP);
    expect(backup.version).toBe('1.1');
  });

  it('is independent of the other sections: each can be missing without taking the others with it', async () => {
    signedIn();
    mockRpc.mockResolvedValue({ data: PRO, error: null });
    mockExportRatings.mockRejectedValue(new Error('offline'));
    mockExportSwaps.mockRejectedValue(new Error('offline'));
    const backup = await exportData();
    expect('ratings' in backup).toBe(false);
    expect('swap' in backup).toBe(false);
    expect(backup.pro).toEqual(PRO);
  });

  it('logs nothing on a guest or a failure path', async () => {
    await exportData();
    signedIn();
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await exportData();
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await exportData();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('restoring a backup with a stylist section, or with the unavailable note, ignores it', async () => {
    signedIn();
    for (const answer of [{ data: PRO, error: null }, { data: null, error: { message: 'Failed to fetch' } }]) {
      mockRpc.mockResolvedValue(answer);
      const backup = await exportData();
      expect(backup.pro).toBeTruthy();
      await AsyncStorage.clear();
      await importData(JSON.parse(JSON.stringify(backup)));
      expect(JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!)).toEqual([]);
      expect(await AsyncStorage.getAllKeys()).toEqual(['@smartcloset_items', '@smartcloset_saved_outfits']);
    }
  });
});

describe('the line that travels with the file', () => {
  const meta = { totalItems: 0, totalOutfits: 0, exportDate: '10/25/2026' };
  const base = { version: '1.1', timestamp: '2026-10-25T10:00:00Z', items: [], outfits: [], metadata: meta };

  it('is the plain line when the section is present or was never expected', () => {
    expect(backupSummary(base)).toBe('Backup created on 10/25/2026');
    expect(backupSummary({ ...base, pro: PRO as any })).toBe('Backup created on 10/25/2026');
  });

  it('says the stylist data could not be included when it was unavailable', () => {
    expect(backupSummary({ ...base, pro: { unavailable: true } })).toBe(
      'Backup created on 10/25/2026. Your stylist data could not be included.',
    );
  });

  describe('through saveAndShareBackup', () => {
    let share: jest.SpyInstance;
    beforeEach(() => {
      share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
      signedIn();
    });

    it('shares the file with the section in it and the plain line', async () => {
      mockRpc.mockResolvedValue({ data: PRO, error: null });
      await saveAndShareBackup();
      const written = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
      expect(written.pro).toEqual(PRO);
      expect(share.mock.calls[0][0].message).toMatch(/^Backup created on /);
      expect(share.mock.calls[0][0].message).not.toMatch(/stylist/i);
    });

    it('names the missing section in the line when it could not be read, and still shares the file', async () => {
      mockRpc.mockRejectedValue(new TypeError('Network request failed'));
      await saveAndShareBackup();
      const written = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
      expect(written.pro).toEqual({ unavailable: true });
      expect(share.mock.calls[0][0].message).toMatch(/Your stylist data could not be included\.$/);
    });

    it('has nothing to say about it for a server without the feature', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      await saveAndShareBackup();
      const written = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
      expect('pro' in written).toBe(false);
      expect(share.mock.calls[0][0].message).not.toMatch(/stylist/i);
    });
  });
});
