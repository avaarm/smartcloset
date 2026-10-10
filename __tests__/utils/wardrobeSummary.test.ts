import { summarizeWardrobe } from '../../src/utils/wardrobeSummary';
import { outfitSuggestionKey } from '../../src/utils/outfitSuggestionKey';
import type { ClothingItem } from '../../src/types';

let n = 0;
const item = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `Item ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

describe('summarizeWardrobe', () => {
  it('counts owned and wishlist separately and totals what owned items cost', () => {
    const s = summarizeWardrobe([
      item({ cost: 40 }),
      item({ cost: 0 }),
      item(),
      item({ isWishlist: true, cost: 500 }),
    ]);
    expect(s.owned).toBe(3);
    expect(s.wishlist).toBe(1);
    expect(s.value).toBe(40);
  });

  it('lists the 10 newest first and tolerates a missing date', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ id: `d${i}`, dateAdded: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    const undated = item({ id: 'undated', dateAdded: '' });
    const s = summarizeWardrobe([undated, ...items]);
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0].id).toBe('d11');
    expect(s.recent.map(i => i.id)).not.toContain('undated');
  });

  it('lists owned items only as recent, so wishlist items never push them out of the ten', () => {
    const wishes = Array.from({ length: 10 }, (_, i) =>
      item({ id: `w${i}`, isWishlist: true, dateAdded: `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    const owned = [
      item({ id: 'o1', dateAdded: '2026-01-05T00:00:00Z' }),
      item({ id: 'o2', dateAdded: '2026-01-09T00:00:00Z' }),
    ];
    const s = summarizeWardrobe([...wishes, ...owned]);
    expect(s.recent.map(i => i.id)).toEqual(['o2', 'o1']);
    expect(s.wishlist).toBe(10);
  });

  it('has nothing recent when everything is on the wishlist', () => {
    const s = summarizeWardrobe([item({ isWishlist: true }), item({ isWishlist: true })]);
    expect(s.recent).toEqual([]);
    expect(s.owned).toBe(0);
  });

  it('is all zeros for an empty wardrobe', () => {
    expect(summarizeWardrobe([])).toEqual({ owned: 0, wishlist: 0, value: 0, recent: [] });
  });
});

describe('outfitSuggestionKey', () => {
  it('is stable for an unchanged wardrobe, ignoring rotating image links', () => {
    const a = item({ id: 'x', userImage: 'https://signed/1?token=a' });
    const b = { ...a, userImage: 'https://signed/1?token=b' };
    expect(outfitSuggestionKey([a], true)).toBe(outfitSuggestionKey([b], true));
  });

  it('changes when an item is added, edited, or the weather toggle flips', () => {
    const a = item({ id: 'x' });
    const base = outfitSuggestionKey([a], true);
    expect(outfitSuggestionKey([a, item()], true)).not.toBe(base);
    expect(outfitSuggestionKey([{ ...a, category: 'bottoms' }], true)).not.toBe(base);
    expect(outfitSuggestionKey([{ ...a, season: ['summer'] }], true)).not.toBe(base);
    expect(outfitSuggestionKey([a], false)).not.toBe(base);
  });
});
