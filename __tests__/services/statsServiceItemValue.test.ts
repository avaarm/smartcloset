/** The stats total is what the wardrobe is worth now; cost per wear stays on what was paid. */
import { StatsService } from '../../src/services/statsService';
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

describe('StatsService total value', () => {
  it('uses each item\'s own value instead of what it cost', () => {
    const stats = StatsService.calculateWardrobeStats([
      item({ cost: 100, estimatedValue: 250, valueSource: 'user' }),
      item({ cost: 20, estimatedValue: 5, valueSource: 'estimate' }),
    ]);
    expect(stats.totalValue).toBe(255);
  });

  it('estimates the items that have no value yet (legacy rows)', () => {
    const stats = StatsService.calculateWardrobeStats([
      item({ cost: 40 }),
      item({ category: 'bags', brand: 'Gucci' }),
      item({}),
    ]);
    expect(stats.totalValue).toBe(40 + 720 + 35);
  });

  it('leaves the wishlist out', () => {
    const stats = StatsService.calculateWardrobeStats([
      item({ estimatedValue: 50, valueSource: 'user' }),
      item({ isWishlist: true, cost: 862, estimatedValue: 900, valueSource: 'user' }),
    ]);
    expect(stats.totalValue).toBe(50);
    expect(stats.wishlistCount).toBe(1);
  });

  it('is 0 for an empty wardrobe', () => {
    expect(StatsService.calculateWardrobeStats([]).totalValue).toBe(0);
  });
});

describe('cost per wear still uses the price paid', () => {
  it('ignores the value', () => {
    const worn = item({ cost: 100, wearCount: 4, estimatedValue: 900, valueSource: 'user' });
    expect(StatsService.getCostPerWear(worn)).toBe(25);
  });

  it('is 0 for a gift with a value, not the value', () => {
    expect(StatsService.getCostPerWear(item({ estimatedValue: 300, valueSource: 'user' }))).toBe(0);
  });

  it('ranks best value by what was paid', () => {
    const cheap = item({ id: 'cheap', cost: 20, wearCount: 10, estimatedValue: 20, valueSource: 'user' });
    const dear = item({ id: 'dear', cost: 500, wearCount: 10, estimatedValue: 5, valueSource: 'user' });
    expect(StatsService.getBestValueItems([dear, cheap]).map(i => i.id)).toEqual(['cheap', 'dear']);
  });
});
