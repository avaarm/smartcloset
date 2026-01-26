import { StatsService } from '../../src/services/statsService';
import { ClothingItem } from '../../src/types';

describe('StatsService', () => {
  const mockItems: ClothingItem[] = [
    {
      id: '1',
      name: 'White T-Shirt',
      category: 'tops',
      color: 'white',
      season: ['spring', 'summer'],
      dateAdded: '2024-01-01',
      isWishlist: false,
      wearCount: 10,
      cost: 30,
      favorite: true,
    },
    {
      id: '2',
      name: 'Blue Jeans',
      category: 'bottoms',
      color: 'blue',
      season: ['spring', 'fall', 'winter'],
      dateAdded: '2024-02-01',
      isWishlist: false,
      wearCount: 15,
      cost: 80,
      favorite: true,
    },
    {
      id: '3',
      name: 'Black Dress',
      category: 'dresses',
      color: 'black',
      season: ['spring', 'summer', 'fall'],
      dateAdded: '2024-03-01',
      isWishlist: false,
      wearCount: 5,
      cost: 120,
      favorite: false,
    },
    {
      id: '4',
      name: 'Wishlist Jacket',
      category: 'outerwear',
      color: 'brown',
      season: ['fall', 'winter'],
      dateAdded: '2024-04-01',
      isWishlist: true,
      wearCount: 0,
      cost: 200,
      favorite: false,
    },
    {
      id: '5',
      name: 'Unworn Shoes',
      category: 'shoes',
      color: 'black',
      season: ['spring', 'summer', 'fall', 'winter'],
      dateAdded: '2024-05-01',
      isWishlist: false,
      wearCount: 0,
      cost: 100,
      favorite: false,
    },
  ];

  describe('calculateWardrobeStats', () => {
    it('should calculate total items excluding wishlist', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.totalItems).toBe(4); // Excludes wishlist item
    });

    it('should calculate total value correctly', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.totalValue).toBe(330); // 30 + 80 + 120 + 100
    });

    it('should calculate average wear count', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.averageWearCount).toBe(7.5); // (10 + 15 + 5 + 0) / 4
    });

    it('should count wishlist items', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.wishlistCount).toBe(1);
    });

    it('should identify most worn item', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.mostWornItem?.id).toBe('2'); // Blue Jeans with 15 wears
    });

    it('should identify least worn item', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.leastWornItem?.id).toBe('3'); // Black Dress with 5 wears (lowest among worn items)
    });

    it('should calculate items by category', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.itemsByCategory.tops).toBe(1);
      expect(stats.itemsByCategory.bottoms).toBe(1);
      expect(stats.itemsByCategory.dresses).toBe(1);
      expect(stats.itemsByCategory.shoes).toBe(1);
      expect(stats.itemsByCategory.outerwear).toBe(0); // Wishlist item excluded
      expect(stats.itemsByCategory.accessories).toBe(0);
    });

    it('should calculate items by season', () => {
      const stats = StatsService.calculateWardrobeStats(mockItems);
      expect(stats.itemsBySeason.spring).toBe(4);
      expect(stats.itemsBySeason.summer).toBe(3);
      expect(stats.itemsBySeason.fall).toBe(3);
      expect(stats.itemsBySeason.winter).toBe(2);
    });
  });

  describe('getCostPerWear', () => {
    it('should calculate cost per wear correctly', () => {
      const item = mockItems[0]; // White T-Shirt: $30, 10 wears
      const costPerWear = StatsService.getCostPerWear(item);
      expect(costPerWear).toBe(3);
    });

    it('should return cost if wear count is 0', () => {
      const item = mockItems[4]; // Unworn Shoes: $100, 0 wears
      const costPerWear = StatsService.getCostPerWear(item);
      expect(costPerWear).toBe(100);
    });

    it('should return 0 if no cost', () => {
      const item: ClothingItem = {
        ...mockItems[0],
        cost: undefined,
      };
      const costPerWear = StatsService.getCostPerWear(item);
      expect(costPerWear).toBe(0);
    });
  });

  describe('getUnwornItems', () => {
    it('should return items with 0 wear count', () => {
      const unworn = StatsService.getUnwornItems(mockItems);
      expect(unworn.length).toBe(1);
      expect(unworn[0].id).toBe('5');
    });

    it('should exclude wishlist items', () => {
      const unworn = StatsService.getUnwornItems(mockItems);
      expect(unworn.find(item => item.id === '4')).toBeUndefined();
    });
  });

  describe('getMostWornItems', () => {
    it('should return items sorted by wear count', () => {
      const mostWorn = StatsService.getMostWornItems(mockItems, 3);
      expect(mostWorn.length).toBe(3);
      expect(mostWorn[0].id).toBe('2'); // 15 wears
      expect(mostWorn[1].id).toBe('1'); // 10 wears
      expect(mostWorn[2].id).toBe('3'); // 5 wears
    });

    it('should respect the limit parameter', () => {
      const mostWorn = StatsService.getMostWornItems(mockItems, 2);
      expect(mostWorn.length).toBe(2);
    });

    it('should exclude items with 0 wears', () => {
      const mostWorn = StatsService.getMostWornItems(mockItems, 5);
      expect(mostWorn.find(item => item.wearCount === 0)).toBeUndefined();
    });
  });

  describe('getBestValueItems', () => {
    it('should return items sorted by cost per wear', () => {
      const bestValue = StatsService.getBestValueItems(mockItems, 3);
      expect(bestValue.length).toBe(3);
      expect(bestValue[0].id).toBe('1'); // $3 per wear
      expect(bestValue[1].id).toBe('2'); // $5.33 per wear
      expect(bestValue[2].id).toBe('3'); // $24 per wear
    });

    it('should exclude items without cost or wear count', () => {
      const bestValue = StatsService.getBestValueItems(mockItems, 5);
      expect(bestValue.find(item => !item.cost || !item.wearCount)).toBeUndefined();
    });
  });

  describe('getSeasonalBreakdown', () => {
    it('should return items for specific season', () => {
      const springItems = StatsService.getSeasonalBreakdown(mockItems, 'spring');
      expect(springItems.length).toBe(4);
    });

    it('should exclude wishlist items', () => {
      const fallItems = StatsService.getSeasonalBreakdown(mockItems, 'fall');
      expect(fallItems.find(item => item.isWishlist)).toBeUndefined();
    });
  });

  describe('getRecentlyAdded', () => {
    it('should return items sorted by date added', () => {
      const recent = StatsService.getRecentlyAdded(mockItems, 3);
      expect(recent.length).toBe(3);
      expect(recent[0].id).toBe('5'); // Most recent
      expect(recent[1].id).toBe('3');
      expect(recent[2].id).toBe('2');
    });

    it('should exclude wishlist items', () => {
      const recent = StatsService.getRecentlyAdded(mockItems, 5);
      expect(recent.find(item => item.isWishlist)).toBeUndefined();
    });
  });

  describe('getFavorites', () => {
    it('should return only favorite items', () => {
      const favorites = StatsService.getFavorites(mockItems);
      expect(favorites.length).toBe(2);
      expect(favorites.every(item => item.favorite)).toBe(true);
    });

    it('should exclude wishlist items', () => {
      const favorites = StatsService.getFavorites(mockItems);
      expect(favorites.find(item => item.isWishlist)).toBeUndefined();
    });
  });
});
