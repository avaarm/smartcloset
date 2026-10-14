/**
 * Turns a failed Supabase function call into something a person can read, and tells the callers which
 * failures mean "not there yet" or "no connection". Nothing here ever returns a status code, SQL text
 * or a function name.
 */

export type RpcContext = 'rating' | 'insight' | 'consent' | 'report';

const SIGNED_OUT = 'You need to be signed in.';
const NOT_AVAILABLE = 'This isn’t available yet.';
const INVALID = 'That couldn’t be saved. Please check it and try again.';

const RATE_LIMITED: Record<RpcContext, string> = {
  rating: 'You’ve rated a lot today. Please come back tomorrow.',
  insight: 'You’ve looked at a lot of brands today. Please come back tomorrow.',
  consent: 'You’ve made a lot of changes today. Please try again tomorrow.',
  report: 'You’ve sent a lot of reports today. Please try again tomorrow.',
};

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
};

const messageOf = (error: unknown): string => {
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : '';
};

const nameOf = (error: unknown): string => {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' ? name : '';
};

/** The function does not exist on the server (the migration is not applied yet): Postgres 42883 or PostgREST PGRST202. */
export const isRpcMissing = (error: unknown): boolean => {
  const code = codeOf(error);
  if (code === '42883' || code === 'PGRST202') return true;
  return /could not find the function/i.test(messageOf(error));
};

/** No usable connection: a failed or timed-out request, or the auth client giving up on a refresh. */
export const isOfflineError = (error: unknown): boolean => {
  if (nameOf(error) === 'AuthRetryableFetchError') return true;
  const message = messageOf(error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('authretryablefetcherror')
  );
};

/** True when the error's code is `code` or its message contains any of the tokens. */
const matches = (error: unknown, codes: string[], tokens: string[]): boolean => {
  if (codes.includes(codeOf(error))) return true;
  const message = messageOf(error);
  return tokens.some(token => message.includes(token));
};

/** A message safe to show: never a status code, SQL text or function name. */
export const rpcErrorMessage = (error: unknown, fallback: string, context?: RpcContext): string => {
  // First, so a hint that happens to name a parameter can never be read as one of the raised errors below.
  if (isRpcMissing(error)) return NOT_AVAILABLE;
  // Out of allowance. Each context has its own sentence; without a context there is no honest one to pick.
  if (matches(error, ['54000'], ['rate_limited', 'rating_rate_limited'])) {
    return context ? RATE_LIMITED[context] : fallback;
  }
  if (matches(error, ['28000'], ['not_authenticated'])) return SIGNED_OUT;
  if (matches(error, [], ['item_not_found'])) return 'That item is no longer in your closet.';
  if (matches(error, [], ['not_a_brand_owner'])) return 'You can rate a brand once you own something from it.';
  if (matches(error, [], ['consent_required'])) return 'Agree to add your ratings to brand insights first.';
  if (matches(error, [], ['stale_consent_text'])) return 'Please update SmartCloset to change this.';
  if (matches(error, [], ['adult_required'])) return 'You need to confirm you’re 18 or older.';
  if (matches(error, [], ['invalid_rating', 'invalid_brand', 'invalid_report', 'invalid_consent', 'invalid_purpose'])) {
    return INVALID;
  }
  return fallback;
};
