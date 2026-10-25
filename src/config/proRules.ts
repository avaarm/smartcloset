/**
 * Everything a person reads about professional accounts (stylists and their clients), and every number that
 * limits them, in one place (documentation/design/pro-accounts.md 7.5 and Appendix A).
 *
 * The numbers must match public.pro_limit() in the database and the text lengths the table constraints
 * enforce (proRulesInStepWithSql.test.ts compares this file with the migrations); the three versions must
 * match the pro_config rows. The wording is copied from Appendix A; no screen retypes it.
 */
import { SUPPORT_EMAIL } from './legal';

/**
 * The versions of the texts in this build. Bump together with the pro_config rows; people are asked to accept
 * again. A person only ever agrees to these versions: the service sends the constant, never the server's value,
 * and the app shows "update" when the two differ (useProAccess).
 */
export const PRO_STYLIST_TERMS_VERSION = '2026-10';
export const PRO_CLIENT_TERMS_VERSION = '2026-10';
/** The version of PRO_SHARE_CONSENT. set_pro_grant refuses a stale one when sharing is turned on or renewed. */
export const PRO_SHARE_TEXT_VERSION = '2026-10';

/** Mirrors public.pro_limit(name) (4.3). Names ending _min, _hour or _day are counters; the rest are plain caps. */
export const PRO_LIMITS = {
  terms_day: 20,
  profile_day: 6,
  invite_day: 5,
  invite_lookup_hour: 10,
  redeem_day: 10,
  alias_day: 10,
  end_day: 30,
  block_day: 30,
  grant_day: 60,
  closet_page_day: 600,
  recommend_day: 60,
  send_look_day: 30,
  feedback_day: 60,
  appointment_day: 20,
  respond_day: 60,
  message_min: 6,
  message_hour: 60,
  message_day: 300,
  message_retention_days: 180,
  ended_message_retention_days: 30,
  churn_connections: 10,
  photo_day: 3000,
  qualified_reporter_hours: 48,
  qualified_connection_messages: 3,
  evidence_body_chars: 300,
  stylist_clients: 25,
  stylist_clients_probation: 3,
  invites_live: 10,
  invites_live_probation: 1,
  invite_expiry_days: 7,
  client_connections: 5,
  items_per_look: 12,
  grant_items_max: 500,
  drafts_per_connection: 30,
  appointments_open_per_connection: 5,
  appointment_lead_minutes: 60,
  appointment_max_days_ahead: 180,
  grant_days: 90,
  grant_warn_days: 7,
  closet_page_size: 60,
  closet_pages_connection_day: 200,
  reports_day: 20,
  reports_to_hold_stylist: 2,
  report_window_days: 14,
  ended_connection_retention_days: 90,
  churn_hours: 48,
  hold_release_days: 7,
  qualified_connection_hours: 24,
  evidence_bytes: 18000,
} as const;

/** Text lengths in characters, as the table constraints enforce them (3.4). A name, an alias and a label are also trimmed and checked by the server. */
export const PRO_TEXT_LIMITS = {
  display_name_min: 2,
  display_name_max: 40,
  headline: 80,
  bio: 500,
  rates: 120,
  alias_min: 2,
  alias_max: 30,
  label: 40,
  place: 120,
  session_note: 280,
  message: 500,
  look_title: 80,
  look_body: 1000,
  comment: 500,
  report_details: 500,
} as const;

/** The name a client shows a stylist, in characters. */
export const PRO_ALIAS_RANGE = { min: PRO_TEXT_LIMITS.alias_min, max: PRO_TEXT_LIMITS.alias_max } as const;

export const PRO_SERVICES_MAX = 7;
export const PRO_LANGUAGES_MAX = 5;
/** A session's length in minutes. */
export const PRO_DURATION = { min: 15, max: 480, step: 15 } as const;
/** The offset from UTC a session carries, in minutes east of UTC (UTC-12:00 to UTC+14:00, in quarter hours). */
export const PRO_UTC_OFFSET_RANGE = { min: -720, max: 840, step: 15 } as const;
export const PRO_RATING_RANGE = { min: 1, max: 5 } as const;

