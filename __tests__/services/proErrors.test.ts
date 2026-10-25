import {
  PRO_ERROR_CODES, ProError, proErrorMessage, toProError,
} from '../../src/services/proErrors';
import {
  PRO_NOT_DEPLOYED_MESSAGE, PRO_PAUSED_MESSAGE, PRO_SUSPENDED_MESSAGE,
} from '../../src/config/proRules';
import type { ProErrorCode } from '../../src/types/pro';

// Appendix A.4, one line per code (the codes with a DETAIL or HINT are checked separately below).
const A4: Record<string, string> = {
  not_authenticated: 'Sign in to work with a stylist.',
  pro_disabled: 'Professional features are paused for now.',
  pro_suspended: 'Professional features are paused on your account.',
  pro_terms_required: 'Please read and accept the terms to continue.',
  adult_required: 'Please confirm that you are 18 or older.',
  account_too_new: 'Your account is too new to create invite codes. Please try again in a day or two.',
  stylist_profile_required: 'Set up your stylist profile first.',
  stylist_profile_removed: 'Your stylist profile was removed. Email support if you think this is a mistake.',
  invites_held: 'Your invites are paused while we review your profile. Email support if you think this is a mistake.',
  pro_unavailable: 'This is no longer available.',
  connection_ended: 'This connection has ended.',
  closet_not_shared: "They haven't shared their closet. You can ask them in a message.",
  invite_invalid: "That code isn't valid or has expired. Ask your stylist for a new one.",
  stylist_not_accepting: "This stylist isn't taking new clients right now.",
  terms_version_mismatch: 'The terms were updated. Please reopen and read them again.',
  stale_consent_text: 'Update SmartCloset to change sharing.',
  invalid_request: 'Something went wrong. Please try again.',
  invalid_profile: 'Check your profile and try again.',
  invalid_alias: 'Choose a name of 2 to 30 characters.',
  invalid_message: 'Write a message of up to 500 characters.',
  invalid_recommendation: 'Check the title and the pieces and try again.',
  recommendation_locked: "A look that has been sent can't be changed.",
  recommendation_empty: 'Add a note or at least one piece first.',
  invalid_appointment: 'Check the date, time and length and try again.',
  appointment_closed: "That session can't be changed any more.",
  appointment_conflict: 'That time overlaps another confirmed session.',
  item_not_found: "One of those pieces isn't in your closet any more.",
  item_not_shared: "That piece isn't shared with you.",
  text_not_allowed: "That wording isn't allowed.",
  invalid_report: 'Choose a reason.',
  pro_rate_limited: "You're going a bit fast. Please wait a moment.",
  invite_limit: 'You have too many live invite codes. Revoke one or wait for one to expire.',
  client_connection_limit: "You're connected to as many stylists as you can be. End one first.",
  draft_limit: 'You have too many drafts for this client. Delete one first.',
  appointment_open_limit: 'There are too many open requests. Wait for answers first.',
  closet_page_limit: "You've looked at a lot of pieces today. Try again tomorrow.",
  report_rate_limited: "You've sent several reports today. Please try again tomorrow.",
  not_deployed: "Professional features aren't available yet in this version.",
  offline: 'You seem to be offline. Please try again.',
};

