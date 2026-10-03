let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockUser ? { user: mockUser, access_token: 'tok' } : null } }) } },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureAiConsent, getAiConsent, setAiConsent, isAiConsentError, AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import { callAiProxy } from '../../src/services/aiProxy';

const answer = (which: 'Allow' | 'Not now') =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons: any) => {
    buttons.find((b: any) => b.text === which).onPress();
  });

const mockFetch = jest.fn();
beforeEach(async () => {
  await AsyncStorage.clear();
  mockUser = { id: 'user-1' };
  jest.restoreAllMocks();
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }), text: async () => '' });
  (global as any).fetch = mockFetch;
});

describe('ensureAiConsent', () => {
  it('asks once, remembers "Allow", and never asks again', async () => {
    const spy = answer('Allow');
    expect(await ensureAiConsent()).toBe(true);
    expect(await ensureAiConsent()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await getAiConsent()).toBe('granted');
  });

  it('remembers "Not now" and does not nag', async () => {
    const spy = answer('Not now');
    expect(await ensureAiConsent()).toBe(false);
    expect(await ensureAiConsent()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await getAiConsent()).toBe('denied');
  });

  it('two analysis calls started together share a single prompt', async () => {
    const spy = answer('Allow');
    const [a, b] = await Promise.all([ensureAiConsent(), ensureAiConsent()]);
    expect([a, b]).toEqual([true, true]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is per account', async () => {
    answer('Allow');
    await ensureAiConsent();
    mockUser = { id: 'user-2' };
    expect(await getAiConsent()).toBeNull();
  });

  it('never prompts or allows when signed out', async () => {
    mockUser = null;
    const spy = answer('Allow');
    expect(await ensureAiConsent()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('can be changed later in Settings', async () => {
    answer('Not now');
    await ensureAiConsent();
    await setAiConsent('granted');
    expect(await ensureAiConsent()).toBe(true);
  });
});

describe('callAiProxy photo gate', () => {
  it('does not send a photo anywhere when permission is refused', async () => {
    answer('Not now');
    await expect(callAiProxy('vision', { requests: [] })).rejects.toThrow(AI_CONSENT_ERROR);
    await expect(callAiProxy('openai-vision', { imageBase64: 'x' })).rejects.toThrow(AI_CONSENT_ERROR);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends the photo once permission is given', async () => {
    answer('Allow');
    await callAiProxy('vision', { requests: [] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not ask for text-only product search', async () => {
    const spy = jest.spyOn(Alert, 'alert');
    await callAiProxy('brave', { q: 'white tee' });
    expect(spy).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('recognises the consent error for friendly handling', () => {
    expect(isAiConsentError(new Error(AI_CONSENT_ERROR))).toBe(true);
    expect(isAiConsentError(new Error('network'))).toBe(false);
  });
});