/** How often an open thread asks for news, in milliseconds, while it is on screen. */
export const PRO_POLL_MS = 15000;
/** How long the photo helper keeps a request it built, in seconds. There is no link to outlive a grant; this only bounds the memo. */
export const PRO_PHOTO_TTL_SECONDS = 600;

/** The closed list a stylist picks services from. The ids are what the server stores. */
export const PRO_SERVICES = [
  { id: 'wardrobe_audit', label: 'Wardrobe audit' },
  { id: 'personal_shopping', label: 'Personal shopping' },
  { id: 'outfit_styling', label: 'Outfit styling' },
  { id: 'color_analysis', label: 'Color analysis' },
  { id: 'event_styling', label: 'Event styling' },
  { id: 'virtual_sessions', label: 'Virtual sessions' },
  { id: 'in_person_sessions', label: 'In-person sessions' },
] as const;

export type ProServiceId = (typeof PRO_SERVICES)[number]['id'];

/** Languages a stylist can list (at most PRO_LANGUAGES_MAX). The server accepts any two lowercase letters; the app offers these. */
export const PRO_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'he', label: 'Hebrew' },
  { code: 'fa', label: 'Persian' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hy', label: 'Armenian' },
] as const;

export type ProLanguageCode = (typeof PRO_LANGUAGES)[number]['code'];

/** Offered in this order; the values are what report_pro_content accepts. */
export const PRO_REPORT_REASONS = [
  { value: 'spam', label: 'Spam or unwanted contact' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'false_credentials', label: "Claiming approval or qualifications they don't have" },
  { value: 'scam', label: 'Asking for money or a scam' },
  { value: 'unsafe', label: 'Something unsafe' },
  { value: 'unsafe_meeting', label: 'An unsafe in-person meeting' },
  { value: 'underage', label: 'Seems to be under 18' },
  { value: 'data_misuse', label: 'Misusing my information' },
  { value: 'other', label: 'Something else' },
] as const;

export interface ProTermsText {
  title: string;
  sections: readonly { heading: string; body: string }[];
}

/** A.1. Accepted by a stylist before a profile can be saved (version PRO_STYLIST_TERMS_VERSION). */
export const PRO_STYLIST_TERMS: ProTermsText = {
  title: 'Stylist terms',
  sections: [
    {
      heading: 'You are independent',
      body: 'You offer styling services as an independent professional. SmartCloset does not employ you, check your identity or qualifications, recommend you, guarantee your work or insure anyone. You are responsible for your services and for following the law where you work, including any license your work needs. Do not offer hair, makeup, skin, body-shaping, medical, dietary or weight-loss services through SmartCloset.',
    },
    {
      heading: 'Adults, and honesty',
      body: 'You are 18 or older. Your profile is true and is about you. Do not pretend to be another person, a business you do not run, or someone employed or approved by a shop, a brand or SmartCloset. SmartCloset does not verify, certify or rank anyone, so do not say it does.',
    },
    {
      heading: "Your clients' information",
      body: 'A client decides what you can see and can stop it at any moment. Use what you see only to help that client. Do not copy it, share it, republish it, sell it, use it to train any model, or keep it after the relationship ends. Do not contact a client outside the arrangements you made with them. Screenshots are covered by this rule. A photo can show more than clothes: if you see people, children or private details in one, do not keep, copy or share it, and report it if it worries you.',
    },
    {
      heading: 'No payments in SmartCloset',
      body: 'SmartCloset does not take payments, hold money or add fees. The rates in your profile are information you write. Agree payment with your client yourself, outside the app. Never ask for gift cards, cryptocurrency or wire transfers, and do not pressure anyone.',
    },
    {
      heading: 'Conduct',
      body: 'Be respectful. No harassment, threats, sexual content, hate or anything illegal or objectionable. We do not tolerate it. If you meet a client in person, choose a public place and follow the safety tips.',
    },
    {
      heading: 'Reports and enforcement',
      body: "Anyone you work with can report you. We review reports, as soon as we can. We may pause your invites, suspend or remove your stylist profile or your account, and limit the number of clients while you are new. Suspending someone is always a person's decision.",
    },
    {
      heading: 'Ending, and deleting',
      body: 'Either of you can end a connection at any time. If you close your stylist profile, your clients are disconnected and keep the looks and session records you already sent for about 90 days. If you delete your account, they keep them for the same time, labeled "Former stylist".',
    },
    {
      heading: 'Contact',
      body: `Questions or urgent concerns: ${SUPPORT_EMAIL}.`,
    },
  ],
};

