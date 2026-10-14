/**
 * Wording for swap states, in one place so every screen says the same thing.
 * Pure functions; no React, no network.
 */
import type { SwapBucket, SwapClosedReason, SwapListing, SwapRole, SwapStatus } from '../types/swap';
import { conditionLabel } from './itemCondition';

/** A random version-4 uuid. React Native has no crypto.randomUUID; this only needs to be unique per attempt. */
export const newClientRef = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const BUCKET_TITLES: Record<SwapBucket, string> = {
  needs_you: 'Needs you',
  finishing: 'Finishing touches',
  in_progress: 'In progress',
  waiting: 'Waiting on them',
  past: 'Past swaps',
};

/** Section order in the inbox. */
export const BUCKET_ORDER: SwapBucket[] = ['needs_you', 'finishing', 'in_progress', 'waiting', 'past'];

/** The short status shown on a swap row or at the top of a thread. */
export const statusLabel = (s: { status: SwapStatus; closedReason?: SwapClosedReason | null; role: SwapRole }): string => {
  switch (s.status) {
    case 'proposed': return s.role === 'recipient' ? 'Waiting for your answer' : 'Waiting for their answer';
    case 'accepted': return 'Accepted';
    case 'completed': return 'Swapped';
    case 'expired': return 'Expired';
    case 'declined': return s.role === 'recipient' ? 'You declined' : 'Declined';
    case 'cancelled':
      switch (s.closedReason) {
        case 'cancelled_by_proposer': return s.role === 'proposer' ? 'You cancelled' : 'They cancelled';
        case 'cancelled_by_recipient': return s.role === 'recipient' ? 'You cancelled' : 'They cancelled';
        default: return 'No longer available';
      }
    default: return '';
  }
};

/**
 * The sentence under a closed swap. It never says why a swap became unavailable. iDone is the member's own
 * "We swapped!" tap: when the other member cancelled after it, the sentence says what that means for the
 * piece the member already added.
 */
export const closedExplanation = (s: { status: SwapStatus; closedReason?: SwapClosedReason | null; role: SwapRole; iDone?: boolean }): string | null => {
  if (s.status === 'proposed' || s.status === 'accepted') return null;
  if (s.status === 'completed') return 'This swap is done.';
  if (s.status === 'expired') return 'This swap ran out of time. You can browse the swap board for something else.';
  if (s.status === 'declined') {
    return s.role === 'recipient' ? 'You declined this offer.' : 'They declined this offer. You can offer again in a few days.';
  }
  if (s.closedReason === 'cancelled_by_proposer' || s.closedReason === 'cancelled_by_recipient') {
    if (statusLabel(s) === 'You cancelled') return 'You cancelled this swap.';
    return s.iDone
      ? 'They cancelled this swap after you tapped “We swapped!”. The piece you added stays in your closet. If the swap did happen, report it from the menu.'
      : 'They cancelled this swap.';
  }
  return 'This swap is no longer available. A piece may have been removed or changed, or the other person may have left. You can browse the swap board for something else.';
};

/** Text for the grey system lines inside a thread. */
export const systemLineText = (code: string | null | undefined): string => {
  switch (code) {
    case 'proposed': return 'Offer sent';
    case 'accepted': return 'Accepted. Both pieces are set aside for this swap.';
    case 'declined': return 'Declined';
    case 'cancelled_by_proposer':
    case 'cancelled_by_recipient': return 'Cancelled';
    case 'unavailable': return 'No longer available';
    case 'expired': return 'Expired';
    case 'completed': return 'Swapped!';
    default: return '';
  }
};

export type Fact = { label: string; value: string };

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The rows of a listing's detail card; empty values are left out. */
export const listingFacts = (l: Pick<SwapListing, 'brand' | 'size' | 'condition' | 'color' | 'materials' | 'careInstructions' | 'originCountry' | 'season'>): Fact[] => {
  const materials = (l.materials ?? [])
    .map(m => (m.percentage ? `${m.percentage}% ${m.name}` : m.name))
    .join(', ');
  const rows: Array<[string, string | undefined]> = [
    ['Brand', l.brand],
    ['Size', l.size],
    ['Condition', conditionLabel(l.condition)],
    ['Colour', l.color ? titleCase(l.color) : undefined],
    ['Materials', materials],
    ['Care', l.careInstructions?.join(', ')],
    ['Made in', l.originCountry],
    ['Season', l.season?.map(titleCase).join(', ')],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1])).map(([label, value]) => ({ label, value }));
};

/** "Ann · Friend" or "Velvet Otter · Member". */
export const ownerLine = (l: Pick<SwapListing, 'ownerLabel' | 'ownerKind'>): string =>
  `${l.ownerLabel} · ${l.ownerKind === 'friend' ? 'Friend' : 'Member'}`;

/** "Blue blazer for Linen shirt" / "Blue blazer and 1 more for Linen shirt". */
export const swapTitle = (give: string[], get: string[]): string => {
  const side = (names: string[]) => (names.length <= 1 ? names[0] ?? '' : `${names[0]} and ${names.length - 1} more`);
  return `${side(give)} for ${side(get)}`;
};
