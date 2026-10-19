/**
 * Searching the wardrobe by words. "black leather jacket" finds the black jacket made of
 * leather: the query is split into words and an item matches when EVERY word is found
 * somewhere on it (name, brand, colour, category, type, tags, retailer, size, condition,
 * materials, occasion, seasons, care, origin or notes).
 *
 * A word is found when an item word starts with it ("jack" finds "jacket", "m" finds size M),
 * and a plural does not matter ("jackets" finds "jacket" and the other way round). Whole
 * words only otherwise: "men" never finds "women's". Words that join sentences ("black and
 * white") are ignored unless they are the one being typed.
 *
 * An index is built once per wardrobe (one lower-cased word list per item) so typing stays
 * fast with a thousand items.
 */

import type { ClothingItem } from '../types';
import { CATEGORY_LABELS, OCCASION_LABELS, SEASON_LABELS, normalizeOccasion, normalizeSeasons } from './clothingOptions';
import { conditionLabel } from './itemCondition';
import { foldText } from './textFold';

// Joins a search together without saying anything about the item.
const FILLER_WORDS = new Set(['a', 'an', 'and', 'the', 'with', 'in', 'of', 'for']);

// What separates words: spaces and punctuation. A dot is not one (see wordsOf).
const SEPARATORS = /[\s,;:!?()[\]{}"“”/\\|+*&@#%^~<>=_\-–—]+/;

/** Crude singular form, applied to both sides of a comparison so "jackets" matches "jacket". */
const singular = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(?:ch|sh|x|s|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/**
 * The lower-case words of a text: accents and apostrophes gone ("Women's" is "womens"),
 * punctuation and hyphens split words ("high-waisted"), a size like "8.5" kept whole, and
 * an abbreviation like "J.Crew" read both as "jcrew" and as "j" and "crew".
 */
export const wordsOf = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const out: string[] = [];
  for (const chunk of foldText(text).replace(/['`]/g, '').split(SEPARATORS)) {
    const part = chunk.replace(/^\.+|\.+$/g, '');
    if (!part) continue;
    if (!part.includes('.') || /^\d+(?:\.\d+)+$/.test(part)) {
      out.push(part);
      continue;
    }
    out.push(part.replace(/\./g, ''), ...part.split('.').filter(Boolean));
  }
  return out;
};

/** The words a search is made of, in order, without the filler words that join them. */
export const searchTokens = (query: string | null | undefined): string[] => {
  const words = wordsOf(query);
  return words.filter((w, i) => i === words.length - 1 || !FILLER_WORDS.has(w));
};

/** The words that say what an item is, from every field a person might search by. */
const itemWords = (item: ClothingItem): string[] => {
  const seasons = normalizeSeasons(item.season);
  const occasion = normalizeOccasion(item.occasion);
  const texts: Array<string | null | undefined> = [
    item.name,
    item.brand,
    // "H&M" and "Louis Vuitton" are also found written as one word ("hm", "louisvuitton").
    item.brand ? foldText(item.brand).replace(/[^a-z0-9]+/g, '') : undefined,
    item.color,
    CATEGORY_LABELS[item.category] ?? item.category,
    item.subcategory,
    ...(item.tags ?? []),
    item.retailer,
    item.size,
    // "size 8" finds an item that has a size 8, so the word itself is one of its words.
    item.size ? 'size' : undefined,
    conditionLabel(item.condition),
    item.material,
    ...(item.materials ?? []).map(m => m.name),
    item.pattern && item.pattern !== 'other' ? item.pattern : undefined,
    occasion ? OCCASION_LABELS[occasion] : item.occasion,
    ...seasons.map(s => SEASON_LABELS[s]),
    seasons.includes('fall') ? 'autumn' : undefined,
    ...(item.careInstructions ?? []),
    item.originCountry,
    item.notes,
  ];
  return [...new Set(texts.flatMap(wordsOf))];
};

export type SearchEntry<T extends ClothingItem = ClothingItem> = {
  item: T;
  words: string[];
  /** `words` in singular form, so a plural in the search finds the singular on the item. */
  stems: string[];
};

/** Index the wardrobe for searching: build it once per list of items, not once per keystroke. */
export const buildSearchIndex = <T extends ClothingItem>(items: readonly T[]): SearchEntry<T>[] =>
  items.map(item => {
    const words = itemWords(item);
    return { item, words, stems: words.map(singular) };
  });

const entryHasToken = (entry: SearchEntry, token: string, stem: string): boolean => {
  const { words, stems } = entry;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(token) || stems[i].startsWith(stem)) return true;
  }
  return false;
};

/** The indexed items that have every word of `query`, in their order. A blank query finds all of them. */
export const searchWardrobe = <T extends ClothingItem>(index: readonly SearchEntry<T>[], query: string): T[] => {
  const tokens = searchTokens(query).map(token => ({ token, stem: singular(token) }));
  if (tokens.length === 0) return index.map(e => e.item);
  return index.filter(e => tokens.every(t => entryHasToken(e, t.token, t.stem))).map(e => e.item);
};

/** True when the item has every word of `query` (see searchWardrobe for the whole wardrobe). */
export const itemMatchesSearch = (item: ClothingItem, query: string): boolean =>
  searchWardrobe(buildSearchIndex([item]), query).length > 0;
