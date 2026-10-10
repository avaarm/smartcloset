/**
 * Item and outfit screens name a category the way the Add Item form does
 * ("Bags", not the stored id "bags"), including the categories added later.
 */
import 'react-native';
import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import OutfitCard from '../../src/components/OutfitCard';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import OutfitDetailsScreen from '../../src/screens/OutfitDetailsScreen';
import WardrobeEditScreen from '../../src/screens/WardrobeEditScreen';
import { getClothingItems } from '../../src/services/storage';
import type { Outfit } from '../../src/services/outfitService';
import type { ClothingItem } from '../../src/types';

let mockParams: any = {};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: mockParams }),
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockParams.item),
  getClothingItems: jest.fn(async () => []),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: {
    markItemWorn: jest.fn(),
    undoLastWear: jest.fn(),
    getOutfitHistoryById: jest.fn(async () => []),
  },
}));

const item = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Andiamo shopper',
  category: 'bags',
  color: 'tan',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...over,
});

const outfitOf = (items: ClothingItem[]): Outfit => ({
  id: 'o1',
  name: 'Weekend',
  items,
  season: ['summer'],
  occasion: 'casual',
  createdAt: '2026-01-01T00:00:00Z',
});

const render = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  return tree;
};

const shown = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

beforeEach(() => {
  mockParams = {};
});

describe('category names on item and outfit screens', () => {
  it('OutfitCard shows "Bags" and "Activewear", not the stored ids', async () => {
    const tree = await render(
      <OutfitCard outfit={outfitOf([item(), item({ id: 'item-2', category: 'activewear', name: 'Run tights' })])} />,
    );
    expect(shown(tree)).toEqual(expect.arrayContaining(['Bags', 'Activewear']));
    expect(shown(tree)).not.toContain('bags');
    expect(shown(tree)).not.toContain('activewear');
  });

  it('OutfitDetailsScreen shows "Jewelry", not "jewelry"', async () => {
    mockParams = { outfit: outfitOf([item({ category: 'jewelry', name: 'Gold chain' })]), saved: false };
    const tree = await render(<OutfitDetailsScreen />);
    expect(shown(tree)).toContain('Jewelry');
    expect(shown(tree)).not.toContain('jewelry');
  });

  it('ItemDetailsScreen shows "Bags" under the item name', async () => {
    mockParams = { item: item() };
    const tree = await render(<ItemDetailsScreen />);
    expect(shown(tree)).toContain('Bags');
    expect(shown(tree)).not.toContain('bags');
  });

  it('WardrobeEditScreen shows "Swimwear" on the card being audited', async () => {
    (getClothingItems as jest.Mock).mockResolvedValueOnce([item({ category: 'swimwear', name: 'Red one-piece' })]);
    const tree = await render(<WardrobeEditScreen />);
    expect(shown(tree)).toContain('Swimwear');
    expect(shown(tree)).not.toContain('swimwear');
  });
});
