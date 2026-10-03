import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
// @ts-ignore — resolved by react-native-dotenv babel plugin
import { SUPABASE_URL } from '@env';

// auth-js stores the session under this key (see GoTrueClient: sb-<host label>-auth-token).
const storedSessionKey = (): string | null => {
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
};

const readStoredUserId = async (): Promise<string | null> => {
  const key = storedSessionKey();
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    const id = raw ? JSON.parse(raw)?.user?.id : null;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
};

/**
 * The signed-in user's id, or null for a guest.
 *
 * When the saved login has expired and there is no network, getSession() returns
 * no session (an AuthRetryableFetchError) even though the user is still signed in
 * and the saved session is kept for the next refresh. Treating that as "guest"
 * would show the local demo store instead of their closet, so in that case fall
 * back to the user id in the saved session. Cloud calls then fail normally
 * (offline) rather than silently reading or writing the guest store.
 */
export const getAuthUserId = async (): Promise<string | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session?.user) return session.user.id;
    if (error && (error as any).name === 'AuthRetryableFetchError') {
      return await readStoredUserId();
    }
    return null;
  } catch {
    return null;
  }
};
