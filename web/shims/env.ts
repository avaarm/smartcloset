/**
 * Web shim for @env (react-native-dotenv).
 *
 * On web, env vars come from Vite's import.meta.env (prefixed VITE_).
 * This module re-exports them without the prefix so `@env` consumers work.
 *
 * To set vars for the web build, create a `.env` file in the project root
 * with VITE_ prefixed vars: VITE_SUPABASE_URL, VITE_GOOGLE_VISION_API_KEY, etc.
 */

const meta = (import.meta as any).env ?? {};

// Strip "VITE_" prefix and re-export all
const envVars: Record<string, string> = {};
for (const [key, value] of Object.entries(meta)) {
  if (key.startsWith('VITE_')) {
    envVars[key.slice(5)] = value as string;
  }
}

// Also allow non-prefixed (fallback for development)
export const SUPABASE_URL = envVars.SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY ?? '';
export const GOOGLE_VISION_API_KEY = envVars.GOOGLE_VISION_API_KEY ?? '';
export const GOOGLE_CLOUD_PROJECT_ID = envVars.GOOGLE_CLOUD_PROJECT_ID ?? '';
export const GOOGLE_VISION_LOCATION = envVars.GOOGLE_VISION_LOCATION ?? 'us-west1';
export const GOOGLE_CSE_ID = envVars.GOOGLE_CSE_ID ?? '';
export const GOOGLE_CSE_API_KEY = envVars.GOOGLE_CSE_API_KEY ?? '';
export const OPENAI_API_KEY = envVars.OPENAI_API_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID = envVars.GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = envVars.GOOGLE_IOS_CLIENT_ID ?? '';
export const APPLE_SERVICE_ID = envVars.APPLE_SERVICE_ID ?? '';
export const APP_ENV = envVars.APP_ENV ?? 'development';
export const APP_VERSION = envVars.APP_VERSION ?? '1.0.0';
export const ENABLE_AI_SUGGESTIONS = envVars.ENABLE_AI_SUGGESTIONS ?? 'true';
export const ENABLE_VISION_API = envVars.ENABLE_VISION_API ?? 'true';
export const ENABLE_AI_BODY_ANALYSIS = envVars.ENABLE_AI_BODY_ANALYSIS ?? 'true';
export const ENABLE_REVERSE_IMAGE_SEARCH = envVars.ENABLE_REVERSE_IMAGE_SEARCH ?? 'true';
export const ENABLE_OFFLINE_MODE = envVars.ENABLE_OFFLINE_MODE ?? 'true';
export const MAX_IMAGE_SIZE_MB = envVars.MAX_IMAGE_SIZE_MB ?? '10';
export const IMAGE_QUALITY = envVars.IMAGE_QUALITY ?? '80';
export const THUMBNAIL_SIZE = envVars.THUMBNAIL_SIZE ?? '300';
