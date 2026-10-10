import { StatsService } from '../../src/services/statsService';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';
import type { ClothingItem } from '../../src/types';

const item = (id: string, category: ClothingItem['category'], extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name: id,
  category,
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01',
  isWishlist: false,
  ...extra,
});

describe('StatsService with the newer categories', () => {
  it('counts every category, starting each at zero', () => {
    const stats = StatsService.calculateWardrobeStats([]);
    expect(Object.keys(stats.itemsByCategory).sort()).toEqual([...CLOTHING_CATEGORIES].sort());
    expect(Object.values(stats.itemsByCategory).every(count => count === 0)).toBe(true);
  });

  it('counts bags, jewelry, hats, activewear and swimwear separately from accessories', () => {
    const stats = StatsService.calculateWardrobeStats([
      item('b1', 'bags'), item('b2', 'bags'),
      item('j1', 'jewelry'),
      item('h1', 'hats'),
      item('a1', 'activewear'),
      item('s1', 'swimwear'),
      item('x1', 'accessories'),
    ]);
    expect(stats.itemsByCategory).toMatchObject({
      bags: 2, jewelry: 1, hats: 1, activewear: 1, swimwear: 1, accessories: 1, tops: 0,
    });
    expect(stats.totalItems).toBe(7);
  });

  it('keeps wishlist items out of the category counts', () => {
    const stats = StatsService.calculateWardrobeStats([item('b1', 'bags'), item('b2', 'bags', { isWishlist: true })]);
    expect(stats.itemsByCategory.bags).toBe(1);
    expect(stats.wishlistCount).toBe(1);
  });
});
