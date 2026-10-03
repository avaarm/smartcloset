/**
 * Photo links for the private `wardrobe-images` bucket.
 *
 * The database keeps one stable, canonical form of each photo link
 * (…/storage/v1/object/public/wardrobe-images/<uid>/<file>) — it is only a way
 * to name the file; the bucket is private, so that link alone shows nothing.
 * Whenever items are loaded for display we swap it for a temporary signed link,
 * and whenever items are saved we turn it back (canonicalizeImageUrl), so an
 * expiring link is never written to the database.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import type { ClothingItem } from '../types';

export const IMAGE_BUCKET = 'wardrobe-images';

const SIGN_TTL_SECONDS = 24 * 60 * 60;
// Reuse a cached signed link until it is this close to expiring, so the same
// URL (and the image cache behind it) is reused across screens and app launches.
const REFRESH_MARGIN_MS = 3 * 60 * 60 * 1000;
const CHUNK = 100;
const CACHE_KEY = '@smartcloset_signed_image_urls_v1';

// …/storage/v1/object/{public|sign|authenticated}/wardrobe-images/<path>[?token=…]
const OBJECT_URL = /^(https?:\/\/[^/]+)\/storage\/v1\/object\/(?:public|sign|authenticated)\/wardrobe-images\/([^?#]+)(?:[?#].*)?$/;

type Entry = { url: string; exp: number };
const cache = new Map<string, Entry>();
let loaded: Promise<void> | null = null;

/** Storage object path (e.g. "<uid>/<file>.jpg") for a bucket URL, else null. */
export const storagePathFromUrl = (url?: string | null): string | null => {
  const m = url ? OBJECT_URL.exec(url) : null;
  if (!m) return null;
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return m[2];
  }
};

/** Canonical stored form of a bucket URL (strips signed-URL tokens); other URLs unchanged. */
export const canonicalizeImageUrl = <T extends string | null | undefined>(url: T): T => {
  if (!url) return url;
  const m = OBJECT_URL.exec(url);
  return (m ? `${m[1]}/storage/v1/object/public/${IMAGE_BUCKET}/${m[2]}` : url) as T;
};

const ensureLoaded = (): Promise<void> => {
  if (!loaded) {
    loaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) return;
        const now = Date.now();
        const parsed = JSON.parse(raw) as Record<string, Entry>;
        for (const [path, e] of Object.entries(parsed)) {
          if (e && typeof e.url === 'string' && e.exp - now > REFRESH_MARGIN_MS) cache.set(path, e);
        }
      } catch {
        // A bad cache just means we sign again.
      }
    })();
  }
  return loaded;
};

const persist = async () => {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Non-fatal.
  }
};

/** Signed URLs for storage paths (cached; falls back to an empty entry on failure). */
export const signStoragePaths = async (paths: string[]): Promise<Map<string, string>> => {
  await ensureLoaded();
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths)) {
    const e = cache.get(p);
    if (e && e.exp - now > REFRESH_MARGIN_MS) out.set(p, e.url);
    else need.push(p);
  }

  let changed = false;
  for (let i = 0; i < need.length; i += CHUNK) {
    const batch = need.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(batch, SIGN_TTL_SECONDS);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.signedUrl && row.path && !row.error) {
          cache.set(row.path, { url: row.signedUrl, exp: now + SIGN_TTL_SECONDS * 1000 });
          out.set(row.path, row.signedUrl);
          changed = true;
        }
      }
    } catch (e: any) {
      console.warn('[imageUrls] signing failed:', e?.message);
    }
  }
  if (changed) await persist();
  return out;
};

/** A display/fetchable URL for any image URL: signs bucket URLs, passes others through. */
export const resolveImageUrl = async (url: string): Promise<string> => {
  const path = storagePathFromUrl(url);
  if (!path) return url;
  const signed = await signStoragePaths([path]);
  return signed.get(path) ?? url;
};

/** Replace bucket photo links on items with signed links (everything else untouched). */
export const withSignedImages = async <T extends Pick<ClothingItem, 'userImage' | 'retailerImage'>>(
  items: T[],
): Promise<T[]> => {
  const paths: string[] = [];
  for (const it of items) {
    for (const u of [it.userImage, it.retailerImage]) {
      const p = storagePathFromUrl(u);
      if (p) paths.push(p);
    }
  }
  if (paths.length === 0) return items;
  const signed = await signStoragePaths(paths);
  const swap = (u?: string): string | undefined => {
    const p = storagePathFromUrl(u);
    return (p && signed.get(p)) || u;
  };
  return items.map(it => ({ ...it, userImage: swap(it.userImage), retailerImage: swap(it.retailerImage) }));
};

/** Forget cached signed links (call on sign-out). */
export const clearSignedImageCache = async (): Promise<void> => {
  cache.clear();
  loaded = null;
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Non-fatal.
  }
};
