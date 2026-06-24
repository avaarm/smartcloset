/**
 * Client for the `ai-proxy` Supabase Edge Function.
 *
 * Replaces direct calls to Google Vision / OpenAI / Google CSE so secret API
 * keys never ship in the JS bundle. The proxy authenticates the user via
 * their Supabase JWT and forwards the request server-side using secrets
 * stored in Supabase Secrets.
 *
 * Server: supabase/functions/ai-proxy/index.ts
 */

import { supabase } from '../config/supabase';
import { env } from '../config/env';

export type AIProvider = 'vision' | 'openai' | 'openai-vision' | 'cse';

const buildProxyUrl = (): string => {
  // SUPABASE_URL is https://<project>.supabase.co — functions live at
  // <project>.supabase.co/functions/v1/<name>
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  return `${base}/functions/v1/ai-proxy`;
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

  const resp = await fetch(buildProxyUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ provider, payload }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ai-proxy ${provider} ${resp.status}: ${text.substring(0, 300)}`);
  }
  return resp.json() as Promise<T>;
};

/** True iff the proxy is reachable (i.e. user signed in AND SUPABASE_URL set). */
export const hasAiProxy = (): boolean => env.SUPABASE_URL.length > 0;
