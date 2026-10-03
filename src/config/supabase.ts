import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

/**
 * createClient() throws at import time when the URL or key is empty, which made a
 * build with missing settings crash on launch (TestFlight build 9). Keep the app
 * alive instead: sign-in and network calls fail with an error, but it still opens.
 */
export const buildSupabaseClient = (url?: string, anonKey?: string) => {
  const configured = Boolean(url && anonKey);
  if (!configured) {
    console.error('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY are missing from this build');
  }
  return createClient(url || 'https://not-configured.invalid', anonKey || 'not-configured', {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: configured,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const supabase = buildSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
