const mockRpc = jest.fn();
const mockSign = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { rpc: (...a: any[]) => mockRpc(...a), auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/imageUrls', () => ({
  withSignedImages: (items: any[]) => mockSign(items),
  canonicalizeImageUrl: (u: any) => u,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { getFriendCloset } from '../../src/services/friendService';

beforeEach(() => {
  mockRpc.mockReset();
  mockSign.mockReset().mockImplementation(async (items: any[]) => items);
});

describe('getFriendCloset', () => {
  it('asks the limited-column function for the friend and maps the rows', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'a', name: 'Silk Top', category: 'tops', color: 'cream', brand: 'Acme', season: ['fall'], user_image: 'u', created_at: '2026-01-01' }],
      error: null,
    });
    const items = await getFriendCloset('friend-1');
    expect(mockRpc).toHaveBeenCalledWith('get_friend_closet', { p_friend_id: 'friend-1' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'a', name: 'Silk Top', brand: 'Acme', userImage: 'u' });
    // Private fields are never populated for a friend's item.
    expect(items[0].cost).toBeUndefined();
    expect(items[0].notes).toBeUndefined();
    expect(items[0].wearCount).toBe(0);
  });

  it('signs the photo links of the returned items', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'a', name: 'x', category: 'tops', color: 'c', user_image: 'orig' }], error: null });
    mockSign.mockImplementation(async (items: any[]) => items.map(i => ({ ...i, userImage: 'signed' })));
    const [item] = await getFriendCloset('f');
    expect(item.userImage).toBe('signed');
  });

  it('returns an empty list for a stranger (the function returns no rows)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getFriendCloset('stranger')).toEqual([]);
  });

  it('throws when the call fails so the screen can show an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(getFriendCloset('f')).rejects.toThrow('boom');
  });
});
