import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import WardrobeInsightsScreen from '../../src/screens/WardrobeInsightsScreen';
import { getClothingItems } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

let n = 0;
const item = (category: ClothingItem['category'], extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `i${++n}`,
  name: `Piece ${n}`,
  category,
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

const mount = async (items: ClothingItem[]) => {
  (getClothingItems as jest.Mock).mockResolvedValue(items);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<WardrobeInsightsScreen />);
  });
  return flatten(tree.toJSON());
};

describe('Category Breakdown', () => {
  it('names every category the wardrobe has, new ones included, with the right counts', async () => {
    const t = await mount([
      item('bags'), item('bags'), item('bags'),
      item('jewelry'),
      item('hats'),
      item('activewear'),
      item('swimwear'),
      item('accessories'),
      item('shoes'), item('shoes'),
    ]);
    const breakdown = t.slice(t.indexOf('Category Breakdown'), t.indexOf('Least Worn'));
    expect(breakdown).toMatch(/Bags\s+3/);
    expect(breakdown).toMatch(/Shoes\s+2/);
    for (const label of ['Jewelry', 'Hats', 'Activewear', 'Swimwear', 'Accessories']) {
      expect(breakdown).toMatch(new RegExp(`${label}\\s+1`));
    }
  });

  it('lists only categories with items, most first', async () => {
    const t = await mount([item('hats'), item('bags'), item('bags'), item('bags'), item('shoes'), item('shoes')]);
    const breakdown = t.slice(t.indexOf('Category Breakdown'));
    expect(breakdown).not.toContain('Tops');
    expect(breakdown).not.toContain('Swimwear');
    expect(breakdown.indexOf('Bags')).toBeLessThan(breakdown.indexOf('Shoes'));
    expect(breakdown.indexOf('Shoes')).toBeLessThan(breakdown.indexOf('Hats'));
  });

  it('shows the label, not the raw id', async () => {
    const t = await mount([item('bags')]);
    const breakdown = t.slice(t.indexOf('Category Breakdown'), t.indexOf('Least Worn'));
    expect(breakdown).toContain('Bags');
    expect(breakdown).not.toMatch(/\bbags\b/);
  });

  it('leaves wishlist items out', async () => {
    const t = await mount([item('tops'), item('hats', { isWishlist: true })]);
    expect(t.slice(t.indexOf('Category Breakdown'))).not.toContain('Hats');
  });
});

describe('Wardrobe value', () => {
  it("is the same total as the Wardrobe and Home screens: each item's own value, not a retail-price sum", async () => {
    const t = await mount([
      // The owner set this one: $400, though it was bought for $100 (retail $200).
      item('bags', { estimatedValue: 400, valueSource: 'user', cost: 100, retailCost: 200 }),
      // Never priced: valued by the estimate, which a retail sum would have left at $0.
      item('tops', { estimatedValue: 45, valueSource: 'estimate' }),
    ]);
    const kpi = t.slice(t.indexOf('Wardrobe value'), t.indexOf('Wardrobe value') + 60);
    expect(kpi).toContain('$445');
    expect(kpi).toContain("what it's worth now");
    expect(kpi).not.toContain('at retail');
  });
});
