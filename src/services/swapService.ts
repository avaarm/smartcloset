/**
 * Clothing swaps: the only module the screens talk to. Every function
 *  - throws SwapError('not_authenticated') for a guest, before any network call, and
 *  - turns server errors into SwapError (see swapErrors.ts).
 * No module-level side effects (App.test imports every screen's module graph), no
 * AsyncStorage keys, no realtime channels.
 *
 * Server functions: supabase/migrations/20261015000100..0500_swap_*.sql
 * Edge function:    supabase/functions/swap-media
 */
import RNFS from 'react-native-fs';
import { supabase } from '../config/supabase';
import { canonicalizeImageUrl } from './imageUrls';
import { copyImageToPermanentStorage } from './imageStorage';
import { deleteClothingItem } from './storage';
import { signSwapPhotos } from './swapPhotoUrls';
import { SwapError, toSwapError, toSwapErrorFromFunction } from './swapErrors';
import { SWAP_LIMITS, SWAP_TERMS_VERSION } from '../config/swapRules';
import { isItemCondition } from '../utils/itemCondition';
import type {
  HandoffResult, MySwapListing, ProposeSwapInput, PublishSwapInput, SwapAudience, SwapBlock, SwapBrowsePage,
  SwapBrowseQuery, SwapDetail, SwapExport, SwapItemView, SwapListing, SwapMessage, SwapReportReason,
  SwapReportRefType, SwapSettings, SwapSummary,
} from '../types/swap';

// ─── plumbing ────────────────────────────────────────────────────────────────

const requireSession = async (): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new SwapError('not_authenticated');
};

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  await requireSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toSwapError(error);
  return data as T;
};

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
const cond = (v: unknown) => (isItemCondition(v) ? v : undefined);

// ─── row mapping (tables come back snake_case, jsonb results camelCase) ──────

const mapListing = (r: any): SwapListing => ({
  id: r.listing_id,
  ownerLabel: r.owner_label,
  ownerKind: r.owner_kind,
  audience: r.audience,
  name: r.name,
  category: r.category,
  subcategory: opt(r.subcategory),
  brand: opt(r.brand),
  color: opt(r.color),
  size: opt(r.size),
  condition: cond(r.condition),
  pattern: opt(r.pattern),
  materials: opt(r.materials),
  careInstructions: opt(r.care_instructions),
  originCountry: opt(r.origin_country),
  season: opt(r.season),
  note: opt(r.note),
  photoPath: r.photo_path,
  listedAt: r.listed_at,
  mine: Boolean(r.mine),
});

const mapMyListing = (r: any): MySwapListing => ({
  id: r.listing_id,
  itemId: r.item_id ?? null,
  audience: r.audience,
  status: r.status,
  name: r.name,
  size: opt(r.size),
  condition: cond(r.condition),
  note: opt(r.note),
  photoPath: r.photo_path,
  listedAt: r.listed_at,
  expiresAt: r.expires_at,
  openOffers: r.open_offers ?? 0,
  inAcceptedSwap: Boolean(r.in_accepted_swap),
  stale: Boolean(r.stale),
});

const mapSummary = (r: any): SwapSummary => ({
  id: r.swap_id,
  status: r.status,
  closedReason: opt(r.closed_reason),
  role: r.role,
  pairKind: r.pair_kind,
  otherLabel: r.other_label,
  bucket: r.bucket,
  attention: Boolean(r.attention),
  giveNames: r.give_names ?? [],
  getNames: r.get_names ?? [],
  thumbPath: opt(r.thumb_path),
  iDone: Boolean(r.i_done),
  theyDone: Boolean(r.they_done),
  createdAt: r.created_at,
  lastEventAt: r.last_event_at,
  expiresAt: r.expires_at,
});

