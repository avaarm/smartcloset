/** Parts of swapService.ts that swapService.test.ts does not reach: settings and blocks, the item state, audiences, odd answers. */
const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
  },
}));
jest.mock('react-native-fs', () => ({ CachesDirectoryPath: '/caches', downloadFile: jest.fn(), unlink: jest.fn(async () => undefined) }));
jest.mock('../../src/services/imageStorage', () => ({ copyImageToPermanentStorage: jest.fn() }));
jest.mock('../../src/services/storage', () => ({ deleteClothingItem: jest.fn() }));
jest.mock('../../src/services/swapPhotoUrls', () => ({ signSwapPhotos: jest.fn() }));

import { FunctionsFetchError } from '@supabase/functions-js';
import * as swaps from '../../src/services/swapService';
import { BUCKET_ORDER, BUCKET_TITLES } from '../../src/utils/swapFormat';

const ok = (data: any) => mockRpc.mockResolvedValueOnce({ data, error: null });
const mine = (over: object) => ({
  listing_id: 'L', item_id: 'i1', audience: 'friends', status: 'active', name: 'Blazer', photo_path: 'L.jpg',
  listed_at: 'a', expires_at: 'b', open_offers: 0, in_accepted_swap: false, stale: false, ...over,
});

beforeEach(() => {
  mockRpc.mockReset(); mockInvoke.mockReset(); mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
});

describe('settings, blocks and export', () => {
  it('reads the settings as the server sends them', async () => {
    const s = { swapsEnabled: true, termsAccepted: true, termsCurrent: true, currentTermsVersion: '2026-10', communityAvailable: false, communityJoined: false, alias: null, adultConfirmed: false, suspended: false, needsYou: 2 };
    ok(s);
    expect(await swaps.getSwapSettings()).toEqual(s);
    expect(mockRpc).toHaveBeenCalledWith('get_swap_settings', undefined);
  });

  it('leaves the community', async () => {
    ok(null);
    await swaps.leaveSwapCommunity();
    expect(mockRpc).toHaveBeenCalledWith('leave_swap_community', undefined);
  });

  it('lists blocks by their opaque ref and label, never an account id', async () => {
    ok([{ ref: 'r1', label: 'Velvet Otter', blocked_at: 't' }]);
    expect(await swaps.listSwapBlocks()).toEqual([{ ref: 'r1', label: 'Velvet Otter', blockedAt: 't' }]);
  });

  it('exports what the server sends', async () => {
    const data = { settings: null, listings: [], swaps: [] };
    ok(data);
    expect(await swaps.exportMySwapData()).toBe(data);
    expect(mockRpc).toHaveBeenCalledWith('export_my_swap_data', undefined);
  });
});

describe('getSwapBadge', () => {
  it('is the number the server sends', async () => {
    ok(4);
    expect(await swaps.getSwapBadge()).toBe(4);
  });

  it('is 0 for anything that is not a number, and when the call fails', async () => {
    ok(null);
    expect(await swaps.getSwapBadge()).toBe(0);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'x', code: 'PGRST202' } });
    expect(await swaps.getSwapBadge()).toBe(0);
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    expect(await swaps.getSwapBadge()).toBe(0);
  });
});

describe('getItemSwapState', () => {
  it('finds the live listing of the piece, whatever else is listed', async () => {
    ok([mine({ listing_id: 'other', item_id: 'i2' }), mine({ listing_id: 'L1', item_id: 'i1', status: 'held' })]);
    expect(await swaps.getItemSwapState('i1')).toMatchObject({ listing: { id: 'L1', status: 'held' }, inAcceptedSwap: false });
  });

  it('does not count a withdrawn, expired or removed listing as open to swap', async () => {
    ok([mine({ status: 'withdrawn' }), mine({ status: 'expired' }), mine({ status: 'removed' }), mine({ status: 'completed' })]);
    expect(await swaps.getItemSwapState('i1')).toEqual({ listing: null, inAcceptedSwap: false });
  });

  it('says "not listed" when the server has no swaps or is unreachable', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'x', code: 'PGRST202' } });
    expect(await swaps.getItemSwapState('i1')).toEqual({ listing: null, inAcceptedSwap: false });
    mockRpc.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await swaps.getItemSwapState('i1')).toEqual({ listing: null, inAcceptedSwap: false });
  });
});

