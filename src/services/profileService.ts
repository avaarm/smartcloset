/**
 * profileService — persistent store for the user's style/body profile.
 *
 * Hybrid storage: Supabase `body_profiles` table if authenticated, otherwise
 * AsyncStorage for guest mode. Gracefully handles a missing Supabase table by
 * falling back to local storage.
 *
 * The profile is produced by Phase 4's BodyProfileOnboardingScreen and consumed
 * by OutfitScreen (smart suggestions) and HomeScreen (CTA if missing).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

export type SkinTone = 'fair' | 'light' | 'medium' | 'tan' | 'deep' | 'rich';
export type Undertone = 'cool' | 'neutral' | 'warm';
export type BodyType =
  | 'hourglass'
  | 'pear'
  | 'apple'
  | 'rectangle'
  | 'inverted-triangle';

export type BodyProfile = {
  skinTone: SkinTone;
  undertone: Undertone;
  bodyType: BodyType;
  recommendedPalette: string[]; // hex colors
  avoidColors: string[];         // hex colors
  recommendedFits: {
    tops: string[];
    bottoms: string[];
    dresses: string[];
  };
  sizeHints: {
    tops?: string;
    bottoms?: string;
    shoes?: string;
  };
  updatedAt: string;
  /** Optional face photo URI used to derive the skin tone. */
  facePhotoUri?: string;
};

const STORAGE_KEY = '@smartcloset_body_profile';
const SUPABASE_TABLE = 'body_profiles';

/**
 * Get the current user's body profile, or null if none exists.
 * Tries Supabase first (if signed in), falls back to AsyncStorage.
 */
export const getBodyProfile = async (): Promise<BodyProfile | null> => {
  // Try Supabase first if signed in
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('profile')
        .eq('user_id', session.user.id)
        .maybeSingle();
      // If the table doesn't exist we get a 42P01 PostgREST error — fall through
      // to AsyncStorage silently.
      if (!error && data?.profile) {
        return data.profile as BodyProfile;
      }
    }
  } catch {
    // ignore, fall through to local
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BodyProfile) : null;
  } catch {
    return null;
  }
};

/**
 * Save a body profile. Writes to Supabase if signed in; always mirrors to
 * AsyncStorage so guest/offline mode works.
 */
export const saveBodyProfile = async (profile: BodyProfile): Promise<void> => {
  const payload: BodyProfile = { ...profile, updatedAt: new Date().toISOString() };

  // Mirror to local first (always succeeds)
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[profileService] local save failed:', e);
  }

  // Then try Supabase
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase.from(SUPABASE_TABLE).upsert(
      { user_id: session.user.id, profile: payload },
      { onConflict: 'user_id' },
    );
    if (error) {
      // Table missing or RLS policy refuses → degrade silently to local-only.
      console.warn('[profileService] supabase save failed, local only:', error.message);
    }
  } catch (e) {
    console.warn('[profileService] supabase save exception:', e);
  }
};

/**
 * Remove the saved profile.
 */
export const clearBodyProfile = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from(SUPABASE_TABLE).delete().eq('user_id', session.user.id);
    }
  } catch {}
};
