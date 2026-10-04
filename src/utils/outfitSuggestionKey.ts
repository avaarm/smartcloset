import type { ClothingItem } from '../types';

/**
 * A fingerprint of everything outfit suggestions are built from. The
 * Suggestions tab reloads on every focus; comparing keys lets it keep the
 * suggestions the user is looking at unless the wardrobe (or the weather
 * toggle) actually changed. Image URLs are left out on purpose: signed links
 * rotate without the wardrobe changing.
 */
export const outfitSuggestionKey = (items: ClothingItem[], weatherMode: boolean): string =>
  JSON.stringify([
    weatherMode,
    items.map(i => [i.id, i.name, i.category, i.color, i.season, i.brand]),
  ]);
