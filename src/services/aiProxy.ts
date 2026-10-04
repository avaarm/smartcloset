/**
 * Client for the `ai-proxy` Supabase Edge Function.
 *
 * Replaces direct calls to Google Vision / OpenAI / Brave Search so secret
 * API keys never ship in the JS bundle. The proxy authenticates the user via
 * their Supabase JWT and forwards the request server-side using secrets
 * stored in Supabase Secrets.
 *
 * Dev fallback: if the proxy returns 503 (secrets not yet configured in
 * Supabase) AND a key is present in the local .env, the call is made directly
 * to the provider. This lets the feature work during development without
 * requiring Supabase secret deployment.
 *
 * Server: supabase/functions/ai-proxy/index.ts
 */

import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { ensureAiConsent, AI_CONSENT_ERROR } from './aiConsent';
import { getAuthUserId } from './authUser';

export type AIProvider = 'vision' | 'openai-vision' | 'brave';

// Error text is for developer logs only. Anything the user reads goes through
// classifyAiError + friendlyAiMessage so status codes, "ai-proxy" and provider
// names never reach the screen.
const NOT_SIGNED_IN = 'not_signed_in';
const SESSION_UNAVAILABLE = 'session_unavailable';

export type AiFailure = 'signed_out' | 'consent' | 'other';

export const classifyAiError = (err: unknown): AiFailure => {
  const msg = typeof (err as any)?.message === 'string' ? (err as any).message : '';
  if (msg === AI_CONSENT_ERROR) return 'consent';
  // A 401 from the proxy means it did not accept the login, which the user
  // fixes the same way as being signed out.
  if (msg.startsWith(NOT_SIGNED_IN) || /^ai-proxy \S+ 401\b/.test(msg)) return 'signed_out';
  return 'other';
};

/** One failure for several calls made together (e.g. Vision + OpenAI): the most actionable cause wins. */
export const classifyAiErrors = (errs: unknown[]): AiFailure => {
  const kinds = errs.map(classifyAiError);
  if (kinds.includes('signed_out')) return 'signed_out';
  if (kinds.includes('consent')) return 'consent';
  return 'other';
};

export const AI_SEARCH_OFF_MESSAGE =
  'AI photo search is turned off. You can turn it on in Settings > Privacy.';

/** What to tell the user when a photo analysis ('analyze') or a match search ('search') fails. */
export const friendlyAiMessage = (failure: AiFailure, task: 'analyze' | 'search'): string => {
  if (task === 'analyze') {
    if (failure === 'signed_out') {
      return 'Sign in to let SmartCloset identify items from photos. You can still fill in the details yourself.';
    }
    if (failure === 'consent') {
      return 'AI photo analysis is turned off. You can turn it on in Settings > Privacy.';
    }
    return "Couldn't analyze that photo right now. Check your connection, or fill in the details yourself.";
  }
  if (failure === 'signed_out') return 'Sign in to search for matches.';
  if (failure === 'consent') return AI_SEARCH_OFF_MESSAGE;
  return "Couldn't search right now. Check your connection and try again.";
};

const buildProxyUrl = (): string => {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  return `${base}/functions/v1/ai-proxy`;
};

// Direct Google Vision call used as dev fallback when proxy secrets aren't set.
const callGoogleVisionDirect = async (payload: unknown): Promise<unknown> => {
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`vision-direct ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
};

// Direct Brave Search call used as dev fallback when proxy secrets aren't
// set. Mirrors callGoogleVisionDirect above. Uses the Image Search endpoint
// since callers want product photos, not web page results.
const callBraveDirect = async (payload: any): Promise<unknown> => {
  const params = new URLSearchParams({
    q: payload?.q ?? '',
    count: String(Math.min(Number(payload?.num) || 10, 20)),
    safesearch: payload?.safe === 'off' ? 'off' : 'strict',
  });

  const resp = await fetch(`https://api.search.brave.com/res/v1/images/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': env.BRAVE_API_KEY,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`brave-direct ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
};

/**
 * Call the ai-proxy. Returns the parsed JSON response from the upstream
 * provider, or throws on auth/network/4xx/5xx.
 */
export const callAiProxy = async <T = unknown>(
  provider: AIProvider,
  payload: unknown,
): Promise<T> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    // A signed-in user whose saved login can't be refreshed (offline) also has
    // no session here. That is a connection problem, not a signed-out guest.
    if (await getAuthUserId()) {
      throw new Error(`${SESSION_UNAVAILABLE}: saved login could not be refreshed`);
    }
    throw new Error(`${NOT_SIGNED_IN}: ai-proxy requires an authenticated user`);
  }

  // These two carry the user's photo to third-party AI services, which needs
  // their explicit permission (asked once, remembered). Brave only gets a text query.
  if (provider === 'vision' || provider === 'openai-vision') {
    if (!(await ensureAiConsent())) throw new Error(AI_CONSENT_ERROR);
  }

  const resp = await fetch(buildProxyUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ provider, payload }),
  });

  if (!resp.ok) {
    // Dev fallback: proxy unavailable (not deployed = 404, secrets missing = 503)
    // but we have a client-side key in .env — call the provider directly.
    if ((resp.status === 503 || resp.status === 404) && provider === 'vision' && env.GOOGLE_VISION_API_KEY) {
      console.log('[ai-proxy] vision proxy', resp.status, '— falling back to direct Vision API call');
      return callGoogleVisionDirect(payload) as Promise<T>;
    }
    if ((resp.status === 503 || resp.status === 404) && provider === 'brave' && env.BRAVE_API_KEY) {
      console.log('[ai-proxy] brave proxy', resp.status, '— falling back to direct Brave Search call');
      return callBraveDirect(payload) as Promise<T>;
    }
    const text = await resp.text();
    throw new Error(`ai-proxy ${provider} ${resp.status}: ${text.substring(0, 300)}`);
  }
  return resp.json() as Promise<T>;
};

/** True iff the proxy is reachable (i.e. user signed in AND SUPABASE_URL set). */
export const hasAiProxy = (): boolean => env.SUPABASE_URL.length > 0;
