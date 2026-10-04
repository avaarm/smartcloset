/**
 * What the user reads when an AI feature can't run: never status codes,
 * "ai-proxy", provider names or JSON. Covers the error mapping itself and the
 * end-to-end photo-analysis result for a guest, a user who said no to AI, and
 * a signed-in user who is offline.
 */
let mockSession: { user: { id: string }; access_token: string } | null = null;
let mockSessionError: { name: string } | null = null;
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession }, error: mockSessionError }),
    },
  },
}));
jest.mock('../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    ENABLE_VISION_API: true,
    GOOGLE_VISION_API_KEY: '',
    BRAVE_API_KEY: '',
  },
  hasGoogleVision: () => true,
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));

// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  callAiProxy,
  classifyAiError,
  classifyAiErrors,
  friendlyAiMessage,
  AI_SEARCH_OFF_MESSAGE,
  type AiFailure,
} from '../../src/services/aiProxy';
import { AI_CONSENT_ERROR } from '../../src/services/aiConsent';
import { analyzeClothingImage } from '../../src/services/imageRecognition';

// auth-js keeps the saved login under this key.
const STORED_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const DEV_TEXT = /ai-proxy|not_signed_in|session_unavailable|ai_consent|\b[45]\d\d\b|openai|google|vision|brave|supabase|json|undefined|null/i;

const mockFetch = jest.fn();
beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession = null;
  mockSessionError = null;
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const signIn = async (consent?: 'granted' | 'denied') => {
  mockSession = { user: { id: 'user-1' }, access_token: 'tok' };
  if (consent) await AsyncStorage.setItem('@smartcloset_ai_consent_v1:user-1', consent);
};

describe('classifyAiError', () => {
  it('recognises a signed-out caller', () => {
    expect(classifyAiError(new Error('not_signed_in: ai-proxy requires an authenticated user'))).toBe('signed_out');
  });

  it('treats a proxy 401 like being signed out', () => {
    expect(classifyAiError(new Error('ai-proxy vision 401: {"error":"jwt expired"}'))).toBe('signed_out');
    expect(classifyAiError(new Error('ai-proxy openai-vision 401: nope'))).toBe('signed_out');
  });

  it('recognises AI turned off', () => {
    expect(classifyAiError(new Error(AI_CONSENT_ERROR))).toBe('consent');
  });

  it('files everything else under other', () => {
    expect(classifyAiError(new Error('ai-proxy vision 500: boom'))).toBe('other');
    expect(classifyAiError(new Error('ai-proxy vision 4010: boom'))).toBe('other');
    expect(classifyAiError(new TypeError('Network request failed'))).toBe('other');
    expect(classifyAiError(new Error('session_unavailable: saved login could not be refreshed'))).toBe('other');
    expect(classifyAiError('weird')).toBe('other');
    expect(classifyAiError(undefined)).toBe('other');
    expect(classifyAiError({ message: 42 })).toBe('other');
  });

  it('picks the most actionable cause across several calls', () => {
    const signedOut = new Error('not_signed_in: x');
    const consent = new Error(AI_CONSENT_ERROR);
    const boom = new Error('ai-proxy vision 500');
    expect(classifyAiErrors([boom, signedOut])).toBe('signed_out');
    expect(classifyAiErrors([consent, boom])).toBe('consent');
    expect(classifyAiErrors([boom, boom])).toBe('other');
    expect(classifyAiErrors([])).toBe('other');
  });
});

describe('friendlyAiMessage', () => {
  it('has specific, friendly wording for each case', () => {
    expect(friendlyAiMessage('signed_out', 'analyze')).toBe(
      'Sign in to let SmartCloset identify items from photos. You can still fill in the details yourself.',
    );
    expect(friendlyAiMessage('consent', 'search')).toBe(AI_SEARCH_OFF_MESSAGE);
    expect(friendlyAiMessage('consent', 'analyze')).toContain('Settings > Privacy');
    expect(friendlyAiMessage('other', 'analyze')).toContain('fill in the details yourself');
    expect(friendlyAiMessage('other', 'search')).toContain('try again');
  });

  it.each(['signed_out', 'consent', 'other'] as AiFailure[])('never leaks developer text (%s)', failure => {
    for (const task of ['analyze', 'search'] as const) {
      const msg = friendlyAiMessage(failure, task);
      expect(msg).toBeTruthy();
      expect(msg).not.toMatch(DEV_TEXT);
    }
  });
});

describe('callAiProxy errors', () => {
  it('a guest has no session and is classified as signed out', async () => {
    await expect(callAiProxy('vision', { requests: [] })).rejects.toMatchObject({
      message: expect.stringContaining('not_signed_in'),
    });
    const err = await callAiProxy('brave', { q: 'x' }).catch(e => e);
    expect(classifyAiError(err)).toBe('signed_out');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('a signed-in user whose login cannot be refreshed offline is not treated as a guest', async () => {
    // Offline, auth-js reports a retryable fetch error but keeps the saved login.
    await AsyncStorage.setItem(STORED_KEY, JSON.stringify({ user: { id: 'user-1' } }));
    mockSessionError = { name: 'AuthRetryableFetchError' };

    const err = await callAiProxy('vision', { requests: [] }).catch(e => e);

    expect(err).toBeInstanceOf(Error);
    expect(classifyAiError(err)).toBe('other');
    expect(friendlyAiMessage(classifyAiError(err), 'analyze')).not.toMatch(/sign in/i);
  });

  it('a proxy 401 is classified as signed out', async () => {
    await signIn('granted');
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"jwt expired"}' });
    const err = await callAiProxy('brave', { q: 'x' }).catch(e => e);
    expect(classifyAiError(err)).toBe('signed_out');
  });
});

describe('analyzeClothingImage when AI cannot run', () => {
  it('a guest gets no AI result, tagged signed_out, without any network call', async () => {
    const result = await analyzeClothingImage('file:///photo.jpg');

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('signed_out');
    expect(result.category).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('AI turned off is tagged consent and nothing is sent', async () => {
    await signIn('denied');

    const result = await analyzeClothingImage('file:///photo.jpg');

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('consent');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('a signed-in user who is offline gets the generic reason', async () => {
    await signIn('granted');
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    const result = await analyzeClothingImage('file:///photo.jpg');

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('other');
  });

  it('a server error is the generic reason, not a sign-in prompt', async () => {
    await signIn('granted');
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'internal' });

    const result = await analyzeClothingImage('file:///photo.jpg');

    expect(result.isReal).toBe(false);
    expect(result.unavailableReason).toBe('other');
  });

  it('a proxy 401 on a signed-in user asks them to sign in again', async () => {
    await signIn('granted');
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"jwt"}' });

    const result = await analyzeClothingImage('file:///photo.jpg');

    expect(result.unavailableReason).toBe('signed_out');
  });
});
