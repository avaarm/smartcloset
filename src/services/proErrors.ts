import type { ProErrorCode } from '../types/pro';
import {
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  proClosetNotShared,
  PRO_SUSPENDED_MESSAGE,
  PRO_TEXT_LIMITS,
} from '../config/proRules';

/** An error from a pro function, in a form screens can branch on. */
export class ProError extends Error {
  code: ProErrorCode;
  /** pro_terms_required: 'stylist' | 'client'. text_not_allowed: the field. pro_rate_limited: the counter that ran out. invalid_*: the field. */
  detail?: string;
  /** text_not_allowed: 'payment' | 'contact' | 'content' | 'name'. stylist_profile_removed, invites_held: the support hint. */
  hint?: string;
  constructor(code: ProErrorCode, message?: string, detail?: string, hint?: string) {
    super(message ?? code);
    this.name = 'ProError';
    this.code = code;
    this.detail = detail;
    this.hint = hint;
  }
}

/** Every message the pro functions raise (4.4). The three codes the app adds itself (not_deployed, offline, unknown) are not in it. */
const KNOWN: ProErrorCode[] = [
  'not_authenticated', 'pro_disabled', 'pro_suspended', 'account_too_new', 'stylist_profile_required',
  'stylist_profile_removed', 'invites_held', 'closet_not_shared', 'pro_terms_required', 'pro_unavailable',
  'connection_ended', 'invite_invalid', 'stylist_not_accepting', 'adult_required', 'terms_version_mismatch',
  'stale_consent_text', 'invalid_request', 'invalid_profile', 'invalid_alias', 'invalid_message',
  'invalid_recommendation', 'invalid_appointment', 'invalid_report', 'recommendation_locked', 'recommendation_empty',
  'appointment_closed', 'item_not_found', 'item_not_shared', 'text_not_allowed', 'appointment_conflict',
  'pro_rate_limited', 'invite_limit', 'client_connection_limit', 'draft_limit', 'appointment_open_limit',
  'closet_page_limit', 'report_rate_limited',
];

export const PRO_ERROR_CODES: readonly ProErrorCode[] = KNOWN;

// A code is read out of the message only as a whole word, so a function or column name that happens to
// contain one (as "invite_limit" would inside a longer identifier) is never mistaken for it.
const KNOWN_PATTERNS: Array<[ProErrorCode, RegExp]> = KNOWN.map(code => [code, new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`)]);

/**
 * Turns whatever supabase-js (PostgREST) threw into a ProError.
 * PostgREST puts our RAISE text in `message`, DETAIL in `details` and HINT in `hint`.
 */
export const toProError = (error: any): ProError => {
  if (error instanceof ProError) return error;
  const message = `${error?.message ?? ''}`;
  const status = error?.status ?? error?.context?.status;
  if (error?.code === 'PGRST202' || error?.code === '42883' || status === 404 || /could not find the function/i.test(message)) {
    return new ProError('not_deployed', message);
  }
  const trimmed = message.trim();
  const exact = KNOWN.find(code => code === trimmed);
  const known = exact ?? KNOWN_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0];
  if (known) return new ProError(known, message, error?.details || undefined, error?.hint || undefined);
  if (error?.code === '28000') return new ProError('not_authenticated', message);
  // A dropped connection to the API (or to the auth service while it refreshes a login) says nothing useful in its text.
  if (
    /network request failed|failed to fetch|network error|timed out|timeout|offline/i.test(message) ||
    error?.name === 'TypeError' ||
    error?.name === 'FunctionsFetchError' ||
    error?.name === 'AuthRetryableFetchError'
  ) {
    return new ProError('offline', message);
  }
  return new ProError('unknown', message);
};

const GENERIC = 'Something went wrong. Please try again.';

/**
 * Plain-language text for a person (Appendix A.4). It is never a code, a status or a function name, and the words
 * "block" and "report" appear only where the person did that themselves. `fallback` is used for anything unexpected.
 */
export const proErrorMessage = (error: unknown, fallback: string = GENERIC): string => {
  const e = toProError(error);
  switch (e.code) {
    case 'not_authenticated': return 'Sign in to work with a stylist.';
    case 'pro_disabled': return PRO_PAUSED_MESSAGE;
    case 'pro_suspended': return PRO_SUSPENDED_MESSAGE;
    case 'pro_terms_required': return 'Please read and accept the terms to continue.';
    case 'adult_required': return 'Please confirm that you are 18 or older.';
    case 'account_too_new': return 'Your account is too new to create invite codes. Please try again in a day or two.';
    case 'stylist_profile_required': return 'Set up your stylist profile first.';
    case 'stylist_profile_removed': return 'Your stylist profile was removed. Email support if you think this is a mistake.';
    case 'invites_held': return 'Your invites are paused while we review your profile. Email support if you think this is a mistake.';
    case 'pro_unavailable': return 'This is no longer available.';
    case 'connection_ended': return 'This connection has ended.';
    case 'closet_not_shared': return proClosetNotShared();
    case 'invite_invalid': return "That code isn't valid or has expired. Ask your stylist for a new one.";
    case 'stylist_not_accepting': return "This stylist isn't taking new clients right now.";
    case 'terms_version_mismatch': return 'The terms were updated. Please reopen and read them again.';
    case 'stale_consent_text': return 'Update SmartCloset to change sharing.';
    case 'invalid_request': return GENERIC;
    case 'invalid_profile':
      if (e.detail === 'services') return 'Choose at least one service.';
      if (e.detail === 'display_name') {
        return `Choose a name of ${PRO_TEXT_LIMITS.display_name_min} to ${PRO_TEXT_LIMITS.display_name_max} characters.`;
      }
      return 'Check your profile and try again.';
    case 'invalid_alias': return `Choose a name of ${PRO_TEXT_LIMITS.alias_min} to ${PRO_TEXT_LIMITS.alias_max} characters.`;
    case 'invalid_message': return `Write a message of up to ${PRO_TEXT_LIMITS.message} characters.`;
    case 'invalid_recommendation': return 'Check the title and the pieces and try again.';
    case 'recommendation_locked': return "A look that has been sent can't be changed.";
    case 'recommendation_empty': return 'Add a note or at least one piece first.';
    case 'invalid_appointment': return 'Check the date, time and length and try again.';
    case 'appointment_closed': return "That session can't be changed any more.";
    case 'appointment_conflict': return 'That time overlaps another confirmed session.';
    case 'item_not_found': return "One of those pieces isn't in your closet any more.";
    case 'item_not_shared': return "That piece isn't shared with you.";
    case 'text_not_allowed':
      switch (e.hint) {
        case 'payment': return "Payment wording isn't allowed here.";
        case 'contact': return "Links and contact details can't go here.";
        case 'name': return 'Choose a different name.';
        default: return "That wording isn't allowed.";
      }
    case 'invalid_report': return 'Choose a reason.';
    case 'pro_rate_limited': return "You're going a bit fast. Please wait a moment.";
    case 'invite_limit': return 'You have too many live invite codes. Revoke one or wait for one to expire.';
    case 'client_connection_limit': return "You're connected to as many stylists as you can be. End one first.";
    case 'draft_limit': return 'You have too many drafts for this client. Delete one first.';
    case 'appointment_open_limit': return 'There are too many open requests. Wait for answers first.';
    case 'closet_page_limit': return "You've looked at a lot of pieces today. Try again tomorrow.";
    case 'report_rate_limited': return "You've sent several reports today. Please try again tomorrow.";
    case 'not_deployed': return PRO_NOT_DEPLOYED_MESSAGE;
    case 'offline': return 'You seem to be offline. Please try again.';
    default: return fallback;
  }
};
