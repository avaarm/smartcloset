import { isOfflineError, isRpcMissing, rpcErrorMessage, type RpcContext } from '../../src/services/rpcErrors';

const FALLBACK = 'Something else went wrong.';

describe('isRpcMissing', () => {
  it('recognises a function that does not exist yet', () => {
    expect(isRpcMissing({ code: '42883', message: 'function public.get_my_item_rating(uuid) does not exist' })).toBe(true);
    expect(isRpcMissing({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isRpcMissing({ message: 'Could not find the function public.get_brand_insight(p_brand) in the schema cache' })).toBe(true);
    expect(isRpcMissing(new Error('could not find the function public.x'))).toBe(true);
  });

  it('says no to everything else', () => {
    expect(isRpcMissing({ code: '54000', message: 'rate_limited' })).toBe(false);
    expect(isRpcMissing({ message: 'network request failed' })).toBe(false);
    expect(isRpcMissing(null)).toBe(false);
    expect(isRpcMissing(undefined)).toBe(false);
    expect(isRpcMissing('boom')).toBe(false);
    expect(isRpcMissing(42883)).toBe(false);
  });

  it('accepts a numeric code', () => {
    expect(isRpcMissing({ code: 42883 })).toBe(true);
  });
});

describe('isOfflineError', () => {
  it('recognises a connection that is not there', () => {
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true);
    expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOfflineError(new Error('Request timeout'))).toBe(true);
    expect(isOfflineError(new Error('Network request timed out'))).toBe(true);
    expect(isOfflineError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
    expect(isOfflineError({ message: 'AuthRetryableFetchError: fetch failed' })).toBe(true);
  });

  it('says no to a server that answered', () => {
    expect(isOfflineError({ code: '54000', message: 'rate_limited' })).toBe(false);
    expect(isOfflineError({ code: '42883', message: 'function does not exist' })).toBe(false);
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError(undefined)).toBe(false);
    expect(isOfflineError({})).toBe(false);
  });
});

describe('rpcErrorMessage', () => {
  const quota: Array<[RpcContext, string]> = [
    ['rating', 'You’ve rated a lot today. Please come back tomorrow.'],
    ['insight', 'You’ve looked at a lot of brands today. Please come back tomorrow.'],
    ['consent', 'You’ve made a lot of changes today. Please try again tomorrow.'],
    ['report', 'You’ve sent a lot of reports today. Please try again tomorrow.'],
  ];

  it.each(quota)('words the daily limit for %s', (context, message) => {
    expect(rpcErrorMessage({ code: '54000', message: 'rate_limited' }, FALLBACK, context)).toBe(message);
    expect(rpcErrorMessage({ code: '54000', message: 'x' }, FALLBACK, context)).toBe(message);
    expect(rpcErrorMessage({ message: 'rate_limited' }, FALLBACK, context)).toBe(message);
    expect(rpcErrorMessage({ message: 'rating_rate_limited' }, FALLBACK, context)).toBe(message);
    expect(rpcErrorMessage(new Error('rating_rate_limited'), FALLBACK, context)).toBe(message);
  });

  it('does not guess which daily limit it is when it is not told', () => {
    expect(rpcErrorMessage({ code: '54000', message: 'rate_limited' }, FALLBACK)).toBe(FALLBACK);
  });

  it('maps each raised error to one sentence', () => {
    const cases: Array<[unknown, string]> = [
      [{ code: '28000', message: 'not_authenticated' }, 'You need to be signed in.'],
      [{ code: '28000' }, 'You need to be signed in.'],
      [{ message: 'not_authenticated' }, 'You need to be signed in.'],
      [{ code: 'P0001', message: 'item_not_found' }, 'That item is no longer in your closet.'],
      [{ code: 'P0001', message: 'not_a_brand_owner' }, 'You can rate a brand once you own something from it.'],
      [{ code: 'P0001', message: 'consent_required' }, 'Agree to add your ratings to brand insights first.'],
      [{ code: '22023', message: 'stale_consent_text' }, 'Please update SmartCloset to change this.'],
      [{ code: '22023', message: 'adult_required' }, 'You need to confirm you’re 18 or older.'],
    ];
    for (const [error, message] of cases) expect(rpcErrorMessage(error, FALLBACK, 'rating')).toBe(message);
  });

  it('maps every invalid_* error to the same "check it" sentence', () => {
    for (const token of ['invalid_rating', 'invalid_brand', 'invalid_report', 'invalid_consent', 'invalid_purpose']) {
      expect(rpcErrorMessage({ code: '22023', message: token }, FALLBACK, 'rating')).toBe('That couldn’t be saved. Please check it and try again.');
    }
  });

  it('finds the token inside a longer message', () => {
    expect(rpcErrorMessage({ message: 'ERROR: item_not_found (context)' }, FALLBACK)).toBe('That item is no longer in your closet.');
  });

  it('says a missing function is not available yet', () => {
    expect(rpcErrorMessage({ code: '42883', message: 'function public.save_item_rating does not exist' }, FALLBACK, 'rating')).toBe('This isn’t available yet.');
    expect(rpcErrorMessage({ code: 'PGRST202', message: 'Could not find the function' }, FALLBACK, 'insight')).toBe('This isn’t available yet.');
    expect(rpcErrorMessage({ message: 'Could not find the function public.get_my_consents in the schema cache' }, FALLBACK)).toBe('This isn’t available yet.');
  });

  it('keeps a missing function apart from the raised errors even when a hint names one', () => {
    const error = { code: 'PGRST202', message: 'Could not find the function public.f(p_x) in the schema cache', hint: 'rate_limited' };
    expect(rpcErrorMessage(error, FALLBACK, 'rating')).toBe('This isn’t available yet.');
  });

  it('uses the fallback for anything else', () => {
    expect(rpcErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }, FALLBACK, 'rating')).toBe(FALLBACK);
    expect(rpcErrorMessage(new Error('Network request failed'), FALLBACK, 'rating')).toBe(FALLBACK);
    expect(rpcErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(rpcErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(rpcErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    expect(rpcErrorMessage('boom', FALLBACK)).toBe(FALLBACK);
  });

  it('never shows a status code, SQL text or a function name', () => {
    const hostile = [
      { code: '42883', message: 'function public.save_item_rating(uuid, integer) does not exist' },
      { code: '54000', message: 'rating_rate_limited' },
      { code: '28000', message: 'not_authenticated' },
      { code: '22023', message: 'invalid_rating' },
      { code: 'P0001', message: 'item_not_found' },
    ];
    for (const error of hostile) {
      for (const context of ['rating', 'insight', 'consent', 'report'] as RpcContext[]) {
        const text = rpcErrorMessage(error, FALLBACK, context);
        expect(text).not.toMatch(/\d{5}|PGRST|public\.|_|function/);
      }
    }
  });
});