const mapDetail = (j: any): SwapDetail => ({
  id: j.id,
  status: j.status,
  closedReason: j.closedReason ?? null,
  role: j.role,
  pairKind: j.pairKind,
  otherLabel: j.otherLabel,
  createdAt: j.createdAt,
  expiresAt: j.expiresAt,
  closedAt: j.closedAt ?? null,
  iDone: Boolean(j.iDone),
  theyDone: Boolean(j.theyDone),
  autoCompleted: Boolean(j.autoCompleted),
  items: (j.items ?? []).map((i: any): SwapItemView => ({ ...i, condition: cond(i.condition), photoPending: Boolean(i.photoPending), removalPending: Boolean(i.removalPending) })),
  messages: (j.messages ?? []).map((m: any): SwapMessage => ({ id: Number(m.id), kind: m.kind, code: m.code ?? null, body: m.body ?? null, mine: Boolean(m.mine), createdAt: m.createdAt })),
  actions: {
    canAccept: Boolean(j.actions?.canAccept),
    canDecline: Boolean(j.actions?.canDecline),
    canCancel: Boolean(j.actions?.canCancel),
    canComplete: Boolean(j.actions?.canComplete),
    canMessage: Boolean(j.actions?.canMessage),
    messagesLeft: Number(j.actions?.messagesLeft ?? 0),
  },
});

// ─── settings and terms ──────────────────────────────────────────────────────

export const getSwapSettings = async (): Promise<SwapSettings> => call<SwapSettings>('get_swap_settings');

/** Cheap; for the Home badge. Never throws: a failure is 0. */
export const getSwapBadge = async (): Promise<number> => {
  try {
    const n = await call<number>('get_swap_badge');
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
};

/**
 * Records that the member agreed to the terms text in this build. The version sent is SWAP_TERMS_VERSION and
 * cannot be passed in, so a member only ever agrees to text they were shown; the server refuses any version
 * other than its own current one (`terms_version_mismatch`), and useSwapAccess does not even ask when the two differ.
 */
export const acceptSwapTerms = async (): Promise<void> => {
  await call('accept_swap_terms', { p_version: SWAP_TERMS_VERSION });
};

/** Joins the community tier. The 18+ and photo-check acknowledgements are recorded against SWAP_TERMS_VERSION, as above. */
export const joinSwapCommunity = async (input: { alias: string; adult: boolean; photoScanOk: boolean }): Promise<void> => {
  await call('join_swap_community', { p_alias: input.alias, p_adult: input.adult, p_photo_scan_ok: input.photoScanOk, p_terms_version: SWAP_TERMS_VERSION });
};

export const leaveSwapCommunity = async (): Promise<void> => {
  await call('leave_swap_community');
};

// ─── my listings ─────────────────────────────────────────────────────────────

export const listMySwapListings = async (): Promise<MySwapListing[]> =>
  (await call<any[]>('list_my_swap_listings')).map(mapMyListing);

/**
 * Opens a closet piece to swap. The edge function checks the piece and its photo, copies the
 * photo into the private swap-photos bucket (and, for the community, strips its metadata and
 * checks it), then creates the listing. Opening the same piece again replaces its listing.
 */
export const publishSwapListing = async (input: PublishSwapInput): Promise<{ listingId: string }> => {
  await requireSession();
  const { data, error } = await supabase.functions.invoke('swap-media', {
    method: 'POST',
    body: { action: 'publish', itemId: input.itemId, audience: input.audience, note: input.note ?? null },
  });
  if (error) throw await toSwapErrorFromFunction(error);
  const listingId = (data as any)?.listingId;
  if (typeof listingId !== 'string') throw new SwapError('unknown', 'publish returned no listing id');
  return { listingId };
};

export const updateSwapListingNote = async (listingId: string, note: string): Promise<void> => {
  await call('update_swap_listing', { p_listing_id: listingId, p_note: note });
};
export const withdrawSwapListing = async (listingId: string): Promise<void> => { await call('withdraw_swap_listing', { p_listing_id: listingId }); };
export const renewSwapListing = async (listingId: string): Promise<void> => { await call('renew_swap_listing', { p_listing_id: listingId }); };
/** Community -> friends only. */
export const narrowSwapListing = async (listingId: string): Promise<void> => { await call('narrow_swap_listing', { p_listing_id: listingId }); };

// ─── the rack ────────────────────────────────────────────────────────────────

export const browseSwapListings = async (q: SwapBrowseQuery): Promise<SwapBrowsePage> => {
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 40);
  const rows = await call<any[]>('browse_swap_listings', {
    p_scope: q.scope,
    p_category: q.category ?? null,
    p_size: q.size ?? null,
    p_conditions: q.conditions && q.conditions.length ? q.conditions : null,
    p_q: q.q?.trim() || null,
    p_friend_id: q.friendId ?? null,
    p_same_owner_as: q.sameOwnerAs ?? null,
    p_before_ts: q.cursor?.ts ?? null,
    p_before_id: q.cursor?.id ?? null,
    p_limit: limit,
  });
  const items = rows.map(mapListing);
  const last = items[items.length - 1];
  return { items, nextCursor: items.length === limit && last ? { ts: last.listedAt, id: last.id } : null };
};

