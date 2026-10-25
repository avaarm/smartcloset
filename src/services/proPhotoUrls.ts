/**
 * How a stylist's screen gets a photo of a shared closet piece (documentation/design/pro-accounts.md 4.8, 5.5).
 * There is no storage path and no signed link: the photo is requested from the pro-photo function by connection
 * and piece, with the signed-in person's own token, and the function checks the live grant on every request. A
 * grant that is switched off, narrowed or ended therefore stops the next request at once. The answer is marked
 * no-store, so nothing is cached by the system either. This module builds the request and keeps a small memo of
 * the requests it built, in memory only (never AsyncStorage), so a list that re-renders hands the image view the
 * same source and does not refetch.
 */
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { PRO_PHOTO_TTL_SECONDS } from '../config/proRules';
import { isUuid } from '../utils/proFormat';

export const PRO_PHOTO_FUNCTION = 'pro-photo';

/** What an image view needs: the address and the two headers the function reads. */
export interface ProPhotoSource {
  uri: string;
  headers: { Authorization: string; apikey: string };
}

type Entry = { token: string; source: ProPhotoSource; expires: number };

const memo = new Map<string, Entry>();
const MEMO_MAX = 500;

/**
 * The request for one piece's cover photo, or null: for a guest, for ids that are not uuids (the function answers a
 * bare 404 to those anyway) and when this build has no server address.
 */
export const proPhotoSource = async (connectionId: string, itemId: string): Promise<ProPhotoSource | null> => {
  if (!isUuid(connectionId) || !isUuid(itemId)) return null;
  const base = `${env.SUPABASE_URL ?? ''}`.replace(/\/+$/, '');
  if (!base) return null;
  let token: string | undefined;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  } catch {
    return null;
  }
  if (!token) return null;

  const key = `${connectionId}:${itemId}`;
  const hit = memo.get(key);
  if (hit && hit.token === token && hit.expires > Date.now()) return hit.source;

  const source: ProPhotoSource = {
    uri: `${base}/functions/v1/${PRO_PHOTO_FUNCTION}?c=${connectionId}&i=${itemId}`,
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  };
  if (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, { token, source, expires: Date.now() + PRO_PHOTO_TTL_SECONDS * 1000 });
  return source;
};

/** Call on sign-out and after account deletion. There is nothing else to clear: no file, no link, no key. */
export const clearProPhotoCache = (): void => {
  memo.clear();
};
