/**
 * How the newer categories take part in outfit suggestions: bags, jewelry,
 * hats and accessories may finish an outfit (one of them), but never stand in
 * for a core piece; activewear and swimwear stay out of everyday outfits.
 */
jest.mock('../../src/config/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { generateOutfitSuggestions } from '../../src/services/outfitService';
import type { ClothingItem } from '../../src/types';

let n = 0;
const item = (
  category: ClothingItem['category'],
  season: ClothingItem['season'] = ['fall'],
  extra: Partial<ClothingItem> = {},
): ClothingItem => ({
  id: `c${++n}`,
  name: `${category} ${n}`,
  category,
  color: 'black',
  season,
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

const cats = (outfit: { items: ClothingItem[] }) => outfit.items.map(i => i.category);

const EXTRAS = ['bags', 'jewelry', 'hats', 'accessories'];
const extrasIn = (outfit: { items: ClothingItem[] }) => cats(outfit).filter(c => EXTRAS.includes(c));

const core = () => [item('tops'), item('bottoms'), item('shoes')];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-03T12:00:00Z')); // fall
});
afterEach(() => jest.useRealTimers());

describe('bags, jewelry and hats finish an outfit', () => {
  it.each(['bags', 'jewelry', 'hats', 'accessories'] as const)('a %s item is added as the extra', category => {
    const out = generateOutfitSuggestions([...core(), item(category)], 1);
    expect(cats(out[0]).sort()).toEqual(['bottoms', category, 'shoes', 'tops'].sort());
  });

  it('adds only ONE extra even when the wardrobe has one of each', () => {
    const items = [...core(), item('bags'), item('jewelry'), item('hats'), item('accessories')];
    const out = generateOutfitSuggestions(items, 5);
    expect(out.length).toBeGreaterThan(0);
    for (const outfit of out) {
      expect(extrasIn(outfit)).toHaveLength(1);
      expect(cats(outfit)).toEqual(expect.arrayContaining(['tops', 'bottoms', 'shoes']));
    }
  });

  it('draws the extra from every extra category over many suggestions', () => {
    const items = [...core(), item('bags'), item('jewelry'), item('hats')];
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const outfit of generateOutfitSuggestions(items, 5)) extrasIn(outfit).forEach(c => seen.add(c));
    }
    expect([...seen].sort()).toEqual(['bags', 'hats', 'jewelry']);
  });

  it('never lets an extra replace a core piece: no shoes means no shoes, not a bag in their place', () => {
    const out = generateOutfitSuggestions([item('tops'), item('bottoms'), item('bags')], 1);
    expect(cats(out[0]).sort()).toEqual(['bags', 'bottoms', 'tops']);
    expect(cats(out[0])).not.toContain('shoes');
  });

  it('does not make an outfit from extras alone', () => {
    const items = [item('bags'), item('jewelry'), item('hats'), item('accessories'), item('shoes')];
    expect(generateOutfitSuggestions(items, 3)).toEqual([]);
  });

  it('does not make an outfit from a top and an extra: a bottom is still required', () => {
    expect(generateOutfitSuggestions([item('tops'), item('bags'), item('shoes')], 3)).toEqual([]);
  });

  it('finishes a dress outfit with an extra too', () => {
    const out = generateOutfitSuggestions([item('dresses'), item('shoes'), item('jewelry')], 1);
    expect(cats(out[0]).sort()).toEqual(['dresses', 'jewelry', 'shoes']);
  });

  it('skips an extra that is out of season (regression: any accessory used to be added, even a summer one in fall)', () => {
    const items = [...core(), item('hats', ['summer']), item('accessories', ['spring'])];
    const out = generateOutfitSuggestions(items, 3);
    expect(out.length).toBeGreaterThan(0);
    for (const outfit of out) expect(extrasIn(outfit)).toEqual([]);
  });

  it('still adds an extra with no season listed (suits any time of year)', () => {
    const out = generateOutfitSuggestions([...core(), item('bags', [] as any)], 1);
    expect(extrasIn(out[0])).toEqual(['bags']);
  });
});