export const getSwapListing = async (listingId: string): Promise<SwapListing> => {
  const rows = await call<any[]>('get_swap_listing', { p_listing_id: listingId });
  if (!rows?.[0]) throw new SwapError('swap_unavailable');
  return mapListing(rows[0]);
};

// ─── proposals, inbox, thread ────────────────────────────────────────────────

export const proposeSwap = async (input: ProposeSwapInput): Promise<string> =>
  call<string>('propose_swap', {
    p_request_listing_ids: input.requestListingIds,
    p_offer_listing_ids: input.offerListingIds,
    p_note: input.note?.trim() || null,
    p_client_ref: input.clientRef,
  });

export const listMySwaps = async (limit = 100): Promise<SwapSummary[]> =>
  (await call<any[]>('list_my_swaps', { p_limit: limit })).map(mapSummary);

/** afterMessageId: only newer messages (for polling); merge them into the ones you have. */
export const getSwap = async (swapId: string, afterMessageId = 0): Promise<SwapDetail> =>
  mapDetail(await call<any>('get_swap', { p_swap_id: swapId, p_after: afterMessageId }));

export const respondToSwap = async (swapId: string, action: 'accept' | 'decline'): Promise<'accepted' | 'declined' | 'unavailable'> =>
  call('respond_to_swap', { p_swap_id: swapId, p_action: action });

export const cancelSwap = async (swapId: string): Promise<void> => { await call('cancel_swap', { p_swap_id: swapId }); };

/** clientRef makes a retry after a dropped connection safe. Returns the message id. */
export const sendSwapMessage = async (swapId: string, body: string, clientRef: string): Promise<number> =>
  Number(await call<number>('send_swap_message', { p_swap_id: swapId, p_body: body, p_client_ref: clientRef }));

// ─── the hand-off ────────────────────────────────────────────────────────────

type Received = { claimedItemId: string; listingId: string; photoPath: string | null; name: string };
type CompleteReply = { status: string; completed: boolean; received: Received[]; toRemove: Array<{ itemId: string; name: string }> };

const importReceivedPhoto = async (r: Received): Promise<'done' | 'retry' | 'gone'> => {
  if (!r.photoPath) return 'gone';
  // No link is "retry" (offline, a failed call) unless signing worked and said the object is not there or not
  // visible any more (a swap closed as unavailable, a listing photo already cleaned up): that never comes back.
  const missing = new Set<string>();
  const signed = (await signSwapPhotos([r.photoPath], { missing })).get(r.photoPath);
  if (!signed) return missing.has(r.photoPath) ? 'gone' : 'retry';
  const tmp = `${RNFS.CachesDirectoryPath}/swap_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
  try {
    const res = await RNFS.downloadFile({ fromUrl: signed, toFile: tmp }).promise;
    if (res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 404) return 'gone';
    if (res.statusCode !== 200) return 'retry';
    const stored = await copyImageToPermanentStorage(`file://${tmp}`);
    if (!stored.startsWith('http')) return 'retry';             // upload failed; keep the local copy out of the row
    const { error } = await supabase
      .from('clothing_items')
      .update({ user_image: canonicalizeImageUrl(stored) })
      .eq('id', r.claimedItemId);
    return error ? 'retry' : 'done';
  } catch {
    return 'retry';
  } finally {
    RNFS.unlink(tmp).catch(() => {});
  }
};

