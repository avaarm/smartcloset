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

export type AIProvider = 'vision' | 'openai-vision' | 'brave';

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
    throw new Error('not_signed_in: ai-proxy requires an authenticated user');
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