/** A.2. Accepted by a client before connecting (version PRO_CLIENT_TERMS_VERSION). */
export const PRO_CLIENT_TERMS: ProTermsText = {
  title: 'Client terms',
  sections: [
    {
      heading: 'Independent professionals',
      body: 'Stylists on SmartCloset are independent. SmartCloset does not check, recommend, guarantee or insure them or their advice, and is not a party to anything you arrange with them.',
    },
    {
      heading: 'You decide what to share',
      body: "Connecting shares nothing. You can let your stylist see your closet (never your wishlist) for 90 days: all your pieces, including any you add while sharing is on, or only ones you choose. Do not share pieces whose photos show people, especially children; a photo can show more than the clothes. Turn it off at any time and they lose access straight away. We can't take back what they have already seen. Your stylist has agreed to use what they see only to help you.",
    },
    {
      heading: 'No payments',
      body: 'SmartCloset takes no payment. Any fee is agreed directly with your stylist. Never pay by gift card, cryptocurrency or wire transfer.',
    },
    {
      heading: 'Adults only',
      body: 'You are 18 or older.',
    },
    {
      heading: 'Conduct and safety',
      body: 'Be respectful. Report anything that worries you, and block anyone. If you meet in person, choose a public place, tell someone where you are going, and leave if you feel uncomfortable. In an emergency, call your local emergency number.',
    },
    {
      heading: 'When it ends',
      body: 'Either of you can end a connection. Sharing stops at once. The looks and sessions stay in your list for about 90 days (messages about 30) and are then deleted. If your stylist deletes their account you keep what they already sent for the same time, labeled "Former stylist". If you delete your account, the looks and sessions of your connections are deleted. If you block a stylist, the looks, sessions and messages of that connection are deleted straight away.',
    },
    {
      heading: 'Reports and enforcement',
      body: 'We do not tolerate harassment or objectionable content. We review reports, as soon as we can, and may suspend accounts.',
    },
    {
      heading: 'Contact',
      body: `Questions or urgent concerns: ${SUPPORT_EMAIL}.`,
    },
  ],
};

/** Shown wherever rates appear. */
export const PRO_NO_PAYMENT_LINE =
  'Payment is arranged directly between you and your stylist. SmartCloset does not take payments, add fees or guarantee any service.';

export const PRO_INDEPENDENT_LINE =
  'Stylists are independent professionals. SmartCloset does not check or vouch for them.';

/** The closet-sharing consent. <name> stands for the stylist's name: use proShareConsent(name). Version PRO_SHARE_TEXT_VERSION. */
export const PRO_SHARE_CONSENT =
  "Let <name> see my closet. They will see the photo, name, type, color, brand, season, pattern, material, size and condition of the pieces you share. If you choose all your pieces, this includes pieces you add while sharing is on. Photos can show more than the clothes, so don't share pieces whose photos show people, especially children, or rooms and other private details. They won't see your wishlist, what you paid, your notes, tags, how often you wear things, or anything else. Sharing ends after 90 days unless you renew it, and you can turn it off at any time. We can't take back what your stylist has already seen.";

/** PRO_SHARE_CONSENT with the stylist's name in place of <name>. */
export const proShareConsent = (name: string): string => PRO_SHARE_CONSENT.replace('<name>', () => name);

export const PRO_SHARE_ALL_HINT = 'Includes pieces you add while sharing is on.';
export const PRO_PICKER_REMINDER = "Don't pick pieces whose photos show people, especially children.";
export const PRO_STYLIST_BANNER = 'New stylists start with a limit of 3 clients and 1 live invite.';
export const PRO_SAFETY_ONLY_NOTE = 'You can still stop sharing, end a connection, report or block while this is paused.';
/** For the stylist tabs that list no connections (Schedule, Messages): where the safety actions are while features are paused. */
export const PRO_SAFETY_ELSEWHERE_NOTE = 'You can still stop sharing, end a connection, report or block from the Clients tab.';
export const PRO_SHARING_STOPPED_NOTE = 'We have stopped sharing your closet with them.';
export const PRO_CONNECT_NOTE = 'Nothing is shared when you connect. You choose what to share afterwards.';

