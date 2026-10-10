/** Signed-in wear tracking: the read-then-write fallback (used when the wear RPC is missing) stays on the user's own owned rows. */
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockInsert = jest.fn();
let mockRow: any = null;
let mockRows: any[] = [];
const mockRpc = jest.fn();
const mockUpdate = jest.fn();

const chain: any = {};
chain.select = () => chain;
chain.eq = (...a: any[]) => { mockEq(...a); return chain; };
chain.in = async (...a: any[]) => { mockIn(...a); return { data: mockRows, error: null }; };
chain.maybeSingle = async () => ({ data: mockRow, error: null });
chain.update = (p: any) => { mockUpdate(p); return { eq: async () => ({ error: null }) }; };
chain.insert = async (p: any) => { mockInsert(p); return { error: null }; };

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    rpc: (...a: any[]) => mockRpc(...a),
    from: () => chain,
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
  },
}));

import { WearTrackingService } from '../../src/services/wearTrackingService';

const dbRow = (extra: any = {}) => ({
  id: 'a', name: 'Tee', category: 'tops', color: 'red', is_wishlist: false, wear_count: 2, created_at: '2026-01-01', ...extra,
});

beforeEach(() => {
  mockEq.mockReset();
  mockIn.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockRows = [];
  mockRpc.mockReset().mockResolvedValue({ error: { code: 'PGRST202', message: 'function not found' } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('markItemWorn fallback', () => {
  it('only reads the signed-in user\'s own row (a friend\'s rows are readable under RLS)', async () => {
    mockRow = dbRow();
    await WearTrackingService.markItemWorn('a');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'me');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ wear_count: 3 }));
  });

  it('refuses a wishlist row', async () => {
    mockRow = dbRow({ is_wishlist: true });
    await expect(WearTrackingService.markItemWorn('a')).rejects.toThrow('Item not found');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('markOutfitWorn with a wishlist item inside the outfit', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ error: null });
  });

  it('wears the owned item through the RPC, skips the wishlist one, and logs the outfit', async () => {
    mockRows = [dbRow({ id: 'own' }), dbRow({ id: 'wish', is_wishlist: true })];
    await WearTrackingService.markOutfitWorn({ id: 'o', items: [{ id: 'own' }, { id: 'wish' }] });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('increment_wear_count', { item_id: 'own' });
    // Ownership is looked up in one query, on the signed-in user's own rows only.
    expect(mockIn).toHaveBeenCalledWith('id', ['own', 'wish']);
    expect(mockEq).toHaveBeenCalledWith('user_id', 'me');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ outfit_id: 'o', user_id: 'me' }));
    expect(console.error).not.toHaveBeenCalled();
  });

  it('skips an id the user does not own at all (deleted, or a friend\'s row)', async () => {
    mockRows = [dbRow({ id: 'own' })];
    await WearTrackingService.markItemsWorn(['gone', 'own']);
    expect(mockRpc.mock.calls.map(c => c[1].item_id)).toEqual(['own']);
  });

  it('refuses, and logs nothing, when nothing in the outfit is owned', async () => {
    mockRows = [dbRow({ id: 'wish', is_wishlist: true })];
    await expect(
      WearTrackingService.markOutfitWorn({ id: 'o', items: [{ id: 'wish' }] }),
    ).rejects.toThrow('Item not found');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
