const mockInvoke = jest.fn();
const mockSignOut = jest.fn();
const mockClearCache = jest.fn();
let mockSession: any = { user: { id: 'u1' } };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      signOut: (...a: any[]) => mockSignOut(...a),
    },
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
  },
}));
jest.mock('../../src/services/imageUrls', () => ({ clearSignedImageCache: () => mockClearCache() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAccount } from '../../src/services/accountDeletion';

beforeEach(async () => {
  mockSession = { user: { id: 'u1' } };
  mockInvoke.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockClearCache.mockReset().mockResolvedValue(undefined);
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_body_profile', 'private');
});

describe('deleteAccount', () => {
  it('asks the server to delete, then wipes this device and drops the session (no extra confirm dialogs)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, photosRemoved: 3 }, error: null });
    const out = await deleteAccount();
    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(await AsyncStorage.getItem('@smartcloset_body_profile')).toBeNull();
    expect(mockClearCache).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(out.photosIncomplete).toBe(false);
  });

  it('touches nothing on the device if the server could not delete the account', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('500') });
    await expect(deleteAccount()).rejects.toThrow('500');
    expect(await AsyncStorage.getItem('@smartcloset_body_profile')).toBe('private');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('still reports success when only the local cleanup hits errors (the account is already gone)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockClearCache.mockRejectedValue(new Error('disk'));
    mockSignOut.mockRejectedValue(new Error('network'));
    await expect(deleteAccount()).resolves.toEqual({ photosIncomplete: false });
  });

  it('passes on that some photos could not be removed', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, photosIncomplete: true }, error: null });
    expect((await deleteAccount()).photosIncomplete).toBe(true);
  });

  it('refuses when nobody is signed in', async () => {
    mockSession = null;
    await expect(deleteAccount()).rejects.toThrow('not_signed_in');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
