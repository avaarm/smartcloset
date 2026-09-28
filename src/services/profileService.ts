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

/** body_profiles has separate typed columns (see 001_initial_schema.sql), not
 * a single JSON blob — map BodyProfile <-> row explicitly. */
const mapDbToProfile = (row: any): BodyProfile => ({
  skinTone: row.skin_tone,
  undertone: row.undertone,
  bodyType: row.body_type,
  recommendedPalette: row.recommended_palette || [],
  avoidColors: row.avoid_colors || [],
  recommendedFits: row.recommended_fits || { tops: [], bottoms: [], dresses: [] },
  sizeHints: row.size_hints || {},
  facePhotoUri: row.face_photo_uri ?? undefined,
  updatedAt: row.updated_at,
});

const mapProfileToDb = (profile: BodyProfile, userId: string) => ({
  user_id: userId,
  skin_tone: profile.skinTone,
  undertone: profile.undertone,
  body_type: profile.bodyType,
  recommended_palette: profile.recommendedPalette,
  avoid_colors: profile.avoidColors,
  recommended_fits: profile.recommendedFits,
  size_hints: profile.sizeHints,
  face_photo_uri: profile.facePhotoUri,
  updated_at: profile.updatedAt,
});

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
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();
      // If the table doesn't exist, or no row yet, fall through to AsyncStorage.
      if (!error && data) {
        return mapDbToProfile(data);
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

    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(mapProfileToDb(payload, session.user.id), { onConflict: 'user_id' });
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