describe('activewear and swimwear', () => {
  const sportsKit = () => [item('activewear'), item('activewear'), item('shoes')];

  it('are not part of everyday outfits', () => {
    const items = [...core(), item('activewear'), item('swimwear')];
    const out = generateOutfitSuggestions(items, 5);
    expect(out.length).toBeGreaterThan(0);
    for (const outfit of out) {
      expect(cats(outfit)).not.toContain('activewear');
      expect(cats(outfit)).not.toContain('swimwear');
    }
  });

  it('are not turned into an outfit by themselves, whatever the season', () => {
    const items = [item('activewear'), item('activewear'), item('swimwear'), item('shoes')];
    expect(generateOutfitSuggestions(items, 3)).toEqual([]);
    expect(generateOutfitSuggestions(items, 3, { occasion: 'casual' })).toEqual([]);
  });

  it('are not used in the fallback that ignores seasons either', () => {
    const items = [item('tops', ['spring']), item('bottoms', ['spring']), item('activewear', ['summer'])];
    const out = generateOutfitSuggestions(items, 3);
    expect(out.length).toBeGreaterThan(0);
    for (const outfit of out) expect(cats(outfit)).not.toContain('activewear');
  });

  it('make the outfit when the occasion is sports', () => {
    const out = generateOutfitSuggestions(sportsKit(), 2, { occasion: 'sports' });
    expect(out).toHaveLength(2);
    for (const outfit of out) {
      expect(outfit.occasion).toBe('sports');
      expect(cats(outfit).filter(c => c === 'activewear')).toHaveLength(2);
      expect(cats(outfit)).toContain('shoes');
    }
  });

  it('use two different pieces, or one when that is all there is', () => {
    const pair = generateOutfitSuggestions(sportsKit(), 1, { occasion: 'sports' })[0];
    expect(new Set(pair.items.map(i => i.id)).size).toBe(pair.items.length);

    const single = generateOutfitSuggestions([item('activewear'), item('shoes')], 1, { occasion: 'sports' })[0];
    expect(cats(single)).toEqual(['activewear', 'shoes']);
  });

  it('can be finished with a hat or bag but never swimwear', () => {
    const items = [...sportsKit(), item('swimwear'), item('hats'), item('bags'), item('tops'), item('bottoms')];
    for (let i = 0; i < 20; i++) {
      for (const outfit of generateOutfitSuggestions(items, 3, { occasion: 'sports' })) {
        expect(cats(outfit)).not.toContain('swimwear');
        expect(cats(outfit)).not.toContain('tops');
        expect(extrasIn(outfit).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fall back to ordinary outfits when sports is asked for but there is no activewear', () => {
    const out = generateOutfitSuggestions(core(), 1, { occasion: 'sports' });
    expect(cats(out[0]).sort()).toEqual(['bottoms', 'shoes', 'tops']);
    expect(out[0].occasion).toBe('casual');
  });
});

describe('items with no season listed', () => {
  it('take part in the seasonal outfits (regression: an empty list used to fall through to the season-blind fallback)', () => {
    const out = generateOutfitSuggestions([item('tops', [] as any), item('bottoms', [] as any)], 1);
    expect(out[0].name).toBe('Fall Outfit');
    expect(out[0].season).toEqual(['fall']);
  });

  it('pair with an item that does list seasons', () => {
    const out = generateOutfitSuggestions([item('tops', [] as any), item('bottoms', ['winter'])], 1);
    expect(cats(out[0]).sort()).toEqual(['bottoms', 'tops']);
  });
});

describe('dress outfit names', () => {
  it('capitalise the colour and have no stray space when there is none', () => {
    const named = generateOutfitSuggestions([item('dresses', ['fall'], { color: 'red' })], 1);
    expect(named[0].name).toBe('Red Dress Outfit');
    const unnamed = generateOutfitSuggestions([item('dresses', ['fall'], { color: '' })], 1);
    expect(unnamed[0].name).toBe('Dress Outfit');
  });
});
