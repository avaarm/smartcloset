import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { clearSignedImageCache } from './imageUrls';

/**
 * Permanently deletes the signed-in user's account: the server removes the data,
 * the account and the uploaded photos (see supabase/functions/delete-account),
 * then everything stored on this device is wiped and the session is dropped.
 * Throws if the server could not delete the account (nothing local is touched).
 */
export const deleteAccount = async (): Promise<{ photosIncomplete: boolean }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_signed_in');

  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;

  // The account is gone. Local cleanup is best-effort: none of it may report the
  // deletion as failed.
  try {
    await AsyncStorage.clear();
  } catch {}
  try {
    await clearSignedImageCache();
  } catch {}
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {}

  return { photosIncomplete: Boolean((data as any)?.photosIncomplete) };
};
