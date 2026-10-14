const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn((..._args: any[]) => ({ eq: (...a: any[]) => mockUpdateEq(...a) }));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
    from: jest.fn(() => ({ update: (...a: any[]) => mockUpdate(...a) })),
  },
}));

const mockDownload = jest.fn();
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/caches',
  downloadFile: (...a: any[]) => ({ promise: mockDownload(...a) }),
  unlink: jest.fn(async () => undefined),
}));
const mockCopyToStorage = jest.fn();
jest.mock('../../src/services/imageStorage', () => ({ copyImageToPermanentStorage: (...a: any[]) => mockCopyToStorage(...a) }));
const mockDeleteItem = jest.fn();
jest.mock('../../src/services/storage', () => ({ deleteClothingItem: (...a: any[]) => mockDeleteItem(...a) }));
const mockSign = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({ signSwapPhotos: (...a: any[]) => mockSign(...a) }));

import * as swaps from '../../src/services/swapService';
import { SwapError } from '../../src/services/swapErrors';
import { SWAP_TERMS_VERSION } from '../../src/config/swapRules';

const signedIn = () => mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
const ok = (data: any) => mockRpc.mockResolvedValueOnce({ data, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset(); mockInvoke.mockReset(); mockDownload.mockReset(); mockCopyToStorage.mockReset();
  mockDeleteItem.mockReset().mockResolvedValue(undefined);
  mockUpdateEq.mockReset().mockResolvedValue({ error: null });
  mockSign.mockReset().mockImplementation(async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`])));
  signedIn();
});

describe('guests', () => {
  it.each([
    ['getSwapSettings', () => swaps.getSwapSettings()],
    ['listMySwaps', () => swaps.listMySwaps()],
    ['browseSwapListings', () => swaps.browseSwapListings({ scope: 'friends' })],
    ['proposeSwap', () => swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b'], clientRef: 'r' })],
    ['publishSwapListing', () => swaps.publishSwapListing({ itemId: 'i', audience: 'friends' })],
    ['completeSwapHandoff', () => swaps.completeSwapHandoff('s')],
  ])('%s fails before any network call', async (_n, run) => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(run()).rejects.toMatchObject({ code: 'not_authenticated' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the badge and the item state quietly say zero / not listed', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await swaps.getSwapBadge()).toBe(0);
    expect(await swaps.getItemSwapState('i')).toEqual({ listing: null, inAcceptedSwap: false });
  });
});

describe('calls the right functions with the right names', () => {
  it.each([
    [() => swaps.acceptSwapTerms(), 'accept_swap_terms', { p_version: SWAP_TERMS_VERSION }],
    [() => swaps.joinSwapCommunity({ alias: 'Otter', adult: true, photoScanOk: true }), 'join_swap_community', { p_alias: 'Otter', p_adult: true, p_photo_scan_ok: true, p_terms_version: SWAP_TERMS_VERSION }],
    [() => swaps.updateSwapListingNote('l1', 'hi'), 'update_swap_listing', { p_listing_id: 'l1', p_note: 'hi' }],
    [() => swaps.withdrawSwapListing('l1'), 'withdraw_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.renewSwapListing('l1'), 'renew_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.narrowSwapListing('l1'), 'narrow_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.cancelSwap('s1'), 'cancel_swap', { p_swap_id: 's1' }],
    [() => swaps.blockSwapMember('swap', 's1'), 'block_swap_member', { p_ref_type: 'swap', p_ref_id: 's1' }],
    [() => swaps.unblockSwapMember('ref1'), 'unblock_swap_member', { p_ref: 'ref1' }],
  ])('%#', async (run, fn, args) => {
    ok(null);
    await run();
    expect(mockRpc).toHaveBeenCalledWith(fn, args);
  });

  it('records agreement against the terms in this build, whatever a caller tries to pass', async () => {
    ok(null);
    await (swaps.acceptSwapTerms as any)('2099-01');
    expect(mockRpc).toHaveBeenLastCalledWith('accept_swap_terms', { p_version: SWAP_TERMS_VERSION });
    ok(null);
    await (swaps.joinSwapCommunity as any)({ alias: 'Otter', adult: true, photoScanOk: true, termsVersion: '2099-01' });
    expect(mockRpc).toHaveBeenLastCalledWith('join_swap_community', expect.objectContaining({ p_terms_version: SWAP_TERMS_VERSION }));
  });

  it('proposes with a client ref and trims the note', async () => {
    ok('swap-1');
    expect(await swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b', 'c'], note: '  hello ', clientRef: 'r1' })).toBe('swap-1');
    expect(mockRpc).toHaveBeenCalledWith('propose_swap', { p_request_listing_ids: ['a'], p_offer_listing_ids: ['b', 'c'], p_note: 'hello', p_client_ref: 'r1' });
  });

  it('responds, and returns the server’s answer', async () => {
    ok('unavailable');
    expect(await swaps.respondToSwap('s1', 'accept')).toBe('unavailable');
    expect(mockRpc).toHaveBeenCalledWith('respond_to_swap', { p_swap_id: 's1', p_action: 'accept' });
  });

  it('sends a message with a client ref', async () => {
    ok(42);
    expect(await swaps.sendSwapMessage('s1', 'hi', 'r2')).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith('send_swap_message', { p_swap_id: 's1', p_body: 'hi', p_client_ref: 'r2' });
  });

  it('reports with the flagged message and cut details', async () => {
    ok(null);
    await swaps.reportSwapContent({ refType: 'swap', refId: 's1', reason: 'harassment', details: ' rude '.padEnd(600, 'x'), messageId: 7 });
    const args = mockRpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_ref_type: 'swap', p_ref_id: 's1', p_reason: 'harassment', p_message_id: 7 });
    expect(args.p_details.length).toBe(500);
  });

  it('turns a server error into a SwapError with detail and hint', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'text_not_allowed', details: 'note', hint: 'payment', code: '22023' } });
    await expect(swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b'], note: 'x', clientRef: 'r' }))
      .rejects.toMatchObject({ code: 'text_not_allowed', detail: 'note', hint: 'payment' });
  });
});

describe('browsing', () => {
  const row = (n: number) => ({
    listing_id: `l${n}`, owner_label: 'Ann', owner_kind: 'friend', audience: 'friends', name: `Piece ${n}`, category: 'tops',
    subcategory: null, brand: 'Zara', color: null, size: 'M', condition: 'good', pattern: null,
    materials: [{ name: 'wool', percentage: 80 }], care_instructions: null, origin_country: null, season: null, note: null,
    photo_path: `l${n}.jpg`, listed_at: `2026-10-0${n}T00:00:00Z`, mine: false,
  });

  it('maps rows, drops nulls, ignores an unknown condition, and offers a cursor when the page is full', async () => {
    ok([row(2), { ...row(1), condition: 'mint' }]);
    const page = await swaps.browseSwapListings({ scope: 'friends', limit: 2, conditions: ['good'], q: ' blazer ' });
    expect(mockRpc).toHaveBeenCalledWith('browse_swap_listings', expect.objectContaining({
      p_scope: 'friends', p_conditions: ['good'], p_q: 'blazer', p_limit: 2, p_before_ts: null, p_category: null,
    }));
    expect(page.items[0]).toMatchObject({ id: 'l2', ownerLabel: 'Ann', ownerKind: 'friend', brand: 'Zara', condition: 'good', photoPath: 'l2.jpg' });
    expect(page.items[0].subcategory).toBeUndefined();
    expect(page.items[1].condition).toBeUndefined();
    expect(page.nextCursor).toEqual({ ts: '2026-10-01T00:00:00Z', id: 'l1' });
  });

  it('has no cursor on a short page, and passes one back', async () => {
    ok([row(1)]);
    expect((await swaps.browseSwapListings({ scope: 'community', limit: 30 })).nextCursor).toBeNull();
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', cursor: { ts: 'T', id: 'L' }, sameOwnerAs: 'x', friendId: 'f' });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_before_ts: 'T', p_before_id: 'L', p_same_owner_as: 'x', p_friend_id: 'f' }));
  });

  it('clamps the page size', async () => {
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', limit: 500 });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_limit: 40 }));
  });

  it('a listing that is gone is swap_unavailable', async () => {
    ok([]);
    await expect(swaps.getSwapListing('nope')).rejects.toMatchObject({ code: 'swap_unavailable' });
  });
});

describe('the inbox and a thread', () => {
  it('maps swap rows', async () => {
    ok([{ swap_id: 's1', status: 'proposed', closed_reason: null, role: 'recipient', pair_kind: 'friends', other_label: 'Bea', bucket: 'needs_you', attention: true,
          give_names: ['Blazer'], get_names: ['Shirt'], thumb_path: 'x.jpg', i_done: false, they_done: false, created_at: 'c', last_event_at: 'l', expires_at: 'e' }]);
    const [s] = await swaps.listMySwaps();
    expect(s).toMatchObject({ id: 's1', otherLabel: 'Bea', bucket: 'needs_you', attention: true, giveNames: ['Blazer'], thumbPath: 'x.jpg' });
    expect(s.closedReason).toBeUndefined();
  });

  it('maps a thread, including the server’s action flags', async () => {
    ok({ id: 's1', status: 'accepted', role: 'proposer', pairKind: 'friends', otherLabel: 'Bea', createdAt: 'c', expiresAt: 'e', iDone: false, theyDone: true, autoCompleted: false,
         items: [{ listingId: 'l1', side: 'offer', mine: true, name: 'Blazer', condition: 'mint', photoPending: null, removalPending: 1 }],
         messages: [{ id: '5', kind: 'text', body: 'hi', mine: false, createdAt: 't' }],
         actions: { canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 } });
    const d = await swaps.getSwap('s1', 4);
    expect(mockRpc).toHaveBeenCalledWith('get_swap', { p_swap_id: 's1', p_after: 4 });
    expect(d.actions).toEqual({ canAccept: false, canDecline: false, canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 });
    expect(d.messages[0]).toMatchObject({ id: 5, body: 'hi', mine: false });
    expect(d.items[0]).toMatchObject({ photoPending: false, removalPending: true });
    expect(d.items[0].condition).toBeUndefined();
  });
});

describe('opening a piece to swap', () => {
  it('calls swap-media and returns the listing id', async () => {
    mockInvoke.mockResolvedValue({ data: { listingId: 'L1' }, error: null });
    expect(await swaps.publishSwapListing({ itemId: 'i1', audience: 'community', note: 'hi' })).toEqual({ listingId: 'L1' });
    expect(mockInvoke).toHaveBeenCalledWith('swap-media', { method: 'POST', body: { action: 'publish', itemId: 'i1', audience: 'community', note: 'hi' } });
  });

  it('reads the reason a photo was rejected', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 422, json: async () => ({ error: 'photo_rejected', reason: 'people' }) } } });
    await expect(swaps.publishSwapListing({ itemId: 'i1', audience: 'community' })).rejects.toMatchObject({ code: 'photo_rejected', hint: 'people' });
  });

  it('an item that is listed but reserved shows as locked', async () => {
    ok([{ listing_id: 'L1', item_id: 'i1', audience: 'friends', status: 'reserved', name: 'Blazer', photo_path: 'L1.jpg', listed_at: 'a', expires_at: 'b', open_offers: 0, in_accepted_swap: true, stale: false }]);
    expect(await swaps.getItemSwapState('i1')).toMatchObject({ inAcceptedSwap: true, listing: { id: 'L1' } });
  });
});

describe('completeSwapHandoff', () => {
  const reply = (over: object = {}) => ({
    status: 'accepted', completed: false,
    received: [{ claimedItemId: 'new1', listingId: 'l9', photoPath: 'l9.jpg', name: 'Shirt' }],
    toRemove: [{ itemId: 'mine1', name: 'Blazer' }],
    ...over,
  });
  const photoWorks = () => {
    mockDownload.mockResolvedValue({ statusCode: 200 });
    mockCopyToStorage.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=t');
  };

  it('adds the piece, copies its photo into the member’s own folder, then removes the piece they gave', async () => {
    photoWorks();
    ok(reply({ completed: true })); ok(null);
    const result = await swaps.completeSwapHandoff('s1');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'swap_complete_my_side', { p_swap_id: 's1', p_keep_given: false });
    expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'https://signed/l9.jpg' }));
    expect(mockCopyToStorage).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/caches\/swap_/));
    expect(mockUpdate).toHaveBeenCalledWith({ user_image: 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/me/1.jpg' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'new1');
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'swap_ack_photo', { p_swap_id: 's1', p_claimed_item_ids: ['new1'] });
    expect(mockDeleteItem).toHaveBeenCalledWith('mine1');
    expect(result).toEqual({ completed: true, receivedItemIds: ['new1'], photosPending: 0, removedItemIds: ['mine1'], removalsPending: 0 });
  });

  it('keeps the member’s own piece when they asked to', async () => {
    photoWorks();
    ok(reply({ toRemove: [] })); ok(null);
    await swaps.completeSwapHandoff('s1', { keepGiven: true });
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'swap_complete_my_side', { p_swap_id: 's1', p_keep_given: true });
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });

  it('leaves a photo for next time when the network fails, and does not acknowledge it', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    ok(reply());
    const result = await swaps.completeSwapHandoff('s1');
    expect(result.photosPending).toBe(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);                       // no swap_ack_photo
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.removedItemIds).toEqual(['mine1']);               // the rest still finishes
  });

  it('gives up on a photo that no longer exists, so it is not retried forever', async () => {
    mockDownload.mockResolvedValue({ statusCode: 404 });
    ok(reply()); ok(null);
    const result = await swaps.completeSwapHandoff('s1');
    expect(result.photosPending).toBe(0);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'swap_ack_photo', { p_swap_id: 's1', p_claimed_item_ids: ['new1'] });
  });

  it('gives up on a photo the signing call says is gone (a swap closed as unavailable, a cleaned-up listing)', async () => {
    mockSign.mockImplementationOnce(async (_paths: string[], o?: { missing?: Set<string> }) => { o!.missing!.add('l9.jpg'); return new Map(); });
    ok(reply()); ok(null);
    const result = await swaps.completeSwapHandoff('s1');
    expect(mockSign).toHaveBeenCalledWith(['l9.jpg'], { missing: expect.any(Set) });
    expect(result.photosPending).toBe(0);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'swap_ack_photo', { p_swap_id: 's1', p_claimed_item_ids: ['new1'] });
  });

  it('keeps a photo for next time when there is simply no link (offline, a failed signing call)', async () => {
    mockSign.mockResolvedValueOnce(new Map());
    ok(reply());
    const result = await swaps.completeSwapHandoff('s1');
    expect(result.photosPending).toBe(1);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);                       // no swap_ack_photo
  });

  it('gives up on a piece with no photo path at all', async () => {
    ok(reply({ received: [{ claimedItemId: 'new1', listingId: null, photoPath: null, name: 'Shirt' }] })); ok(null);
    expect((await swaps.completeSwapHandoff('s1')).photosPending).toBe(0);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('does not write a local file path into the closet row', async () => {
    mockDownload.mockResolvedValue({ statusCode: 200 });
    mockCopyToStorage.mockResolvedValue('file:///var/mobile/Documents/clothing_1.jpg');
    ok(reply());
    expect((await swaps.completeSwapHandoff('s1')).photosPending).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports a removal that failed so it can be retried', async () => {
    photoWorks();
    mockDeleteItem.mockRejectedValue(new Error('offline'));
    ok(reply()); ok(null);
    expect(await swaps.completeSwapHandoff('s1')).toMatchObject({ removedItemIds: [], removalsPending: 1 });
  });

  it('surfaces the server’s refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'swap_not_open' } });
    await expect(swaps.completeSwapHandoff('s1')).rejects.toBeInstanceOf(SwapError);
  });

  describe('two calls for the same swap at once', () => {
    const handoffCalls = () => mockRpc.mock.calls.filter(c => c[0] === 'swap_complete_my_side');
    const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    it('share one run: one completion, one download, one closet update', async () => {
      let release!: (v: { statusCode: number }) => void;
      mockDownload.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
      mockCopyToStorage.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=t');
      ok(reply({ completed: true })); ok(null);

      const first = swaps.completeSwapHandoff('s1');
      const second = swaps.completeSwapHandoff('s1', { keepGiven: true });   // keepGiven only counts on the first tap
      await tick();
      expect(mockDownload).toHaveBeenCalledTimes(1);                          // the first run is parked on the download
      release({ statusCode: 200 });
      const [a, b] = await Promise.all([first, second]);

      expect(b).toBe(a);
      expect(a).toEqual({ completed: true, receivedItemIds: ['new1'], photosPending: 0, removedItemIds: ['mine1'], removalsPending: 0 });
      expect(handoffCalls()).toEqual([['swap_complete_my_side', { p_swap_id: 's1', p_keep_given: false }]]);
      expect(mockDownload).toHaveBeenCalledTimes(1);
      expect(mockCopyToStorage).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockDeleteItem).toHaveBeenCalledTimes(1);

      // Once the run is over the next call is a fresh one (an interrupted swap is finished on a later visit).
      photoWorks();
      ok(reply()); ok(null);
      await swaps.completeSwapHandoff('s1');
      expect(handoffCalls()).toHaveLength(2);
    });

    it('do not hold up a different swap', async () => {
      let release!: (v: { statusCode: number }) => void;
      mockDownload.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
      mockCopyToStorage.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=t');
      mockRpc.mockImplementation(async (fn: string, args: any) => ({
        data: fn === 'swap_complete_my_side' ? (args.p_swap_id === 's1' ? reply() : reply({ received: [], toRemove: [] })) : null,
        error: null,
      }));
      const slow = swaps.completeSwapHandoff('s1');
      try {
        await tick();
        await swaps.completeSwapHandoff('s2');
        expect(handoffCalls().map(c => c[1].p_swap_id)).toEqual(['s1', 's2']);
      } finally {
        release({ statusCode: 200 });
        await slow;
      }
    });

    it('share a failure too, and a failed run does not block the next call', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'swap_not_open' } });
      const first = swaps.completeSwapHandoff('s1');
      const second = swaps.completeSwapHandoff('s1');
      const settled = await Promise.allSettled([first, second]);
      expect(settled.map(r => r.status)).toEqual(['rejected', 'rejected']);
      expect((settled[1] as PromiseRejectedResult).reason).toBe((settled[0] as PromiseRejectedResult).reason);
      expect(handoffCalls()).toHaveLength(1);

      photoWorks();
      ok(reply()); ok(null);
      await expect(swaps.completeSwapHandoff('s1')).resolves.toMatchObject({ photosPending: 0 });
      expect(handoffCalls()).toHaveLength(2);
    });

    it('a guest is turned away on every call, and never leaves a run behind', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await expect(swaps.completeSwapHandoff('s1')).rejects.toMatchObject({ code: 'not_authenticated' });
      signedIn();
      photoWorks();
      ok(reply()); ok(null);
      await expect(swaps.completeSwapHandoff('s1')).resolves.toMatchObject({ photosPending: 0 });
    });
  });
});
