/**
 * Types for clothing swaps. Shapes mirror what the swap functions return (camelCase,
 * see supabase/migrations/20261015*). Nothing here ever carries another member's
 * account id or email: the server resolves who is who.
 */

import type { ItemCondition } from '../utils/itemCondition';
import type { MaterialComponent } from './clothing';

/** Who may see a listing. 'community' needs the server switch and the member's join. */
export type SwapAudience = 'friends' | 'community';

export type SwapStatus = 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'completed';

/**
 * Why a swap ended. 'unavailable' covers a block, an unfriend, a deleted or withdrawn piece,
 * an account that was deleted, a suspension and a safety removal, and never says which.
 */
export type SwapClosedReason =
  | 'declined'
  | 'cancelled_by_proposer'
  | 'cancelled_by_recipient'
  | 'unavailable'
  | 'expired'
  | 'completed';

export type SwapListingStatus = 'active' | 'reserved' | 'completed' | 'withdrawn' | 'held' | 'removed' | 'expired';
export type SwapRole = 'proposer' | 'recipient';

/** Where a swap sits in the inbox. */
export type SwapBucket = 'needs_you' | 'finishing' | 'in_progress' | 'waiting' | 'past';

/** 'friend' = shown under the friend's usual name; 'member' = shown under an alias. */
export type SwapOwnerKind = 'friend' | 'member';

export type SwapReportRefType = 'listing' | 'swap';
export type SwapReportReason =
  | 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'scam' | 'not_as_described' | 'unsafe' | 'other';

export interface SwapSettings {
  swapsEnabled: boolean;
  termsAccepted: boolean;
  /** Accepted the current version of the swap terms. */
  termsCurrent: boolean;
  currentTermsVersion: string;
  /** The server switch for the stranger tier is on. */
  communityAvailable: boolean;
  communityJoined: boolean;
  alias: string | null;
  adultConfirmed: boolean;
  suspended: boolean;
  /** Swaps waiting for this member (the Home badge). */
  needsYou: number;
}

/** A piece on the swap rack, as other members see it. */
export interface SwapListing {
  id: string;
  ownerLabel: string;
  ownerKind: SwapOwnerKind;
  audience: SwapAudience;
  name: string;
  category: string;
  subcategory?: string;
  brand?: string;
  color?: string;
  size?: string;
  condition?: ItemCondition;
  pattern?: string;
  materials?: MaterialComponent[];
  careInstructions?: string[];
  originCountry?: string;
  season?: string[];
  note?: string;
  /** Path inside the private swap-photos bucket; turn it into a link with signSwapPhotos. */
  photoPath: string;
  listedAt: string;
  mine: boolean;
}

/** One of the signed-in member's own listings. */
export interface MySwapListing {
  id: string;
  /** The closet piece it was made from; null once that piece was deleted. */
  itemId: string | null;
  audience: SwapAudience;
  status: SwapListingStatus;
  name: string;
  size?: string;
  condition?: ItemCondition;
  note?: string;
  photoPath: string;
  listedAt: string;
  expiresAt: string;
  /** Open proposals asking for this piece. */
  openOffers: number;
  inAcceptedSwap: boolean;
  /** The closet piece was edited after the listing was made; "Update" lists it again. */
  stale: boolean;
}

export interface SwapCursor { ts: string; id: string }

export interface SwapBrowseQuery {
  scope: SwapAudience;
  category?: string;
  size?: string;
  conditions?: ItemCondition[];
  q?: string;
  /** Friends scope only: just this friend's listings. */
  friendId?: string;
  /** Other listings by the owner of this listing. */
  sameOwnerAs?: string;
  cursor?: SwapCursor | null;
  limit?: number;
}

export interface SwapBrowsePage { items: SwapListing[]; nextCursor: SwapCursor | null }

export interface SwapSummary {
  id: string;
  status: SwapStatus;
  closedReason?: SwapClosedReason;
  role: SwapRole;
  pairKind: SwapAudience;
  otherLabel: string;
  bucket: SwapBucket;
  /** A dot: something new since this member last opened it. */
  attention: boolean;
  giveNames: string[];
  getNames: string[];
  thumbPath?: string;
  iDone: boolean;
  theyDone: boolean;
  createdAt: string;
  lastEventAt: string;
  expiresAt: string;
}

