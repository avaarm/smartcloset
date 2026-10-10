import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  CLOTHING_CATEGORIES,
  EXTRA_CATEGORIES,
  OCCASIONS,
  SEASONS,
  categoryLabel,
  isAllSeasons,
  isClothingCategory,
  normalizeOccasion,
  normalizeSeason,
  normalizeSeasons,
  toggleSeasonChoice,
} from '../../src/utils/clothingOptions';

// The real glyph list, so a typo'd or missing icon name fails here rather than
// rendering as a blank square on a device.
const ionicons: Record<string, number> = require('react-native-vector-icons/glyphmaps/Ionicons.json');

describe('categories', () => {
  it('offers the eleven categories, in the order pickers show them', () => {
    expect(CLOTHING_CATEGORIES).toEqual([
      'tops', 'bottoms', 'dresses', 'outerwear', 'shoes',
      'bags', 'jewelry', 'hats', 'activewear', 'swimwear', 'accessories',
    ]);
  });

  it('labels every category for people', () => {
    expect(CLOTHING_CATEGORIES.map(c => CATEGORY_LABELS[c])).toEqual([
      'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes',
      'Bags', 'Jewelry', 'Hats', 'Activewear', 'Swimwear', 'Accessories',
    ]);
  });

  it.each(CLOTHING_CATEGORIES)('%s has a real Ionicons icon and a color', category => {
    expect(ionicons[CATEGORY_ICONS[category]]).toBeDefined();
    expect(CATEGORY_COLORS[category]).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('gives each category its own icon and color', () => {
    expect(new Set(CLOTHING_CATEGORIES.map(c => CATEGORY_ICONS[c])).size).toBe(CLOTHING_CATEGORIES.length);
    expect(new Set(CLOTHING_CATEGORIES.map(c => CATEGORY_COLORS[c])).size).toBe(CLOTHING_CATEGORIES.length);
  });

  it('knows which categories are the small extras that finish an outfit', () => {
    expect([...EXTRA_CATEGORIES]).toEqual(['bags', 'jewelry', 'hats', 'accessories']);
    for (const core of ['tops', 'bottoms', 'dresses', 'shoes', 'outerwear', 'activewear', 'swimwear'] as const) {
      expect(EXTRA_CATEGORIES).not.toContain(core);
    }
  });

  it('recognises only real categories', () => {
    expect(isClothingCategory('bags')).toBe(true);
    expect(isClothingCategory('banana')).toBe(false);
    expect(isClothingCategory('toString')).toBe(false);
    expect(isClothingCategory(undefined)).toBe(false);
  });

  it('shows a label for a category, never the raw id', () => {
    expect(categoryLabel('shoes')).toBe('Shoes');
    expect(categoryLabel('jewelry')).toBe('Jewelry');
    expect(categoryLabel('belts')).toBe('Belts'); // old data outside the list is still tidied up
    expect(categoryLabel(undefined)).toBe('');
  });
});

describe('seasons', () => {
  it('tells when an item covers every season', () => {
    expect(isAllSeasons(['spring', 'summer', 'fall', 'winter'])).toBe(true);
    expect(isAllSeasons(['winter', 'fall', 'summer', 'spring'])).toBe(true);
    expect(isAllSeasons(['fall', 'winter'])).toBe(false);
    expect(isAllSeasons([])).toBe(false);
  });

  it('"All seasons" selects all four, and clears them when tapped again', () => {
    expect(toggleSeasonChoice([], 'all')).toEqual([...SEASONS]);
    expect(toggleSeasonChoice(['fall'], 'all')).toEqual([...SEASONS]);
    expect(toggleSeasonChoice([...SEASONS], 'all')).toEqual([]);
  });

  it('single seasons toggle on and off, keeping the others', () => {
    expect(toggleSeasonChoice([], 'fall')).toEqual(['fall']);
    expect(toggleSeasonChoice(['fall'], 'winter')).toEqual(['fall', 'winter']);
    expect(toggleSeasonChoice(['winter'], 'fall')).toEqual(['fall', 'winter']); // always in calendar order
    expect(toggleSeasonChoice(['fall', 'winter'], 'fall')).toEqual(['winter']);
    expect(toggleSeasonChoice(['fall'], 'fall')).toEqual([]);
  });

  it('picking one season while "All" is on narrows to just that season', () => {
    expect(toggleSeasonChoice([...SEASONS], 'summer')).toEqual(['summer']);
  });

  it('ticking the last missing season makes it "All"', () => {
    expect(isAllSeasons(toggleSeasonChoice(['spring', 'summer', 'fall'], 'winter'))).toBe(true);
  });

  it('reads season names from AI or old data', () => {
    expect(normalizeSeason('Autumn')).toBe('fall');
    expect(normalizeSeason(' WINTER ')).toBe('winter');
    expect(normalizeSeason('all')).toBeNull();
    expect(normalizeSeason(42)).toBeNull();
  });

  it('reads a list of seasons in calendar order, dropping what is not a season', () => {
    expect(normalizeSeasons(['winter', 'Autumn', 'monsoon', 7])).toEqual(['fall', 'winter']);
    expect(normalizeSeasons(undefined)).toEqual([]);
    expect(normalizeSeasons(null)).toEqual([]);
    expect(normalizeSeasons([])).toEqual([]);
  });

  it('reads "all" in a list as all four seasons', () => {
    expect(normalizeSeasons(['all'])).toEqual(['spring', 'summer', 'fall', 'winter']);
    expect(normalizeSeasons(['winter', ' ALL '])).toEqual(['spring', 'summer', 'fall', 'winter']);
  });
});

describe('occasions', () => {
  it('reads only occasions the app has', () => {
    expect(OCCASIONS).toContain('sports');
    expect(normalizeOccasion('Casual')).toBe('casual');
    expect(normalizeOccasion('date night')).toBeNull();
    expect(normalizeOccasion(undefined)).toBeNull();
  });
});
