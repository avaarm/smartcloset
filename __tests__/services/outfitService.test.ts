jest.mock('../../src/config/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { generateOutfitSuggestions } from '../../src/services/outfitService';
import type { ClothingItem } from '../../src/types';

let n = 0;
const item = (category: ClothingItem['category'], season: ClothingItem['season'], extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `${category} ${n}`,
  category,
  color: 'black',
  season,
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

const FALL = new Date('2026-10-03T12:00:00Z'); // current season = fall

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FALL);
});
afterEach(() => jest.useRealTimers());

describe('generateOutfitSuggestions', () => {
  it('pairs a top with a bottom when both suit the current season', () => {
    const out = generateOutfitSuggestions([item('tops', ['fall']), item('bottoms', ['fall', 'winter'])], 3);
    expect(out.length).toBeGreaterThan(0);
    for (const o of out) {
      expect(o.items.map(i => i.category)).toEqual(expect.arrayContaining(['tops', 'bottoms']));
    }
  });

  it('still suggests something when no top shares the current season (regression: used to return nothing)', () => {
    // spring/summer tee + fall/winter jeans: never in season together, wardrobe has a valid pair
    const out = generateOutfitSuggestions([item('tops', ['spring', 'summer']), item('bottoms', ['fall', 'winter'])], 3);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].items.map(i => i.category).sort()).toEqual(['bottoms', 'tops']);
  });

  it('falls back to a dress when there are no tops and bottoms in any season', () => {
    const out = generateOutfitSuggestions([item('dresses', ['summer'])], 2);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].items[0].category).toBe('dresses');
  });

  it('returns nothing when there is no valid combination at all', () => {
    expect(generateOutfitSuggestions([item('tops', ['fall']), item('tops', ['fall'])], 3)).toEqual([]);
    expect(generateOutfitSuggestions([], 3)).toEqual([]);
  });

  it('never returns more than the requested count and gives every outfit a unique id', () => {
    const items = [item('tops', ['fall']), item('tops', ['fall']), item('bottoms', ['fall']), item('bottoms', ['fall'])];
    const out = generateOutfitSuggestions(items, 4);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(new Set(out.map(o => o.id)).size).toBe(out.length);
  });

  it('adds optional layers: shoes, an accessory, and outerwear in fall/winter', () => {
    const items = [
      item('tops', ['fall']), item('bottoms', ['fall']), item('shoes', ['fall']),
      item('accessories', ['fall']), item('outerwear', ['fall']),
    ];
    const out = generateOutfitSuggestions(items, 1);
    const cats = out[0].items.map(i => i.category);
    expect(cats).toEqual(expect.arrayContaining(['tops', 'bottoms', 'shoes', 'accessories', 'outerwear']));
  });

  it('does not add outerwear in summer', () => {
    jest.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const items = [item('tops', ['summer']), item('bottoms', ['summer']), item('outerwear', ['summer'])];
    const out = generateOutfitSuggestions(items, 1);
    expect(out[0].items.map(i => i.category)).not.toContain('outerwear');
  });

  it('treats items with no season as suitable year-round', () => {
    const out = generateOutfitSuggestions([item('tops', [] as any), item('bottoms', [] as any)], 1);
    expect(out.length).toBe(1);
  });
});