export interface SwapItemView {
  listingId: string | null;
  /** 'offer' = the proposer gives it; 'request' = the recipient gives it. */
  side: 'offer' | 'request';
  /** The signed-in member gives this piece. */
  mine: boolean;
  name: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  color?: string;
  size?: string;
  condition?: ItemCondition;
  pattern?: string;
  materials?: MaterialComponent[];
  careInstructions?: string[];
  originCountry?: string;
  season?: string[];
  note?: string;
  photoPath?: string | null;
  /** For a piece this member receives: the closet row created for them, once they tapped "We swapped!". */
  claimedItemId?: string | null;
  /** The received piece still needs its photo copied into the member's own folder. */
  photoPending: boolean;
  /** For a piece this member gives: their own closet row. */
  giverItemId?: string | null;
  /** This member tapped "We swapped!" and their own piece is still in their closet. */
  removalPending: boolean;
}

export interface SwapMessage {
  id: number;
  kind: 'text' | 'system';
  /** System lines: proposed, accepted, declined, cancelled_by_proposer, cancelled_by_recipient, unavailable, expired, completed. */
  code?: string | null;
  body?: string | null;
  mine: boolean;
  createdAt: string;
}

/** What the signed-in member may do now. The server decides; the app only draws buttons. */
export interface SwapActions {
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canMessage: boolean;
  messagesLeft: number;
}

export interface SwapDetail {
  id: string;
  status: SwapStatus;
  closedReason?: SwapClosedReason | null;
  role: SwapRole;
  pairKind: SwapAudience;
  otherLabel: string;
  createdAt: string;
  expiresAt: string;
  closedAt?: string | null;
  iDone: boolean;
  theyDone: boolean;
  autoCompleted: boolean;
  items: SwapItemView[];
  messages: SwapMessage[];
  actions: SwapActions;
}

export interface ProposeSwapInput {
  requestListingIds: string[];
  offerListingIds: string[];
  note?: string;
  /** A new uuid per attempt; a retry with the same value returns the same swap. */
  clientRef: string;
}

export interface PublishSwapInput { itemId: string; audience: SwapAudience; note?: string }

export interface HandoffResult {
  /** Both members have tapped "We swapped!" (or the swap was finished for them). */
  completed: boolean;
  /** Closet rows created for the pieces this member received. */
  receivedItemIds: string[];
  /** Received pieces whose photo could not be copied yet; call completeSwapHandoff again later. */
  photosPending: number;
  /** This member's own pieces removed from their closet. */
  removedItemIds: string[];
  /** Own pieces that still need removing (the app was interrupted); call again to finish. */
  removalsPending: number;
}

export interface SwapBlock { ref: string; label: string; blockedAt: string }

export type SwapErrorCode =
  | 'not_authenticated' | 'swaps_disabled' | 'swap_terms_required' | 'swap_suspended'
  | 'community_unavailable' | 'community_not_joined' | 'account_too_new'
  | 'swap_unavailable' | 'swap_not_open' | 'invalid_swap' | 'invalid_note' | 'invalid_message' | 'offer_not_allowed'
  | 'text_not_allowed' | 'already_proposed' | 'item_reserved' | 'item_not_found' | 'listing_incomplete' | 'listing_held'
  | 'swap_rate_limited' | 'swap_open_limit' | 'recipient_busy' | 'listing_busy' | 'swap_cooldown'
  | 'swap_message_limit' | 'swap_listing_limit' | 'report_rate_limited' | 'invalid_report'
  | 'alias_invalid' | 'alias_taken' | 'adult_required' | 'scan_ack_required' | 'terms_version_mismatch'
  | 'photo_rejected' | 'moderation_unavailable' | 'unsupported_image' | 'photo_too_large'
  | 'not_deployed' | 'offline' | 'unknown';

export interface SwapExport {
  settings: Record<string, unknown> | null;
  listings: Array<Record<string, unknown>>;
  swaps: Array<Record<string, unknown>>;
}
