/**
 * ItemDetails: the edit pencil and Create Outfit button must lead somewhere,
 * wishlist items can't be put in an outfit, and a price of 0 must not render a
 * bare "0" inside a <View> (that throws in React Native).
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import { ClothingItem } from '../../src/types';

const mockNavigate = jest.fn();
let mockItem: ClothingItem;

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));

const makeItem = (overrides: Partial<ClothingItem> = {}): ClothingItem => ({
  id: 'item-1',
  name: 'Linen Shirt',
  category: 'tops',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...overrides,
});

const render = async (item: ClothingItem) => {
  mockItem = item;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemDetailsScreen />);
  });
  return tree;
};

const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

/**
 * react-test-renderer accepts text anywhere, but React Native itself throws when
 * a string or number is a direct child of anything other than <Text>. Return
 * any such strays so the check bites the way a device would.
 */
const strayText = (node: any, parentIsText = false, found: string[] = []): string[] => {
  if (node == null) return found;
  if (Array.isArray(node)) {
    node.forEach(child => strayText(child, parentIsText, found));
  } else if (typeof node === 'string') {
    if (!parentIsText) found.push(node);
  } else {
    (node.children || []).forEach((child: any) => strayText(child, node.type === 'Text', found));
  }
  return found;
};

/** Walk up from a node to the nearest ancestor that has an onPress. */
const pressableAbove = (node: renderer.ReactTestInstance) => {
  let cur: renderer.ReactTestInstance | null = node;
  while (cur && typeof cur.props.onPress !== 'function') cur = cur.parent;
  if (!cur) throw new Error('no pressable ancestor');
  return cur;
};

beforeEach(() => {
  mockNavigate.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ItemDetailsScreen actions', () => {
  it('the edit pencil opens AddClothing with the item', async () => {
    const tree = await render(makeItem());
    const pencil = tree.root.findAll(n => n.props.name === 'pencil')[0];

    await act(async () => {
      pressableAbove(pencil).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'AddClothing',
      expect.objectContaining({ editItem: expect.objectContaining({ id: 'item-1' }) }),
    );
  });

  it('shows Create Outfit for a wardrobe item and opens CreateOutfit', async () => {
    const tree = await render(makeItem());
    expect(textsOf(tree)).toContain('Create Outfit');

    const label = tree.root.findAllByType(Text).find(t => t.props.children === 'Create Outfit')!;
    await act(async () => {
      pressableAbove(label).props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('CreateOutfit');
  });

  it('shows a wishlist item without any owned-item UI (wear stats, worn button, outfits, resale)', async () => {
    const tree = await render(makeItem({ isWishlist: true, cost: 120, retailCost: 150 }));
    const texts = textsOf(tree);

    expect(texts).not.toContain('Create Outfit');
    expect(texts).not.toContain('Mark as Worn Today');
    expect(texts).not.toContain('Times Worn');
    expect(texts).not.toContain('Resale Estimate');
    expect(texts).not.toContain('Wear Analytics');
    expect(texts).toContain('Share Item');
    expect(texts).toContain('Delete Item');
  });

  it('keeps all of that for an item you own', async () => {
    const tree = await render(makeItem({ isWishlist: false, cost: 120 }));
    const texts = textsOf(tree);

    expect(texts).toContain('Create Outfit');
    expect(texts).toContain('Mark as Worn Today');
    expect(texts).toContain('Times Worn');
    expect(texts).toContain('Wear Analytics');
  });
});

describe('ItemDetailsScreen with zero prices', () => {
  it.each([
    ['free item, no retail price', { cost: 0 }],
    ['no price paid, retail price 0', { retailCost: 0 }],
    ['both 0', { cost: 0, retailCost: 0 }],
    ['wishlist item priced 0', { isWishlist: true, cost: 0, retailCost: 0 }],
  ])('renders %s without crashing', async (_label, overrides) => {
    const tree = await render(makeItem(overrides as Partial<ClothingItem>));

    expect(textsOf(tree)).toContain('Linen Shirt');
    expect(strayText(tree.toJSON())).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
