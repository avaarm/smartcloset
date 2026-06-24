/**
 * Typed environment config accessor.
 *
 * All environment variables go through this module. Code should never import
 * from `@env` directly — always import from `./env`. That way we have:
 *   1. a single source of truth for which keys exist
 *   2. typed access with fallbacks
 *   3. easy swap to a different loader (Expo constants, import.meta.env, etc.)
 *
 * Keys come from `.env` via `react-native-dotenv` (configured in babel.config.js).
 * See `.env.example` for the canonical list.
 */

// @ts-ignore — resolved by react-native-dotenv babel plugin at build time
import {
  SUPABASE_URL as _SUPABASE_URL,
  SUPABASE_ANON_KEY as _SUPABASE_ANON_KEY,
  GOOGLE_VISION_API_KEY as _GOOGLE_VISION_API_KEY,
  GOOGLE_CLOUD_PROJECT_ID as _GOOGLE_CLOUD_PROJECT_ID,
  GOOGLE_VISION_LOCATION as _GOOGLE_VISION_LOCATION,
  GOOGLE_CSE_ID as _GOOGLE_CSE_ID,
  GOOGLE_CSE_API_KEY as _GOOGLE_CSE_API_KEY,
  OPENAI_API_KEY as _OPENAI_API_KEY,
  GOOGLE_WEB_CLIENT_ID as _GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID as _GOOGLE_IOS_CLIENT_ID,
  APPLE_SERVICE_ID as _APPLE_SERVICE_ID,
  APP_ENV as _APP_ENV,
  APP_VERSION as _APP_VERSION,
  ENABLE_AI_SUGGESTIONS as _ENABLE_AI_SUGGESTIONS,
  ENABLE_VISION_API as _ENABLE_VISION_API,
  ENABLE_AI_BODY_ANALYSIS as _ENABLE_AI_BODY_ANALYSIS,
  ENABLE_REVERSE_IMAGE_SEARCH as _ENABLE_REVERSE_IMAGE_SEARCH,
  ENABLE_OFFLINE_MODE as _ENABLE_OFFLINE_MODE,
  MAX_IMAGE_SIZE_MB as _MAX_IMAGE_SIZE_MB,
  IMAGE_QUALITY as _IMAGE_QUALITY,
  THUMBNAIL_SIZE as _THUMBNAIL_SIZE,
  SENTRY_DSN as _SENTRY_DSN,
  // @ts-ignore
} from '@env';

/** Read a string env var, empty string if missing. */
const str = (v: any, fallback = ''): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback;

/** Read a boolean env var. Accepts "true"/"1"/"yes" (case-insensitive). */
const bool = (v: any, fallback = false): boolean => {
  if (v === undefined || v === null || v === '') return fallback;
  return /^(true|1|yes)$/i.test(String(v).trim());
};

/** Read a number env var, with fallback. */
const num = (v: any, fallback: number): number => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  // --- Supabase (required) ---
  SUPABASE_URL: str(_SUPABASE_URL),
  SUPABASE_ANON_KEY: str(_SUPABASE_ANON_KEY),

  // ─────────────────────────────────────────────────────────────────────────
  // ⚠️ Secret API keys (Vision / OpenAI / CSE) are NO LONGER read client-side.
  // They live in Supabase Secrets and are accessed via the ai-proxy Edge
  // Function (supabase/functions/ai-proxy/index.ts). These fields stay here
  // so .env stays backwards-compat for local dev, but app code should NOT
  // reference them — use callAiProxy() instead.
  // ─────────────────────────────────────────────────────────────────────────
  GOOGLE_VISION_API_KEY: str(_GOOGLE_VISION_API_KEY),
  GOOGLE_CLOUD_PROJECT_ID: str(_GOOGLE_CLOUD_PROJECT_ID),
  GOOGLE_VISION_LOCATION: str(_GOOGLE_VISION_LOCATION, 'us-west1'),
  GOOGLE_CSE_ID: str(_GOOGLE_CSE_ID),
  GOOGLE_CSE_API_KEY: str(_GOOGLE_CSE_API_KEY),
  OPENAI_API_KEY: str(_OPENAI_API_KEY),

  // --- Social auth (optional; stubs if missing) ---
  GOOGLE_WEB_CLIENT_ID: str(_GOOGLE_WEB_CLIENT_ID),
  GOOGLE_IOS_CLIENT_ID: str(_GOOGLE_IOS_CLIENT_ID),
  APPLE_SERVICE_ID: str(_APPLE_SERVICE_ID),

  // --- Sentry crash reporting ---
  SENTRY_DSN: str(_SENTRY_DSN),

  // --- App meta ---
  APP_ENV: str(_APP_ENV, 'development'),
  APP_VERSION: str(_APP_VERSION, '1.0.0'),

  // --- Feature flags ---
  ENABLE_AI_SUGGESTIONS: bool(_ENABLE_AI_SUGGESTIONS, true),
  ENABLE_VISION_API: bool(_ENABLE_VISION_API, true),
  ENABLE_AI_BODY_ANALYSIS: bool(_ENABLE_AI_BODY_ANALYSIS, true),
  ENABLE_REVERSE_IMAGE_SEARCH: bool(_ENABLE_REVERSE_IMAGE_SEARCH, true),
  ENABLE_OFFLINE_MODE: bool(_ENABLE_OFFLINE_MODE, true),

  // --- Limits & storage ---
  MAX_IMAGE_SIZE_MB: num(_MAX_IMAGE_SIZE_MB, 10),
  IMAGE_QUALITY: num(_IMAGE_QUALITY, 80),
  THUMBNAIL_SIZE: num(_THUMBNAIL_SIZE, 300),
};

/**
 * Helper: is AI Vision reachable?
 *
 * With the ai-proxy Edge Function in place, "reachable" means we have a
 * Supabase backend to proxy through. Per-call auth (user signed in) is
 * checked inside callAiProxy(); failures there fall back to mock results.
 */
export const hasGoogleVision = (): boolean =>
  env.ENABLE_VISION_API && env.SUPABASE_URL.length > 0;

/**
 * Helper: is Google Custom Search reachable via the proxy?
 * Same logic — server-side config is what matters; client just needs Supabase.
 */
export const hasGoogleShopping = (): boolean =>
  env.SUPABASE_URL.length > 0;

export default env;
