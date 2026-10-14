/**
 * Temporary links for photos in the private swap-photos bucket. They last ten minutes and
 * are kept in memory only (never AsyncStorage): a photo that is withdrawn, or belongs to
 * someone who blocked you, stops loading soon after, and other people's links never sit on
 * the device's disk.
 */
import { supabase } from '../config/supabase';
import { SWAP_PHOTO_TTL_SECONDS } from '../config/swapRules';

export const SWAP_PHOTO_BUCKET = 'swap-photos';

type Entry = { url: string; exp: number };
const cache = new Map<string, Entry>();
// Reuse a link only while it has at least two minutes left.
const MIN_LEFT_MS = 120_000;
const CHUNK = 100;

/**
 * Returns a link for every path that could be signed. A path with no link is either unavailable for now
 * (offline, or the call failed) or definitively gone (the call worked but the object is not there or not
 * allowed any more). A caller that must tell the two apart passes `outcome.missing` and gets the second
 * kind added to it; a path from a call that threw or answered with an error is never added.
 */
export const signSwapPhotos = async (paths: string[], outcome?: { missing?: Set<string> }): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths.filter(Boolean))) {
    const hit = cache.get(p);
    if (hit && hit.exp - now > MIN_LEFT_MS) out.set(p, hit.url);
    else need.push(p);
  }
  for (let i = 0; i < need.length; i += CHUNK) {
    const batch = need.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase.storage.from(SWAP_PHOTO_BUCKET).createSignedUrls(batch, SWAP_PHOTO_TTL_SECONDS);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.signedUrl && row.path && !row.error) {
          cache.set(row.path, { url: row.signedUrl, exp: now + SWAP_PHOTO_TTL_SECONDS * 1000 });
          out.set(row.path, row.signedUrl);
        }
      }
      if (outcome?.missing && Array.isArray(data)) {
        for (const p of batch) if (!out.has(p)) outcome.missing.add(p);
      }
    } catch {
      // A photo that cannot be signed (not allowed any more, or offline) simply has no link.
    }
  }
  return out;
};

export const forgetSwapPhoto = (path: string): void => {
  cache.delete(path);
};

/** Call on sign-out and after account deletion. */
export const clearSwapPhotoCache = (): void => {
  cache.clear();
};
