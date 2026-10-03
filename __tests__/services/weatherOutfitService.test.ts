const mockWeather = { temperature: 59, condition: 'sunny', location: 'SF', windSpeed: 5, humidity: 50 };
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(async () => ({ latitude: 1, longitude: 2 })),
  getCurrentWeather: jest.fn(async () => mockWeather),
  getCurrentSeason: jest.fn(() => 'fall'),
}));
jest.mock('../../src/config/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { WeatherOutfitService } from '../../src/services/weatherOutfitService';
import type { ClothingItem } from '../../src/types';

const it_ = (id: string, category: ClothingItem['category'], season: ClothingItem['season']): ClothingItem => ({
  id, name: id, category, color: 'black', season, dateAdded: '2026-01-01', isWishlist: false,
});

describe('WeatherOutfitService.getWeatherBasedRecommendations', () => {
  it('uses the full wardrobe when the weather/season filter leaves nothing to pair', async () => {
    // Current season is fall; the only top is spring/summer so the filter drops it.
    const items = [it_('tee', 'tops', ['spring', 'summer']), it_('jeans', 'bottoms', ['fall', 'winter'])];
    const rec = await WeatherOutfitService.getWeatherBasedRecommendations(items, 3);
    expect(rec.recommendedOutfits.length).toBeGreaterThan(0);
    expect(rec.weather.temperature).toBe(59);
    expect(rec.tips.length).toBeGreaterThan(0);
  });

  it('returns seasonal outfits when the filter leaves enough items', async () => {
    const items = [it_('top', 'tops', ['fall']), it_('bottom', 'bottoms', ['fall'])];
    const rec = await WeatherOutfitService.getWeatherBasedRecommendations(items, 2);
    expect(rec.recommendedOutfits.length).toBeGreaterThan(0);
  });

  it('returns no outfits (not an error) when the wardrobe cannot form any', async () => {
    const rec = await WeatherOutfitService.getWeatherBasedRecommendations([it_('top', 'tops', ['fall'])], 2);
    expect(rec.recommendedOutfits).toEqual([]);
  });
});
