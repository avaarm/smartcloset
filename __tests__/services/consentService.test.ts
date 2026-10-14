let mockUser: { id: string } | null = { id: 'user-1' };
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getSession: async () => ({ data: { session: mockUser ? { user: mockUser } : null }, error: null }) },
  },
}));

import { getConsent, getConsents, setConsent } from '../../src/services/consentService';

const row = (over: Record<string, unknown> = {}) => ({
  purpose: 'share_ratings',
  granted: null,
  policy_version: null,
  decided_at: null,
  adult_confirmed_at: null,
  requires_adult: true,
  current_version: 'ratings-2026-10',
  needs_reconsent: false,
  ...over,
});

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockUser = { id: 'user-1' };
  mockRpc.mockReset().mockResolvedValue({ data: [row()], error: null });
  mockFrom.mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

describe('getConsents', () => {
  it('is a guest result with no call when signed out', async () => {
    mockUser = null;
    expect(await getConsents()).toEqual({ state: 'guest' });
    expect(await getConsent('share_ratings')).toEqual({ state: 'guest' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('calls get_my_consents with no arguments and maps the rows', async () => {
    mockRpc.mockResolvedValue({
      data: [row({
        granted: true, policy_version: 'ratings-2026-10', decided_at: '2026-10-14T10:00:00Z',
        adult_confirmed_at: '2026-10-14T10:00:00Z',
      })],
      error: null,
    });
    const result = await getConsents();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_my_consents');
    expect(result).toEqual({
      state: 'ok',
      value: [{
        purpose: 'share_ratings',
        granted: true,
        policyVersion: 'ratings-2026-10',
        decidedAt: '2026-10-14T10:00:00Z',
        adultConfirmedAt: '2026-10-14T10:00:00Z',
        requiresAdult: true,
        currentVersion: 'ratings-2026-10',
        needsReconsent: false,
      }],
    });
  });

  it('keeps "not decided yet" apart from "no"', async () => {
    mockRpc.mockResolvedValue({ data: [row({ purpose: 'a_purpose' }), row({ granted: false, policy_version: 'ratings-2026-10', decided_at: '2026-10-14T10:00:00Z' })], error: null });
    const result = await getConsents();
    expect(result.state).toBe('ok');
    if (result.state !== 'ok') return;
    expect(result.value.map(s => [s.purpose, s.granted])).toEqual([['a_purpose', null], ['share_ratings', false]]);
  });

  it('reports an answer given to older wording', async () => {
    mockRpc.mockResolvedValue({ data: [row({ granted: true, policy_version: 'ratings-2026-09', needs_reconsent: true })], error: null });
    const result = await getConsent('share_ratings');
    expect(result.state).toBe('ok');
    if (result.state !== 'ok') return;
    expect(result.value).toMatchObject({ granted: true, policyVersion: 'ratings-2026-09', needsReconsent: true, currentVersion: 'ratings-2026-10' });
  });

  it('drops rows that are not shaped like a consent row', async () => {
    mockRpc.mockResolvedValue({
      data: [null, 'x', 7, {}, row({ purpose: '' }), row({ current_version: 5 }), row({ granted: 'yes' }), row({ requires_adult: undefined }), row({ needs_reconsent: null }), row({ purpose: 'kept' })],
      error: null,
    });
    const result = await getConsents();
    expect(result).toMatchObject({ state: 'ok' });
    if (result.state !== 'ok') return;
    expect(result.value.map(s => s.purpose)).toEqual(['kept']);
  });

  it('is an error, not a crash, when the answer is not a list', async () => {
    for (const data of [null, undefined, {}, 'x']) {
      mockRpc.mockResolvedValue({ data, error: null });
      expect((await getConsents()).state).toBe('error');
    }
  });

  it('returns null for a purpose the server does not know', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getConsent('share_ratings')).toEqual({ state: 'ok', value: null });
  });

  it('is unavailable when the function is not on the server yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function public.get_my_consents() does not exist' } });
    expect(await getConsents()).toEqual({ state: 'unavailable' });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_my_consents without parameters in the schema cache' } });
    expect(await getConsent('share_ratings')).toEqual({ state: 'unavailable' });
  });

  it('is offline when there is no connection, whether the call fails or throws', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    expect(await getConsents()).toEqual({ state: 'offline' });
    mockRpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await getConsents()).toEqual({ state: 'offline' });
  });

  it('is an error with a friendly message otherwise, and never throws', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'rate_limited' } });
    expect(await getConsents()).toEqual({ state: 'error', message: 'You’ve made a lot of changes today. Please try again tomorrow.' });
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'select * from user_consents blew up' } });
    const result = await getConsents();
    expect(result).toEqual({ state: 'error', message: 'Couldn’t load your choices.' });
    mockRpc.mockRejectedValue(new Error('boom'));
    expect((await getConsent('share_ratings')).state).toBe('error');
  });
});

describe('setConsent', () => {
  it('sends the argument names the function expects', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await setConsent('share_ratings', true, { policyVersion: 'ratings-2026-10', adult: true, includeExisting: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('set_consent', {
      p_purpose: 'share_ratings',
      p_granted: true,
      p_policy_version: 'ratings-2026-10',
      p_adult: true,
      p_include_existing: true,
    });
  });

  it('sends false for the options that were left out', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await setConsent('share_ratings', true, { policyVersion: 'ratings-2026-10' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_adult: false, p_include_existing: false });
  });

  it('never asks to include past ratings when withdrawing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await setConsent('share_ratings', false, { policyVersion: 'ratings-2026-10', includeExisting: true });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_granted: false, p_include_existing: false });
  });

  it('throws a friendly sentence for a guest, without a call', async () => {
    mockUser = null;
    await expect(setConsent('share_ratings', true, { policyVersion: 'ratings-2026-10', adult: true })).rejects.toThrow('You need to be signed in.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '22023', message: 'stale_consent_text' }, 'Please update SmartCloset to change this.'],
    [{ code: '22023', message: 'adult_required' }, 'You need to confirm you’re 18 or older.'],
    [{ code: '22023', message: 'invalid_purpose' }, 'That couldn’t be saved. Please check it and try again.'],
    [{ code: '22023', message: 'invalid_consent' }, 'That couldn’t be saved. Please check it and try again.'],
    [{ code: '54000', message: 'rate_limited' }, 'You’ve made a lot of changes today. Please try again tomorrow.'],
    [{ code: '28000', message: 'not_authenticated' }, 'You need to be signed in.'],
    [{ code: '42883', message: 'function public.set_consent does not exist' }, 'This isn’t available yet.'],
    [{ code: 'XX000', message: 'internal detail that must not reach the screen' }, 'Couldn’t save that. Check your connection and try again.'],
  ])('turns %j into a friendly error', async (error, message) => {
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(setConsent('share_ratings', true, { policyVersion: 'ratings-2026-10', adult: true })).rejects.toThrow(new Error(message));
  });

  it('turns a thrown network failure into a friendly error too', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await expect(setConsent('share_ratings', false, { policyVersion: 'ratings-2026-10' })).rejects.toThrow('Couldn’t save that. Check your connection and try again.');
  });
});

describe('importing the module', () => {
  it('touches nothing until a function is called', () => {
    jest.isolateModules(() => {
      const rpc = jest.fn();
      const getSession = jest.fn();
      jest.doMock('../../src/config/supabase', () => ({ supabase: { rpc, auth: { getSession } } }));
      require('../../src/services/consentService');
      expect(rpc).not.toHaveBeenCalled();
      expect(getSession).not.toHaveBeenCalled();
    });
  });
});
