/**
 * Server-held, versioned permissions (user_consents). Generic: another purpose is one more literal in
 * ConsentPurpose and one row in consent_purposes on the server.
 *
 * Reads never throw and say why they have no answer (Loaded); a guest never reaches the network. Writes throw
 * Error(friendly message). Nothing touches supabase at import time and nothing is logged.
 */

import { supabase } from '../config/supabase';
import type { Loaded } from '../types/rating';
import { getAuthUserId } from './authUser';
import { isOfflineError, isRpcMissing, rpcErrorMessage } from './rpcErrors';

export type ConsentPurpose = 'share_ratings';   // add a literal when another purpose gets a row in consent_purposes

export interface ConsentStatus {
  purpose: string;
  granted: boolean | null;        // null: not decided yet
  policyVersion: string | null;
  decidedAt: string | null;
  adultConfirmedAt: string | null;
  requiresAdult: boolean;
  currentVersion: string;
  /** Agreed to older wording of a purpose that needs a fresh answer for new wording: counts as not agreed. */
  needsReconsent: boolean;
}

const READ_FAILED = 'Couldn’t load your choices.';
const WRITE_FAILED = 'Couldn’t save that. Check your connection and try again.';

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** One row of get_my_consents, or null when it is not shaped like one. */
const toStatus = (row: unknown): ConsentStatus | null => {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.purpose !== 'string' || r.purpose === '') return null;
  if (typeof r.current_version !== 'string' || r.current_version === '') return null;
  if (r.granted !== null && r.granted !== undefined && typeof r.granted !== 'boolean') return null;
  // A row that does not say whether an adult check applies, or whether the answer is stale, is not trusted.
  if (typeof r.requires_adult !== 'boolean' || typeof r.needs_reconsent !== 'boolean') return null;
  return {
    purpose: r.purpose,
    granted: typeof r.granted === 'boolean' ? r.granted : null,
    policyVersion: stringOrNull(r.policy_version),
    decidedAt: stringOrNull(r.decided_at),
    adultConfirmedAt: stringOrNull(r.adult_confirmed_at),
    requiresAdult: r.requires_adult,
    currentVersion: r.current_version,
    needsReconsent: r.needs_reconsent,
  };
};

const failed = (error: unknown): Loaded<never> => {
  if (isRpcMissing(error)) return { state: 'unavailable' };
  if (isOfflineError(error)) return { state: 'offline' };
  return { state: 'error', message: rpcErrorMessage(error, READ_FAILED, 'consent') };
};

/** Every purpose with the caller's answer. */
export const getConsents = async (): Promise<Loaded<ConsentStatus[]>> => {
  if (!(await getAuthUserId())) return { state: 'guest' };
  try {
    const { data, error } = await supabase.rpc('get_my_consents');
    if (error) return failed(error);
    if (!Array.isArray(data)) return { state: 'error', message: READ_FAILED };
    return { state: 'ok', value: data.map(toStatus).filter((s): s is ConsentStatus => s !== null) };
  } catch (error) {
    return failed(error);
  }
};

/** One purpose; `null` when the server does not know it. */
export const getConsent = async (purpose: ConsentPurpose): Promise<Loaded<ConsentStatus | null>> => {
  const all = await getConsents();
  if (all.state !== 'ok') return all;
  return { state: 'ok', value: all.value.find(s => s.purpose === purpose) ?? null };
};

/**
 * Throws Error(friendly message). includeExisting is only meaningful when granting. Granting with a policyVersion
 * other than the server's throws the stale_consent_text message.
 */
export const setConsent = async (
  purpose: ConsentPurpose,
  granted: boolean,
  opts: { policyVersion: string; adult?: boolean; includeExisting?: boolean },
): Promise<void> => {
  if (!(await getAuthUserId())) throw new Error(rpcErrorMessage({ code: '28000' }, WRITE_FAILED, 'consent'));
  let error: unknown = null;
  try {
    const res = await supabase.rpc('set_consent', {
      p_purpose: purpose,
      p_granted: granted,
      p_policy_version: opts.policyVersion,
      p_adult: opts.adult === true,
      p_include_existing: granted && opts.includeExisting === true,
    });
    error = res.error;
  } catch (thrown) {
    error = thrown ?? new Error('failed');
  }
  if (error) throw new Error(rpcErrorMessage(error, WRITE_FAILED, 'consent'));
};
