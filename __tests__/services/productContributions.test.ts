const mockInsert = jest.fn();
const mockEq = jest.fn();
const mockDelete = jest.fn();
let mockUser: { id: string } | null = { id: 'user-1' };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockUser ? { user: mockUser } : null } }) },
    from: () => ({ insert: mockInsert, delete: mockDelete }),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordContribution,
  isSharingEnabled,
  setSharingEnabled,
  deleteMySharedContributions,
  getContributionHistory,
} from '../../src/services/productContributions';

const input = {
  fingerprint: 'fp1',
  semanticFp: 'c:red___abc',
  source: 'manual' as const,
  name: 'Tee',
  category: 'tops' as const,
  brand: 'Brand',
  cost: 20,
  imageHash: 'h1',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUser = { id: 'user-1' };
  mockInsert.mockReset().mockResolvedValue({ error: null });
  mockEq.mockReset().mockResolvedValue({ error: null });
  mockDelete.mockReset().mockReturnValue({ eq: mockEq });
});

describe('product sharing consent', () => {
  it('is off by default and uploads nothing, but still records locally', async () => {
    expect(await isSharingEnabled()).toBe(false);
    await recordContribution(input);
    expect(mockInsert).not.toHaveBeenCalled();
    expect((await getContributionHistory()).length).toBe(1);
  });

  it('uploads only after the user opts in', async () => {
    await setSharingEnabled(true);
    expect(await isSharingEnabled()).toBe(true);
    await recordContribution(input);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0]).toMatchObject({ user_id: 'user-1', name: 'Tee', brand: 'Brand' });
  });

  it('stops uploading when switched back off', async () => {
    await setSharingEnabled(true);
    await setSharingEnabled(false);
    await recordContribution(input);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('is per account: one user opting in does not opt in another', async () => {
    await setSharingEnabled(true); // user-1
    mockUser = { id: 'user-2' };
    expect(await isSharingEnabled()).toBe(false);
    await recordContribution(input);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('guests never upload and cannot opt in', async () => {
    mockUser = null;
    await setSharingEnabled(true);
    expect(await isSharingEnabled()).toBe(false);
    await recordContribution(input);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('removing shared data deletes only this account\'s rows', async () => {
    await deleteMySharedContributions();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('surfaces a failed removal so the UI can keep sharing on', async () => {
    mockEq.mockResolvedValue({ error: new Error('network') });
    await expect(deleteMySharedContributions()).rejects.toThrow('network');
  });
});
