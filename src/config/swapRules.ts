/**
 * Everything a person reads about swaps, and every number that limits them, in one place.
 * The numbers must match public.swap_limit() in the database (a Jest test compares this
 * file with supabase/migrations/20261015000100_swap_foundation.sql), and
 * SWAP_TERMS_VERSION must match the swap_config terms_version row.
 */
import { SUPPORT_EMAIL } from './legal';

/**
 * The version of the SWAP_TERMS text in this build. Bump together with swap_config 'terms_version'; members are
 * asked to accept again. A member only ever agrees to this version: the app sends this constant, never the
 * server's value, and shows "update" when the two differ (useSwapAccess).
 */
export const SWAP_TERMS_VERSION = '2026-10';

export const SWAP_LIMITS = {
  items_per_side: 3,
  note_max: 140,
  proposal_note_max: 280,
  message_max: 500,
  open_outbound: 5,
  open_inbound: 20,
  open_per_requested_listing: 8,
  open_per_offered_listing: 3,
  messages_per_swap: 200,
  preaccept_messages_stranger: 3,
  decline_cooldown_days: 7,
  listings_live: 30,
  listings_community: 15,
  propose_day: 15,
  propose_stranger_day: 5,
  publish_day: 20,
  browse_day: 400,
  respond_day: 60,
  cancel_day: 30,
  complete_day: 30,
  message_min: 6,
  message_hour: 60,
  message_day: 300,
  block_day: 30,
  reports_day: 20,
  reports_to_hold_listing: 3,
} as const;

export const SWAP_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$/;
export const SWAP_PROPOSAL_EXPIRES_DAYS = 14;
export const SWAP_ACCEPTED_EXPIRES_DAYS = 30;
export const SWAP_LISTING_EXPIRES_DAYS = 60;
/** How often an open thread asks for news, in milliseconds, while it is on screen. */
export const SWAP_THREAD_POLL_MS = 15000;
/** Signed photo links last this long (seconds). Short on purpose: a withdrawn or blocked photo stops loading. */
export const SWAP_PHOTO_TTL_SECONDS = 600;

export const SWAP_NOTICE =
  'Swaps are item for item. SmartCloset doesn’t handle money or shipping and can’t check or insure any piece, so look it over before you tap “We swapped!”.';

export const SWAP_NO_MONEY_LINE = 'Swaps are item for item. No money, deposits or gift cards.';

export const SWAP_COMMUNITY_SCAN_NOTICE =
  'Photos you list for the community are checked for unsafe content and people by Google Cloud Vision before they appear. This happens even if you turned off AI photo analysis. Photos you list for friends only are never sent to Google.';

export const SWAP_TERMS = {
  title: 'Swap terms',
  sections: [
    {
      heading: 'What swaps are',
      body: 'A swap is one piece (or a few) for one piece (or a few), between two people. No money, deposits or gift cards change hands. SmartCloset is not a party to any swap, doesn’t inspect or insure pieces, and can’t settle disputes. You are responsible for how and where you meet or ship, including any customs.',
    },
    {
      heading: 'What others can see',
      body: 'For each piece you open to swap: its photo, name, brand, size, condition, materials, care, country of origin, season and your short note. Never what you paid, your private notes, how often you wear it, your email or your location. Friends see your usual name. Community members see only your alias.',
    },
    {
      heading: 'Rules',
      body: 'Only offer pieces you own, and describe them honestly, flaws included. Photos show the piece only: no faces, other people or children. No counterfeits. No used underwear or swimwear. No harassment, hate or sexual content in listings, aliases or messages. Never ask for money, and don’t move the conversation off the app before a swap is accepted.',
    },
    {
      heading: 'Messages',
      body: 'Messages in a swap are stored on our servers, are not end-to-end encrypted, and are read by us only when someone reports them or to keep the service running. They are deleted 30 days after the swap ends.',
    },
    {
      heading: 'Reports and enforcement',
      body: 'There is no tolerance for objectionable content or abusive behaviour. Reports are reviewed by a person, aiming for within 24 hours. We may remove listings and suspend accounts that break these rules.',
    },
    {
      heading: 'Your photos',
      body: 'By opening a piece to swap you let SmartCloset show its photo to the people you choose until you withdraw it. A withdrawn listing’s photo is deleted within about 30 days.',
    },
  ],
} as const;

export const SWAP_GUIDELINES = {
  title: 'Swap guidelines',
  intro: 'Swaps work because people are honest and kind. To keep them safe:',
  rules: [
    'Only offer pieces that are yours, and describe them honestly: size, condition and any flaws.',
    'Photos show the piece only. No faces, other people or children.',
    'No counterfeits, and no used underwear or swimwear.',
    'Swaps are item for item. Never ask for money, deposits or gift cards.',
    'Be kind. No harassment, hate or sexual content in listings, names or messages.',
    'Keep talking in the app until a swap is accepted.',
  ],
  enforcement:
    'You can report or block anyone from their listing or from a swap. We review reports, aiming for within 24 hours, and may remove listings or suspend accounts. Blocking is private; they aren’t told.',
  contact: `Questions or urgent concerns? Email ${SUPPORT_EMAIL}.`,
} as const;

export const SWAP_SAFETY_TIPS = [
  'Keep chatting in the app until you trust the person, and don’t share your home address, phone or email before you’re comfortable.',
  'Meet in a busy public place in daylight and tell a friend, or use tracked shipping.',
  'Check the piece against its photos before you tap “We swapped!”, and wash it before you wear it.',
  'Walk away from pressure, urgency, or any request for money or gift cards.',
  'Report or block from the menu if anything feels off.',
  'SmartCloset doesn’t inspect, guarantee or insure swaps.',
] as const;

export const SWAP_REPORT_REASONS = [
  { value: 'spam', label: 'Spam or unwanted messages' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'scam', label: 'Asks for money or steers me off the app' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'unsafe', label: 'Unsafe or no-show meetup' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
] as const;

export const SWAP_QUICK_REPLIES = [
  'Sounds good!',
  'Where should we meet?',
  'Can you share a measurement?',
  'Is it still available?',
] as const;

/** Client-side reader warning for messages that look like payment or off-app talk (a hint, never a block). */
export const looksLikePaymentTalk = (text: string): boolean =>
  /(venmo|paypal|zelle|cash ?app|apple pay|gift ?card|wire transfer|western union|bitcoin|\bcrypto\b|send (me )?(the )?money|\bdeposit\b)/i.test(text);

export const SWAP_PAYMENT_WARNING =
  'Swaps here are item for item. Don’t send money or gift cards.';

/** This build's terms are older than the server's: it cannot show the text the member would be agreeing to. */
export const SWAP_UPDATE_REQUIRED_MESSAGE = 'Update SmartCloset to keep using swaps. The swap terms have changed and this version can’t show them.';
/** This build's terms are newer than the server's (a release that went out before the database change). */
export const SWAP_SERVER_BEHIND_MESSAGE = 'Swaps are being updated. Please try again in a little while.';

export const SWAP_PAUSED_MESSAGE = 'Swaps are paused right now. Please check back soon.';
export const SWAP_NOT_DEPLOYED_MESSAGE = 'Swaps aren’t available yet in this version. Please try again later.';
