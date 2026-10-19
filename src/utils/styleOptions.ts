/**
 * Style of a piece: the look it belongs to (casual, classic, boho...). Stored in the item's existing `tags`
 * (no column of its own), as the lower-case word, so it saves, syncs, backs up and searches with everything
 * else the item has. These helpers read the styles out of a tag list and put them back without touching the
 * person's other tags.
 */

export const STYLE_OPTIONS = [
  'casual',
  'classic',
  'minimal',
  'elegant',
  'streetwear',
  'sporty',
  'boho',
  'preppy',
  'edgy',
  'romantic',
  'vintage',
  'trendy',
] as const;

export type ItemStyle = (typeof STYLE_OPTIONS)[number];

export const STYLE_LABELS: Record<ItemStyle, string> = {
  casual: 'Casual',
  classic: 'Classic',
  minimal: 'Minimal',
  elegant: 'Elegant',
  streetwear: 'Streetwear',
  sporty: 'Sporty',
  boho: 'Boho',
  preppy: 'Preppy',
  edgy: 'Edgy',
  romantic: 'Romantic',
  vintage: 'Vintage',
  trendy: 'Trendy',
};

const OPTION_SET: ReadonlySet<string> = new Set(STYLE_OPTIONS);

export const isItemStyle = (value: string): value is ItemStyle => OPTION_SET.has(value.trim().toLowerCase());

/** The styles named in a list of tags, in the order of STYLE_OPTIONS. */
export const stylesFromTags = (tags: readonly string[] | undefined): ItemStyle[] => {
  const present = new Set((tags ?? []).map(t => t.trim().toLowerCase()));
  return STYLE_OPTIONS.filter(s => present.has(s));
};

/** The tags with exactly `styles` as their style words: other tags keep their place, new styles go to the front. */
export const tagsWithStyles = (tags: readonly string[] | undefined, styles: readonly ItemStyle[]): string[] => {
  const others = (tags ?? []).map(t => t.trim()).filter(t => t !== '' && !OPTION_SET.has(t.toLowerCase()));
  return [...styles, ...others];
};

/** The tags a person typed, without the style words (those have their own chips). */
export const tagsWithoutStyles = (tags: readonly string[] | undefined): string[] =>
  (tags ?? []).map(t => t.trim()).filter(t => t !== '' && !OPTION_SET.has(t.toLowerCase()));
