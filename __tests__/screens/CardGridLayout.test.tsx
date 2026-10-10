import 'react-native';
import React from 'react';
import { Dimensions, FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import WishlistScreen from '../../src/screens/WishlistScreen';
import ClothingItem from '../../src/components/ClothingItem';
import {
  GRID_COLUMNS,
  GRID_LAYOUTS,
  GRID_SIDE_PADDING,
  GridVariant,
  gridCardWidth,
} from '../../src/utils/clothingGrid';
import { getOwnedClothingItems, getWishlistClothingItems } from '../../src/services/storage';
import type { ClothingItem as ClothingItemType } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: jest.fn(),
  getWishlistClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
  saveClothingItem: jest.fn(),
  updateClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('../../src/screens/WishlistSearchModal', () => () => null);

const mockNavigation = { navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    useNavigation: () => mockNavigation,
  };
});

// Real iPhone portrait widths, narrowest (SE-class) to widest (Pro Max).
const WIDTHS = [320, 375, 393, 430, 440];

const original = Dimensions.get('window');
const setWindowWidth = (width: number) => {
  const window = { width, height: 900, scale: 3, fontScale: 1 };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
};
afterEach(() => setWindowWidth(original.width));

let n = 0;
const item = (extra: Partial<ClothingItemType> = {}): ClothingItemType => ({
  id: `id-${++n}`,
  name: `Item ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});

// Real shop titles run this long; repeated and cut so it is exactly 120 characters.
const LONG_NAME = 'Oscar de la Renta Cherry Blossom Embroidered Sequin Cocktail Dress In Pink Tulle '
  .repeat(2)
  .slice(0, 120);
// One 120-character word: no break opportunity, the worst case for text that refuses to wrap.
const UNBROKEN_NAME = 'W'.repeat(120);
const grid = () => [
  item({ name: LONG_NAME, brand: 'AUGUSTINASDESIGNERBOUTIQUEANDATELIERSOFPARIS' }),
  item({ name: 'Short' }),
  item({ name: UNBROKEN_NAME, brand: undefined, userImage: undefined, retailerImage: undefined }),
];

const cards = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.type === 'string' && node.props.testID === 'clothing-card')
    .map(node => StyleSheet.flatten(node.props.style) as any);

/**
 * Asserts that one row of cards fills the list's content width without passing it.
 * Three cards are rendered, so the compact (three-across) row is a full one.
 */
const expectRowFits = (tree: renderer.ReactTestRenderer, windowWidth: number, variant: GridVariant = 'default') => {
  const { columns, sidePadding: expectedPadding, margin } = GRID_LAYOUTS[variant];
  const list = StyleSheet.flatten(tree.root.findByType(FlatList).props.contentContainerStyle) as any;
  const sidePadding = list.paddingHorizontal ?? list.padding;
  expect(sidePadding).toBe(expectedPadding);
  expect(tree.root.findByType(FlatList).props.numColumns).toBe(columns);

  const styles = cards(tree);
  expect(styles).toHaveLength(3);
  for (const s of styles) expect(s.margin).toBe(margin);

  const available = windowWidth - 2 * sidePadding;
  const row = styles.slice(0, columns).reduce((sum, s) => sum + s.width + 2 * s.margin, 0);
  expect(row).toBeLessThanOrEqual(available);
  // ...and uses (almost) all of it: no dead strip beside the last column.
  expect(available - row).toBeLessThan(columns);
};

describe('the Wardrobe grid', () => {
  it.each(WIDTHS)('fits three columns of compact, long-titled cards at %ipt', async width => {
    setWindowWidth(width);
    (getOwnedClothingItems as jest.Mock).mockResolvedValue(grid());
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WardrobeScreen navigation={mockNavigation as any} />);
    });
    expectRowFits(tree, width, 'compact');
  });
});

describe('the Wishlist grid', () => {
  it.each(WIDTHS)('fits two columns of long-titled cards at %ipt', async width => {
    setWindowWidth(width);
    (getWishlistClothingItems as jest.Mock).mockResolvedValue(grid().map(i => ({ ...i, isWishlist: true })));
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WishlistScreen />);
    });
    expectRowFits(tree, width);
  });
});

describe('the card', () => {
  const mount = async (extra: Partial<ClothingItemType>, width = 375) => {
    setWindowWidth(width);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ClothingItem item={item(extra)} showActions />);
    });
    return tree;
  };

  it('has a 120-character test name', () => {
    expect(LONG_NAME).toHaveLength(120);
    expect(UNBROKEN_NAME).toHaveLength(120);
  });

  it.each([LONG_NAME, UNBROKEN_NAME])('never exceeds its column, however long the name (%#)', async name => {
    for (const width of WIDTHS) {
      const tree = await mount({ name, brand: 'EBAY'.repeat(15) }, width);
      const [card] = cards(tree);
      // The column is half the list's content width; the card plus its margins must fit in it.
      const column = (width - 2 * GRID_SIDE_PADDING) / GRID_COLUMNS;
      expect(typeof card.width).toBe('number');
      expect(card.width + 2 * card.margin).toBeLessThanOrEqual(column);
      expect(column - (card.width + 2 * card.margin)).toBeLessThan(1);
      expect(card.width).toBe(gridCardWidth(width));
      tree.unmount();
    }
  });

  it('keeps the season badge clear of the edit and delete buttons at the narrowest width', async () => {
    const tree = await mount({ season: ['fall'] }, 320);
    const absolute = tree.root
      .findAll(node => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.position === 'absolute')
      .map(node => StyleSheet.flatten(node.props.style) as any);
    const badge = absolute.find(s => s.left !== undefined)!;
    const actions = absolute.find(s => s.right !== undefined)!;
    const buttons = tree.root
      .findAllByType(TouchableOpacity)
      .filter(node => /^(Edit|Delete) /.test(node.props.accessibilityLabel ?? ''))
      .map(node => StyleSheet.flatten(node.props.style) as any);
    expect(buttons).toHaveLength(2);

    const cardWidth = gridCardWidth(320);
    const actionsWidth = buttons.reduce((sum, b) => sum + b.width, 0) + actions.gap * (buttons.length - 1);
    const actionsLeftEdge = cardWidth - actions.right - actionsWidth;
    expect(badge.left + badge.width).toBeLessThan(actionsLeftEdge);
    // ...and both sit inside the card.
    expect(actionsLeftEdge).toBeGreaterThanOrEqual(0);
  });

  it('clamps a 120-character name to two lines, and an unbroken all-caps brand to one', async () => {
    const tree = await mount({ name: LONG_NAME, brand: 'AUGUSTINASDESIGNERBOUTIQUEANDATELIERSOFPARIS' });
    const lines = (text: string) => tree.root.findAllByType(Text).find(t => t.props.children === text)!.props.numberOfLines;
    expect(lines(LONG_NAME)).toBe(2);
    expect(lines('AUGUSTINASDESIGNERBOUTIQUEANDATELIERSOFPARIS')).toBe(1);
  });

  it('follows the window instead of the width it had at start-up', async () => {
    const tree = await mount({}, 375);
    expect(cards(tree)[0].width).toBe(gridCardWidth(375));
    setWindowWidth(430);
    expect(cards(tree)[0].width).toBe(gridCardWidth(430));
  });

  it('keeps the photo at one proportion on every width, cropped rather than stretched', async () => {
    for (const width of [320, 440]) {
      const tree = await mount({ userImage: 'https://example.com/a.jpg' }, width);
      const image = tree.root.findByType(Image);
      expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: '100%', aspectRatio: 4 / 5 });
      expect(image.props.resizeMode).toBe('cover');
      tree.unmount();
    }
  });

  it('shows a placeholder, not a broken image, when there is no photo; a missing brand adds no row', async () => {
    const tree = await mount({ name: 'Plain Tee', userImage: undefined, retailerImage: undefined, brand: undefined });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findAllByType(Text).map(t => t.props.children)).toEqual(['Plain Tee', 'Tops']);
    expect(cards(tree)[0].width).toBe(gridCardWidth(375));
  });
});

describe('the card, for VoiceOver and touch', () => {
  const onPress = jest.fn();
  const onEdit = jest.fn();
  const onMove = jest.fn();
  const coat = () => item({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme' });

  const mount = async (props: Partial<React.ComponentProps<typeof ClothingItem>> = {}, extra = coat()) => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ClothingItem item={extra} showActions onPress={onPress} onEdit={onEdit} onMoveToWardrobe={onMove} {...props} />,
      );
    });
    return tree;
  };
  const host = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root.find(node => typeof node.type === 'string' && node.props.accessibilityLabel === label);
  /**
   * Names of the accessibility elements above a node: VoiceOver does not expose what sits inside one.
   * Names, not nodes, so a failure prints a short list instead of the whole render tree.
   */
  const accessibleAncestors = (node: renderer.ReactTestInstance) => {
    const found: string[] = [];
    for (let up = node.parent; up; up = up.parent) {
      if (typeof up.type === 'string' && up.props.accessible === true) {
        found.push(up.props.accessibilityLabel ?? up.props.testID ?? 'unnamed');
      }
    }
    return found;
  };

  beforeEach(() => {
    onPress.mockReset();
    onEdit.mockReset();
    onMove.mockReset();
  });

  it('is not an accessibility element itself; the photo and details are, labelled with name, category and brand', async () => {
    const tree = await mount();
    const wrapper = tree.root.find(node => typeof node.type === 'string' && node.props.testID === 'clothing-card');
    expect(wrapper.props.accessible).toBe(false);

    const details = host(tree, 'Wool Coat, Outerwear, Acme');
    expect(details.props.accessible).toBe(true);
    expect(details.props.accessibilityRole).toBe('button');
    expect(accessibleAncestors(details)).toEqual([]);
  });

  it.each(['Edit Wool Coat', 'Delete Wool Coat', 'Move Wool Coat to your wardrobe'])(
    'leaves "%s" reachable: no accessibility element sits above it',
    async label => {
      const tree = await mount();
      const button = host(tree, label);
      expect(button.props.accessible).toBe(true);
      expect(accessibleAncestors(button)).toEqual([]);
      // ...and it is a sibling of the details, not inside them.
      const details = host(tree, 'Wool Coat, Outerwear, Acme');
      expect(details.findAll(node => node.props.accessibilityLabel === label)).toHaveLength(0);
    },
  );

  it('still opens the item from the details, and runs each button on its own', async () => {
    const tree = await mount();
    await act(async () => tree.root.findByType(Pressable).props.onPress());
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wool Coat' }));

    const press = (label: string) =>
      tree.root.find(node => node.type === TouchableOpacity && node.props.accessibilityLabel === label).props.onPress();
    await act(async () => press('Edit Wool Coat'));
    await act(async () => press('Move Wool Coat to your wardrobe'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads the category by its label, not its id, and does not announce a card with no action as a button', async () => {
    const tree = await mount({ onPress: undefined, showActions: false, onMoveToWardrobe: undefined }, item({ name: 'Straw Tote', category: 'bags' }));
    expect(tree.root.findAllByType(Text).map(t => t.props.children)).toEqual(['Straw Tote', 'Bags']);
    const details = host(tree, 'Straw Tote, Bags');
    expect(details.props.accessible).toBe(true);
    expect(details.props.accessibilityRole).toBeUndefined();
  });

  it('gives the small Move button room to be hit', async () => {
    const tree = await mount();
    const move = tree.root.find(node => node.type === TouchableOpacity && /^Move /.test(node.props.accessibilityLabel ?? ''));
    expect(move.props.hitSlop.top).toBeGreaterThanOrEqual(8);
    expect(move.props.hitSlop.bottom).toBeGreaterThanOrEqual(8);
  });

  it('stretches to the height of its row, and holds the Move button at the bottom edge', async () => {
    const tree = await mount();
    // A short card beside a long one: both stretch to the row, and the area above the button takes up the slack.
    expect(cards(tree)[0].alignSelf).toBe('stretch');
    const main = StyleSheet.flatten(tree.root.findByType(Pressable).props.style({ pressed: false }));
    expect(main.flexGrow).toBe(1);

    // The Move button is outside that growing area, so it ends up last in the card.
    const card = tree.root.find(node => typeof node.type === 'string' && node.props.testID === 'clothing-card');
    const order = (card.children as renderer.ReactTestInstance[]).map(child => child.props.accessibilityLabel);
    expect(order[0]).toBe('Wool Coat, Outerwear, Acme');
    expect(order[order.length - 1]).toBe('Move Wool Coat to your wardrobe');
  });
});

describe('cards in one grid row', () => {
  it.each([320, 393])('every card carries the same stretch, however much text it holds (%ipt)', async width => {
    setWindowWidth(width);
    (getWishlistClothingItems as jest.Mock).mockResolvedValue(grid().map(i => ({ ...i, isWishlist: true })));
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WishlistScreen />);
    });
    const styles = cards(tree);
    expect(styles).toHaveLength(3);
    for (const s of styles) expect(s.alignSelf).toBe('stretch');
    // The list gives each row the default (stretch) alignment: nothing centres or top-aligns a short card.
    const list = tree.root.findByType(FlatList).props;
    expect(list.columnWrapperStyle?.alignItems ?? 'stretch').toBe('stretch');
  });
});