/** The second sentence of the closet-not-shared line (7.8, A.4). */
export const PRO_CLOSET_ASK_HINT = 'You can ask them in a message.';
/** The first sentence: "<name> hasn't shared their closet", or, with no name, the wording of A.4 ("They haven't ..."). */
export const proClosetNotSharedTitle = (name?: string): string => (name ? `${name} hasn't shared their closet` : "They haven't shared their closet");
/** The whole line, spelled one way (an ASCII apostrophe) in every screen and in proErrorMessage('closet_not_shared'). */
export const proClosetNotShared = (name?: string): string => `${proClosetNotSharedTitle(name)}. ${PRO_CLOSET_ASK_HINT}`;

export const PRO_GUIDELINES_TITLE = 'Professional guidelines';

/** The five rules, in order. */
export const PRO_GUIDELINES = [
  "Be yourself. Don't impersonate anyone or claim approval you don't have.",
  'No harassment, hate, sexual content, violence or anything illegal, in names, notes or messages.',
  "Keep it about styling. Don't ask for or send money by gift card, cryptocurrency or wire.",
  "Only share what's yours. Don't copy or pass on what a client shares.",
  'Report anything that worries you. Reports are private.',
] as const;

export const PRO_GUIDELINES_ENFORCEMENT =
  "We review reports and may pause invites, remove content or suspend accounts that break these rules. You can report or block anyone from their profile, a message, a look or a session. Blocking is private; they aren't told.";

export const PRO_SAFETY_TIPS_TITLE = 'Meeting safely';

export const PRO_SAFETY_TIPS = [
  'Meet in a public place for a first session.',
  "Tell a friend where you're going and when.",
  'Keep your address private until you trust the person.',
  "Never pay by gift card, cryptocurrency or wire transfer. SmartCloset doesn't handle payments.",
  'Leave if anything feels wrong. In danger, call your local emergency number.',
] as const;

export const PRO_QUICK_REPLIES = ['Thanks!', 'Sounds good', 'Can we find another time?', "I'll update my closet"] as const;

/** The reader's warning under a message that looks like payment talk (a hint with a Report button, never a block). */
export const PRO_PAYMENT_WARNING = PRO_SAFETY_TIPS[3];

/**
 * Client-side reader warning for messages that look like payment or scam talk. The server refuses the scam
 * phrases outright; between connected adults ordinary payment talk is allowed, so this only warns.
 */
export const looksLikePaymentTalk = (text: string): boolean =>
  /(venmo|paypal|zelle|cash ?app|apple pay|gift ?card|wire transfer|western union|moneygram|bitcoin|\bcrypto\b|send (me )?(the )?money|\bdeposit\b|cashier['’]?s (cheque|check)|itunes card|overpay|refund the difference)/i.test(text);

export const PRO_PAUSED_MESSAGE = 'Professional features are paused for now.';
export const PRO_NOT_DEPLOYED_MESSAGE = "Professional features aren't available yet in this version.";
/** The server's terms version is not the one this build carries: the build cannot show the text a person would agree to. */
export const PRO_UPDATE_REQUIRED_MESSAGE = 'Update SmartCloset to keep using professional features.';
/** This build's terms are newer than the server's (a release that went out before the database change). */
export const PRO_SERVER_BEHIND_MESSAGE = 'Professional features are being updated. Please try again soon.';
export const PRO_SUSPENDED_MESSAGE = 'Professional features are paused on your account.';

/** The grey lines inside a thread, by system code. */
export const PRO_SYSTEM_LINES = {
  connected: "You're connected.",
  ended: 'This connection has ended.',
  sharing_on: 'Closet sharing is on.',
} as const;

/** The sentence under an ended connection: the person who ended it, and everyone else. */
export const PRO_CLOSED_BY_ME = 'You ended this connection.';
export const PRO_CLOSED_BY_THEM = 'This connection has ended.';

export const PRO_REPORT_THANKS =
  "Thanks for letting us know. We review reports, as soon as we can. They won't be told it was you.";

export const PRO_BLOCK_EXPLANATION =
  "They won't be able to message you or see anything you share, and your connection ends. They won't be told.";