const runHandoff = async (swapId: string, opts: { keepGiven?: boolean }): Promise<HandoffResult> => {
  const reply = await call<CompleteReply>('swap_complete_my_side', { p_swap_id: swapId, p_keep_given: Boolean(opts.keepGiven) });

  const acked: string[] = [];
  let photosPending = 0;
  for (const r of reply.received ?? []) {
    const outcome = await importReceivedPhoto(r);
    if (outcome === 'retry') photosPending++;
    else acked.push(r.claimedItemId);
  }
  if (acked.length) {
    try { await call('swap_ack_photo', { p_swap_id: swapId, p_claimed_item_ids: acked }); } catch { photosPending += acked.length; }
  }

  const removed: string[] = [];
  let removalsPending = 0;
  for (const g of reply.toRemove ?? []) {
    try { await deleteClothingItem(g.itemId); removed.push(g.itemId); } catch { removalsPending++; }
  }
  return {
    completed: Boolean(reply.completed),
    receivedItemIds: (reply.received ?? []).map(r => r.claimedItemId),
    photosPending,
    removedItemIds: removed,
    removalsPending,
  };
};

// The server hands back the same pieces until each photo is acknowledged, so two runs at once for one swap
// (the thread's resume racing a slow first run) would import every photo twice. A second caller joins the
// run in progress. Keyed on the swap alone: keepGiven only counts on the first tap, which started the run.
const handoffs = new Map<string, Promise<HandoffResult>>();

/**
 * "We swapped!" for the signed-in member, and the clean-up that follows. Safe to call again
 * after an interruption (the swap screen and the inbox's "Finishing touches" do): it only
 * finishes what is still open. In order: the server adds the received pieces to this
 * member's closet, the app copies their photos into the member's own folder, and the pieces
 * they gave are removed from their closet (unless keepGiven). Nothing in the other member's
 * closet is touched.
 */
export const completeSwapHandoff = (swapId: string, opts: { keepGiven?: boolean } = {}): Promise<HandoffResult> => {
  const running = handoffs.get(swapId);
  if (running) return running;
  const p: Promise<HandoffResult> = runHandoff(swapId, opts).finally(() => {
    if (handoffs.get(swapId) === p) handoffs.delete(swapId);
  });
  handoffs.set(swapId, p);
  return p;
};

// ─── safety ──────────────────────────────────────────────────────────────────

export const reportSwapContent = async (input: {
  refType: SwapReportRefType; refId: string; reason: SwapReportReason; details?: string; messageId?: number;
}): Promise<void> => {
  await call('report_swap_content', {
    p_ref_type: input.refType,
    p_ref_id: input.refId,
    p_reason: input.reason,
    p_details: input.details?.trim().slice(0, 500) || null,
    p_message_id: input.messageId ?? null,
  });
};

/** Blocks the owner of a listing or the other member of a swap. Friends are blocked like block_user; others by alias. */
export const blockSwapMember = async (refType: SwapReportRefType, refId: string): Promise<void> => {
  await call('block_swap_member', { p_ref_type: refType, p_ref_id: refId });
};

export const listSwapBlocks = async (): Promise<SwapBlock[]> =>
  (await call<any[]>('list_swap_blocks')).map(r => ({ ref: r.ref, label: r.label, blockedAt: r.blocked_at }));

export const unblockSwapMember = async (ref: string): Promise<void> => { await call('unblock_swap_member', { p_ref: ref }); };

// ─── export ──────────────────────────────────────────────────────────────────

export const exportMySwapData = async (): Promise<SwapExport> => call<SwapExport>('export_my_swap_data');

/** Audience the signed-in member can choose from (community only when the server says so). */
export const audiencesFor = (s: Pick<SwapSettings, 'communityAvailable' | 'communityJoined'>): SwapAudience[] =>
  s.communityAvailable && s.communityJoined ? ['friends', 'community'] : ['friends'];

export const MAX_PIECES_PER_SIDE = SWAP_LIMITS.items_per_side;

/**
 * Whether a closet piece is open to swap and whether it is locked into an accepted swap. Never
 * throws: for a guest, offline, or a server without swaps it says "not listed".
 */
export const getItemSwapState = async (itemId: string): Promise<{ listing: MySwapListing | null; inAcceptedSwap: boolean }> => {
  try {
    const mine = await listMySwapListings();
    const listing = mine.find(l => l.itemId === itemId && ['active', 'reserved', 'held'].includes(l.status)) ?? null;
    return { listing, inAcceptedSwap: Boolean(listing?.inAcceptedSwap) };
  } catch {
    return { listing: null, inAcceptedSwap: false };
  }
};
