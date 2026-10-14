import type { SwapErrorCode } from '../types/swap';

/** An error from a swap function or the swap-media function, in a form screens can branch on. */
export class SwapError extends Error {
  code: SwapErrorCode;
  /** text_not_allowed: the field ("note", "message", "details" for the rest of the card, ...). swap_rate_limited: the counter that ran out. listing_incomplete: what is missing, comma separated. */
  detail?: string;
  /** text_not_allowed: 'payment' | 'contact' | 'content'. */
  hint?: string;
  constructor(code: SwapErrorCode, message?: string, detail?: string, hint?: string) {
    super(message ?? code);
    this.name = 'SwapError';
    this.code = code;
    this.detail = detail;
    this.hint = hint;
  }
}

const KNOWN: SwapErrorCode[] = [
  'not_authenticated', 'swaps_disabled', 'swap_terms_required', 'swap_suspended', 'community_unavailable',
  'community_not_joined', 'account_too_new', 'swap_unavailable', 'swap_not_open', 'invalid_swap', 'invalid_note',
  'invalid_message', 'offer_not_allowed', 'text_not_allowed', 'already_proposed', 'item_reserved', 'item_not_found',
  'listing_incomplete', 'listing_held', 'swap_rate_limited', 'swap_open_limit', 'recipient_busy', 'listing_busy', 'swap_cooldown',
  'swap_message_limit', 'swap_listing_limit', 'report_rate_limited', 'invalid_report', 'alias_invalid', 'alias_taken',
  'adult_required', 'scan_ack_required', 'terms_version_mismatch', 'photo_rejected', 'moderation_unavailable',
  'unsupported_image', 'photo_too_large',
];

/**
 * Turns whatever supabase-js (PostgREST or Functions) threw into a SwapError.
 * PostgREST puts our RAISE text in `message`, DETAIL in `details` and HINT in `hint`.
 */
export const toSwapError = (error: any): SwapError => {
  if (error instanceof SwapError) return error;
  const message = `${error?.message ?? ''}`;
  const status = error?.status ?? error?.context?.status;
  if (error?.code === 'PGRST202' || error?.code === '42883' || status === 404 || /could not find the function/i.test(message)) {
    return new SwapError('not_deployed', message);
  }
  if (error?.code === '54000' && /report_rate_limited/.test(message)) return new SwapError('report_rate_limited', message);
  const known = KNOWN.find(code => message.includes(code));
  if (known) return new SwapError(known, message, error?.details || undefined, error?.hint || undefined);
  // supabase-js reports a dropped connection to an edge function as FunctionsFetchError, whose message
  // ("Failed to send a request to the Edge Function") says nothing about the network. It also wraps aborts and timeouts.
  if (/network request failed|failed to fetch|network error|timed out|offline/i.test(message) || error?.name === 'TypeError' || error?.name === 'FunctionsFetchError') {
    return new SwapError('offline', message);
  }
  return new SwapError('unknown', message);
};

/** The swap-media function answers { error: <code>, ... } with a non-2xx status. */
export const toSwapErrorFromFunction = async (error: any): Promise<SwapError> => {
  try {
    const body = await error?.context?.json?.();
    const code = typeof body?.error === 'string' ? body.error : '';
    const known = KNOWN.find(c => c === code);
    if (known) return new SwapError(known, code, body?.detail, body?.reason);
  } catch {
    // fall through to the generic mapping
  }
  return toSwapError(error);
};

const FIELD_NAMES: Record<string, string> = { note: 'note', message: 'message', name: 'item name', brand: 'brand', color: 'colour', size: 'size', alias: 'alias', details: 'item details' };

/** Plain-language text for a person. `fallback` is used for anything unexpected. */
export const swapErrorMessage = (error: unknown, fallback: string): string => {
  const e = toSwapError(error);
  switch (e.code) {
    case 'not_authenticated': return 'Sign in to swap.';
    case 'swaps_disabled': return 'Swaps are paused right now. Please check back soon.';
    case 'community_unavailable': return 'Community swaps aren’t open yet.';
    case 'swap_terms_required': return 'Please read and accept the swap terms first.';
    case 'terms_version_mismatch': return 'The swap terms were updated. Please reopen swaps and accept them.';
    case 'community_not_joined': return 'Join community swaps first.';
    case 'account_too_new': return 'Community swaps unlock two days after you create your account.';
    case 'swap_suspended': return 'Swapping is paused on your account. Email support if you think this is a mistake.';
    case 'swap_unavailable':
    case 'item_not_found': return 'That piece or swap is no longer available.';
    case 'swap_not_open': return 'That swap has already changed. Here’s the latest.';
    case 'offer_not_allowed': return 'Pick pieces of yours that are open to swap.';
    case 'already_proposed': return 'You already have an open offer with this person.';
    case 'item_reserved': return 'That piece is locked into a swap right now.';
    case 'listing_held': return 'This piece can’t be listed right now. Email support if you think this is a mistake.';
    case 'invalid_swap': return 'Pick between one and three pieces on each side.';
    case 'invalid_note': return 'That note is too long.';
    case 'invalid_message': return 'Write a message of up to 500 characters.';
    case 'text_not_allowed': {
      const field = FIELD_NAMES[e.detail ?? ''] ?? 'text';
      if (e.hint === 'payment') return 'Swaps are item for item. Please don’t mention payments or gift cards.';
      if (e.hint === 'contact') return 'Keep contact details out until the swap is accepted.';
      return `That ${field} isn’t allowed. Please reword it.`;
    }
    case 'listing_incomplete': {
      const parts = (e.detail ?? '').split(',').filter(Boolean);
      return parts.length ? `Add a ${parts.join(' and ')} first.` : 'Add a photo of the piece first.';
    }
    case 'swap_rate_limited': return e.detail === 'browse_day'
      ? 'You’ve browsed a lot today. Please try again tomorrow.'
      : 'You’re going a bit fast. Please wait a moment and try again.';
    case 'swap_open_limit': return 'You have five open offers. Wait for answers or withdraw one.';
    case 'recipient_busy': return 'This person has a lot of offers waiting. Try again later.';
    case 'listing_busy': return 'This piece has a lot of offers. Try another or wait.';
    case 'swap_cooldown': return 'This person declined recently. You can offer again in a few days.';
    case 'swap_message_limit': return 'You’ve reached the message limit for this swap.';
    case 'swap_listing_limit': return 'You have the most pieces open to swap. Withdraw one to add another.';
    case 'report_rate_limited': return 'You’ve sent a lot of reports today. Please try again tomorrow.';
    case 'invalid_report': return 'Couldn’t send that report. Please try again.';
    case 'alias_invalid': return 'Choose an alias of 3 to 20 letters, numbers, spaces or . _ -, without staff-like or contact words.';
    case 'alias_taken': return 'That alias is taken. Try another.';
    case 'adult_required': return 'Community swaps are for people 18 and over.';
    case 'scan_ack_required': return 'Please agree to the photo check to list for the community.';
    case 'photo_rejected': return e.hint === 'people'
      ? 'Photos with people in them can’t be shared with the community. Try a flat-lay or hanger photo.'
      : 'That photo can’t be shared with the community.';
    case 'moderation_unavailable': return 'We couldn’t check that photo right now. Please try again in a moment.';
    case 'unsupported_image': return 'That photo can’t be used for a swap. Replace the photo of the piece and try again.';
    case 'photo_too_large': return 'That photo is too large. Please retake it.';
    case 'not_deployed': return 'Swaps aren’t available yet in this version. Please try again later.';
    case 'offline': return 'You seem to be offline. Check your connection and try again.';
    default: return fallback;
  }
};
