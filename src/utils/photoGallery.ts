/**
 * The photos of the piece being added or edited, as the form changes them. Plain functions over a list (cover first)
 * and the subset of it that came from a picked shop match, so every rule is testable without a screen:
 *
 *  - the person's own photos and the shop's photos live in one list, in order; `shop` says which ones are the shop's
 *  - a list never holds a repeat and never more than `max`
 *  - a new match replaces the shop photos the last match brought and leaves everything else alone
 */

import { MAX_ITEM_IMAGES, normalizeImages } from './itemImages';

export type Gallery = {
  /** Every photo, cover first. */
  photos: string[];
  /** The photos (a subset of `photos`) that came from a picked match rather than from the person. */
  shop: string[];
};

export const EMPTY_GALLERY: Gallery = { photos: [], shop: [] };

const settle = (photos: ReadonlyArray<string>, shop: ReadonlyArray<string>, max: number): Gallery => {
  const list = normalizeImages(photos, max);
  return { photos: list, shop: shop.filter((u, i) => list.includes(u) && shop.indexOf(u) === i) };
};

/** Moves `uri` to the front. A photo that is not in the list changes nothing. */
export const makeCover = (g: Gallery, uri: string, max = MAX_ITEM_IMAGES): Gallery =>
  g.photos.includes(uri) && g.photos[0] !== uri ? settle([uri, ...g.photos.filter(p => p !== uri)], g.shop, max) : g;

/** Takes `uri` out. The next photo, if any, becomes the cover. */
export const removePhoto = (g: Gallery, uri: string, max = MAX_ITEM_IMAGES): Gallery =>
  g.photos.includes(uri) ? settle(g.photos.filter(p => p !== uri), g.shop, max) : g;

/** A new cover in place of the old one (the big photo area): the other photos stay. */
export const replaceCover = (g: Gallery, uri: string, max = MAX_ITEM_IMAGES): Gallery =>
  settle([uri, ...g.photos.slice(1)], g.shop, max);

/** The person's own photos, after the ones already there. */
export const addOwnPhotos = (g: Gallery, uris: ReadonlyArray<string>, max = MAX_ITEM_IMAGES): Gallery =>
  settle([...g.photos, ...uris], g.shop, max);

/**
 * A match was picked: its pictures replace the ones the previous match brought. The person's own photos keep their
 * place, in front; with none of them, the first shop picture is the cover. A picture the person already removed
 * (`blocked`) is not brought back, and nothing goes past `max`.
 */
export const replaceShopPhotos = (
  g: Gallery,
  incoming: ReadonlyArray<string>,
  blocked: ReadonlySet<string> = new Set(),
  max = MAX_ITEM_IMAGES,
): Gallery => {
  const own = g.photos.filter(u => !g.shop.includes(u));
  const room = Math.max(0, max - own.length);
  const added = normalizeImages(incoming, max)
    .filter(u => !own.includes(u) && !blocked.has(u))
    .slice(0, room);
  return { photos: [...own, ...added], shop: added };
};

/** More pictures of the picked match, once they are known: they go on the end, in whatever room is left. */
export const appendShopPhotos = (
  g: Gallery,
  incoming: ReadonlyArray<string>,
  blocked: ReadonlySet<string> = new Set(),
  max = MAX_ITEM_IMAGES,
): Gallery => {
  const room = Math.max(0, max - g.photos.length);
  const added = normalizeImages(incoming, max)
    .filter(u => !g.photos.includes(u) && !blocked.has(u))
    .slice(0, room);
  return added.length === 0 ? g : { photos: [...g.photos, ...added], shop: [...g.shop, ...added] };
};
