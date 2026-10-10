/**
 * How the weather filter treats the newer categories. The filters are private,
 * so they are exercised directly: the public recommendation falls back to the
 * whole wardrobe whenever they leave nothing to pair, which hides their effect.
 */
jest.mock('../../src/services/weatherService', () => ({
  getCurrentLocation: jest.fn(),
  getCurrentWeather: jest.fn(),
  getCurrentSeason: jest.fn(() => 'fall'),
}));
jest.mock('../../src/config/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { WeatherOutfitService } from '../../src/services/weatherOutfitService';
import type { ClothingItem } from '../../src/types';

const make = (category: ClothingItem['category'], name = category as string): ClothingItem => ({
  id: name,
  name,
  category,
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01',
  isWishlist: false,
});

const forTemp = (item: ClothingItem, temp: number): boolean =>
  (WeatherOutfitService as any).isItemSuitableForTemp(item, temp);
const forCondition = (item: ClothingItem, condition: string): boolean =>
  (WeatherOutfitService as any).isItemSuitableForCondition(item, condition);

describe('temperature', () => {
  it('keeps swimwear for the heat only', () => {
    expect(forTemp(make('swimwear'), 90)).toBe(true);
    expect(forTemp(make('swimwear'), 75)).toBe(true);
    expect(forTemp(make('swimwear'), 74)).toBe(false);
    expect(forTemp(make('swimwear'), 30)).toBe(false);
  });

  it('never rules bags or jewelry out for the temperature', () => {
    for (const temp of [20, 50, 70, 95]) {
      expect(forTemp(make('bags'), temp)).toBe(true);
      expect(forTemp(make('jewelry'), temp)).toBe(true);
    }
  });

  it('counts a hat as a warm accessory in the cold, like an accessory', () => {
    expect(forTemp(make('hats'), 30)).toBe(true);
    expect(forTemp(make('accessories'), 30)).toBe(true);
    expect(forTemp(make('tops'), 30)).toBe(false);
  });
});

describe('conditions', () => {
  it('lets a hat through the snow unless it is a sun hat', () => {
    expect(forCondition(make('hats', 'Wool beanie'), 'snowy')).toBe(true);
    expect(forCondition(make('hats', 'Straw boater'), 'snowy')).toBe(false);
    expect(forCondition(make('hats', 'Sun hat'), 'snowy')).toBe(false);
  });

  it('lets bags and jewelry through the snow', () => {
    expect(forCondition(make('bags'), 'snowy')).toBe(true);
    expect(forCondition(make('jewelry'), 'snowy')).toBe(true);
  });

  it('still keeps suede and silk bags out of the rain', () => {
    expect(forCondition(make('bags', 'Suede tote'), 'rainy')).toBe(false);
    expect(forCondition(make('bags', 'Leather tote'), 'rainy')).toBe(true);
  });
});
