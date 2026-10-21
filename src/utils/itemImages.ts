/**
 * An item's photos. `images` is the whole gallery, cover first; `userImage` and `retailerImage` keep
 * holding the cover so every place that shows one picture still works (see types ClothingItem.images).
 * Older items have no list, so the gallery is built from whatever single picture they had.
 */

import type { ClothingItem } from '../types';

export const MAX_ITEM_IMAGES = 8;

type ImageFields = Pick<ClothingItem, 'images' | 'userImage' | 'retailerImage'> & { imageUrl?: string };

const clean = (u: unknown): string => (typeof u === 'string' ? u.trim() : '');

/** Trimmed, non-empty, without repeats (first one wins), at most `max`. */
export const normalizeImages = (list: ReadonlyArray<string | null | undefined> | null | undefined, max = MAX_ITEM_IMAGES): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const u = clean(raw);
    if (u === '' || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
};

/** All of the item's photos, cover first. */
export const itemImages = (item: ImageFields): string[] => {
  const list = normalizeImages(item.images);
  if (list.length > 0) return list;
  return normalizeImages([item.userImage, item.retailerImage, item.imageUrl]).slice(0, 1);
};

/** The picture to show when only one fits. */
export const coverImage = (item: ImageFields): string | undefined => itemImages(item)[0];

/**
 * The fields to save for a gallery: the list itself plus the cover in both single-picture fields, which is
 * what the rest of the app reads. An empty gallery clears all three ('' for the cover fields, like the form's other fields).
 */
export const imageFieldsFor = (images: ReadonlyArray<string | null | undefined>): { images: string[]; userImage: string; retailerImage: string } => {
  const list = normalizeImages(images);
  return { images: list, userImage: list[0] ?? '', retailerImage: list[0] ?? '' };
};