describe('toProError', () => {
  it('reads the code out of what PostgREST puts in `message`, keeping DETAIL and HINT', () => {
    const e = toProError({ message: 'text_not_allowed', code: '22023', details: 'bio', hint: 'contact' });
    expect(e).toBeInstanceOf(ProError);
    expect(e.name).toBe('ProError');
    expect([e.code, e.detail, e.hint]).toEqual(['text_not_allowed', 'bio', 'contact']);
  });

  it('keeps the DETAIL of a terms error (the role) and of a rate limit (the counter)', () => {
    expect(toProError({ message: 'pro_terms_required', code: '42501', details: 'client' })).toMatchObject({ code: 'pro_terms_required', detail: 'client' });
    expect(toProError({ message: 'pro_rate_limited', code: '54000', details: 'message_min' })).toMatchObject({ code: 'pro_rate_limited', detail: 'message_min' });
  });

  it('reads every code of 4.4, whether it is the whole message or a word inside it', () => {
    expect(PRO_ERROR_CODES).toHaveLength(37);
    expect(new Set(PRO_ERROR_CODES).size).toBe(PRO_ERROR_CODES.length);
    for (const code of PRO_ERROR_CODES) {
      expect(toProError({ message: code }).code).toBe(code);
      expect(toProError({ message: ` ${code} ` }).code).toBe(code);
      expect(toProError({ message: `ERROR: ${code} (P0001)` }).code).toBe(code);
    }
  });

  it('does not read a code out of a longer name', () => {
    expect(toProError({ message: 'xpro_unavailable' }).code).toBe('unknown');
    expect(toProError({ message: 'pro_unavailable_soon' }).code).toBe('unknown');
    expect(toProError({ message: 'invite_limit_per_day' }).code).toBe('unknown');
  });

  it.each([
    [{ message: 'not_authenticated', code: '28000' }, 'not_authenticated'],
    [{ message: 'JWT expired', code: '28000' }, 'not_authenticated'],
    [{ message: 'pro_unavailable', code: '22023' }, 'pro_unavailable'],
    [{ message: 'appointment_conflict', code: '23505' }, 'appointment_conflict'],
    [{ message: 'report_rate_limited', code: '54000' }, 'report_rate_limited'],
    [{ message: 'Could not find the function public.get_pro_status without parameters in the schema cache', code: 'PGRST202' }, 'not_deployed'],
    [{ message: 'function public.get_pro_badge() does not exist', code: '42883' }, 'not_deployed'],
    [{ message: 'Not Found', status: 404 }, 'not_deployed'],
    [{ message: 'x', context: { status: 404 } }, 'not_deployed'],
    [{ message: 'could not find the function public.redeem_pro_invite' }, 'not_deployed'],
    [{ message: 'TypeError: Network request failed' }, 'offline'],
    [{ message: 'Failed to fetch' }, 'offline'],
    [{ message: 'The request timed out' }, 'offline'],
    [{ message: 'x', name: 'AuthRetryableFetchError' }, 'offline'],
    [{ message: 'something else entirely' }, 'unknown'],
    [{}, 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
    ['a string', 'unknown'],
  ])('maps %j to %s', (input, code) => {
    expect(toProError(input).code).toBe(code);
  });

  it('puts a missing function before everything else, so a hint that names a parameter is not read as a code', () => {
    const e = toProError({ message: 'Could not find the function public.redeem_pro_invite(p_alias, p_code)', code: 'PGRST202', hint: 'Perhaps you meant pro_unavailable' });
    expect(e.code).toBe('not_deployed');
  });

  it('passes a ProError through', () => {
    const e = new ProError('invite_invalid');
    expect(toProError(e)).toBe(e);
  });

  it('keeps the original text as the message and the code when there is none', () => {
    expect(toProError({ message: 'pro_unavailable' }).message).toBe('pro_unavailable');
    expect(new ProError('connection_ended').message).toBe('connection_ended');
    expect(new ProError('connection_ended', 'because').message).toBe('because');
  });
});

describe('proErrorMessage', () => {
  const msg = (message: string, extra: object = {}) => proErrorMessage({ message, ...extra }, 'fallback');

  it('has a message for every code, and it is the text of Appendix A.4', () => {
    for (const code of PRO_ERROR_CODES) expect(A4[code]).toBeDefined();
    for (const [code, text] of Object.entries(A4)) {
      expect(proErrorMessage(new ProError(code as ProErrorCode), 'fallback')).toBe(text);
    }
  });

  it('uses the fallback only for what it cannot explain, and says something plain when there is no fallback', () => {
    expect(msg('something else entirely')).toBe('fallback');
    expect(proErrorMessage(new ProError('unknown'), 'Couldn’t load your clients.')).toBe('Couldn’t load your clients.');
    expect(proErrorMessage({ message: 'something else entirely' })).toBe('Something went wrong. Please try again.');
  });

  it('is in step with the constants the access states show', () => {
    expect(msg('pro_disabled')).toBe(PRO_PAUSED_MESSAGE);
    expect(msg('pro_suspended')).toBe(PRO_SUSPENDED_MESSAGE);
    expect(msg('x', { code: 'PGRST202' })).toBe(PRO_NOT_DEPLOYED_MESSAGE);
  });

  it('words a refused text by its hint', () => {
    expect(msg('text_not_allowed', { hint: 'payment' })).toBe("Payment wording isn't allowed here.");
    expect(msg('text_not_allowed', { hint: 'contact' })).toBe("Links and contact details can't go here.");
    expect(msg('text_not_allowed', { hint: 'content' })).toBe("That wording isn't allowed.");
    expect(msg('text_not_allowed', { hint: 'name' })).toBe('Choose a different name.');
    expect(msg('text_not_allowed')).toBe("That wording isn't allowed.");
    expect(msg('text_not_allowed', { details: 'bio', hint: 'contact' })).toBe("Links and contact details can't go here.");
  });

  it('words a bad profile by its field', () => {
    expect(msg('invalid_profile', { details: 'services' })).toBe('Choose at least one service.');
    expect(msg('invalid_profile', { details: 'display_name' })).toBe('Choose a name of 2 to 40 characters.');
    expect(msg('invalid_profile', { details: 'languages' })).toBe('Check your profile and try again.');
    expect(msg('invalid_profile')).toBe('Check your profile and try again.');
  });

  it('never shows a code, a status, a function name or a database word', () => {
    for (const code of PRO_ERROR_CODES) {
      const text = proErrorMessage(new ProError(code), 'fallback');
      expect(text).not.toMatch(/[a-z]_[a-z]/);
      expect(text).not.toMatch(/\b(pgrst|sqlstate|rpc|http|status)\b/i);
      expect(text).not.toContain(code);
    }
  });

  // What a person who was blocked, or whose connection a suspension ended, must never be told.
  it('never says "block" or "report" about a neutral ending', () => {
    for (const code of ['pro_unavailable', 'connection_ended', 'invite_invalid', 'closet_not_shared', 'stylist_not_accepting', 'item_not_shared', 'not_authenticated'] as ProErrorCode[]) {
      expect(proErrorMessage(new ProError(code), 'fallback')).not.toMatch(/block|report|suspend|ban/i);
    }
  });

  it('has no commerce wording', () => {
    for (const code of PRO_ERROR_CODES) {
      expect(proErrorMessage(new ProError(code), 'fallback')).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    }
  });
});