describe('publishing', () => {
  it('sends a missing note as null', async () => {
    mockInvoke.mockResolvedValue({ data: { listingId: 'L1' }, error: null });
    await swaps.publishSwapListing({ itemId: 'i1', audience: 'friends' });
    expect(mockInvoke).toHaveBeenCalledWith('swap-media', { method: 'POST', body: { action: 'publish', itemId: 'i1', audience: 'friends', note: null } });
  });

  it('does not pretend it worked when the answer has no listing id', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    await expect(swaps.publishSwapListing({ itemId: 'i1', audience: 'friends' })).rejects.toMatchObject({ code: 'unknown' });
  });

  it('says offline when the connection drops, as supabase-js really reports it', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('Network request failed')) });
    await expect(swaps.publishSwapListing({ itemId: 'i1', audience: 'friends' })).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('audiences', () => {
  it('offers the community only when the server allows it and the member joined', () => {
    expect(swaps.audiencesFor({ communityAvailable: false, communityJoined: true })).toEqual(['friends']);
    expect(swaps.audiencesFor({ communityAvailable: true, communityJoined: false })).toEqual(['friends']);
    expect(swaps.audiencesFor({ communityAvailable: true, communityJoined: true })).toEqual(['friends', 'community']);
  });

  it('limits a side to three pieces', () => {
    expect(swaps.MAX_PIECES_PER_SIDE).toBe(3);
  });
});

describe('odd answers from the server', () => {
  it('keeps empty lists empty in the inbox and a thread', async () => {
    ok([{ swap_id: 's1', status: 'proposed', role: 'proposer', pair_kind: 'friends', other_label: 'Bea', bucket: 'waiting', give_names: null, get_names: null, created_at: 'c', last_event_at: 'l', expires_at: 'e' }]);
    const [s] = await swaps.listMySwaps();
    expect([s.giveNames, s.getNames, s.attention, s.iDone, s.theyDone]).toEqual([[], [], false, false, false]);
    ok({ id: 's1', status: 'proposed', role: 'proposer', pairKind: 'friends', otherLabel: 'Bea', createdAt: 'c', expiresAt: 'e' });
    const d = await swaps.getSwap('s1');
    expect([d.items, d.messages, d.closedReason, d.closedAt]).toEqual([[], [], null, null]);
    expect(d.actions).toEqual({ canAccept: false, canDecline: false, canCancel: false, canComplete: false, canMessage: false, messagesLeft: 0 });
    expect(mockRpc).toHaveBeenLastCalledWith('get_swap', { p_swap_id: 's1', p_after: 0 });
  });

  it('asks for the inbox with a page size', async () => {
    ok([]);
    await swaps.listMySwaps();
    expect(mockRpc).toHaveBeenLastCalledWith('list_my_swaps', { p_limit: 100 });
  });

  it('blank search text and an empty condition list are sent as null', async () => {
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', q: '   ', conditions: [] });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_q: null, p_conditions: null, p_limit: 30 }));
  });

  it('clamps a page size of zero or less to one', async () => {
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', limit: 0 });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_limit: 1 }));
  });
});

describe('inbox sections', () => {
  it('has a title for every section, in the order the inbox shows them', () => {
    expect(BUCKET_ORDER).toEqual(['needs_you', 'finishing', 'in_progress', 'waiting', 'past']);
    for (const b of BUCKET_ORDER) expect(BUCKET_TITLES[b]).toBeTruthy();
  });
});
