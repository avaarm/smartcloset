/**
 * The Wardrobe grid: three compact cards across, and how many pieces that puts
 * on a screen. The arithmetic is the real one: the card widths and text-block
 * heights are the numbers the card styles use, and the header is the sum of
 * what the screen stacks above the list.
 */
import 'react-native';
import React from 'react';
import { Dimensions, FlatList, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WardrobeScreen from '../../src/screens/WardrobeScreen';
import { TOTAL_STRIP_HEIGHT } from '../../src/components/WardrobeTotalStrip';
import {
  CARD_MARGIN,
  GRID_COLUMNS,
  GRID_LAYOUTS,
  GRID_SIDE_PADDING,
  GridLayout,
  cardWidthFor,
  compactCardsInView,
  compactRowHeight,
  gridCardWidth,
} from '../../src/utils/clothingGrid';
import { getOwnedClothingItems } from '../../src/services/storage';
import type { ClothingItem as ClothingItemType } from '../../src/types';

jest.mock('../../src/services/storage', () => ({
  getOwnedClothingItems: jest.fn(),
  deleteClothingItem: jest.fn(),
}));
jest.mock('../../src/services/profileService', () => ({ getBodyProfile: jest.fn(async () => null) }));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

const navigation = { navigate: jest.fn() } as any;

const original = Dimensions.get('window');
const setWindow = (width: number, height = 900) => {
  const window = { width, height, scale: 3, fontScale: 1 };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
};
afterEach(() => setWindow(original.width, original.height));

const item = (i: number): ClothingItemType => ({
  id: `id-${i}`,
  name: `Item ${i}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
});

describe('grid geometry for any number of columns', () => {
  const layout = (columns: number, sidePadding: number, margin: number): GridLayout => ({ columns, sidePadding, margin });

  it('keeps the default two-column layout exactly as the Wishlist has it', () => {
    expect(GRID_LAYOUTS.default).toEqual({ columns: GRID_COLUMNS, sidePadding: GRID_SIDE_PADDING, margin: CARD_MARGIN });
    expect([GRID_COLUMNS, GRID_SIDE_PADDING, CARD_MARGIN]).toEqual([2, 12, 8]);
    for (const width of [320, 375, 393, 430, 440]) {
      expect(gridCardWidth(width)).toBe(Math.floor((width - 24) / 2) - 16);
      expect(gridCardWidth(width, 'default')).toBe(gridCardWidth(width));
    }
  });

  it('fills the row from 1 to 6 columns without passing it, leaving under a pixel per column', () => {
    for (let columns = 1; columns <= 6; columns++) {
      for (const [sidePadding, margin] of [[12, 8], [16, 4], [0, 0], [20, 2]]) {
        const l = layout(columns, sidePadding, margin);
        for (let width = 280; width <= 520; width += 0.5) {
          const available = width - 2 * sidePadding;
          const row = columns * (cardWidthFor(width, l) + 2 * margin);
          expect(row).toBeLessThanOrEqual(available);
          expect(available - row).toBeLessThan(columns);
        }
      }
    }
  });

  it.each([320, 360, 375, 390, 393, 402, 414, 428, 430, 440])('fits three compact cards in a row at %ipt', width => {
    const { columns, sidePadding, margin } = GRID_LAYOUTS.compact;
    expect(columns).toBe(3);
    const available = width - 2 * sidePadding;
    const row = columns * (gridCardWidth(width, 'compact') + 2 * margin);
    expect(row).toBeLessThanOrEqual(available);
    expect(available - row).toBeLessThan(columns);
    // Wide enough for a photo and a readable line of text, even on the narrowest phone.
    expect(gridCardWidth(width, 'compact')).toBeGreaterThanOrEqual(80);
  });
});

describe('how many pieces fit on a screen', () => {
  // Above the list on the Wardrobe: the safe area, then the header the screen builds.
  // Title 28 + count line (2 + 16), the total strip (8 + its height), the search bar (12 + 44),
  // the header's own padding (8 + 12) and bottom border (1).
  const HEADER = 8 + 28 + (2 + 16) + (8 + TOTAL_STRIP_HEIGHT) + (12 + 44) + 12 + 1;
  // The bottom tab bar is 88pt on iOS (App.tsx), which covers the home indicator.
  const TAB_BAR = 88;
  const listHeight = (screenHeight: number, topInset: number) => screenHeight - topInset - HEADER - TAB_BAR;

  // iPhone 16 Pro Max (62pt of status area), iPhone SE (20pt).
  const PRO_MAX = { width: 440, height: 956, topInset: 62 };
  const SE = { width: 375, height: 667, topInset: 20 };

  it('keeps the header to what the strip and search leave: one line for the total', () => {
    expect(TOTAL_STRIP_HEIGHT).toBeLessThanOrEqual(40);
    expect(HEADER).toBeLessThan(180);
  });

  it('shows at least 6 whole pieces on a 440x956 screen', () => {
    const shown = compactCardsInView(PRO_MAX.width, listHeight(PRO_MAX.height, PRO_MAX.topInset));
    expect(shown).toBeGreaterThanOrEqual(6);
    // ...and a fourth row already peeks in below, so the screen is full, not short.
    const height = listHeight(PRO_MAX.height, PRO_MAX.topInset);
    expect(height / compactRowHeight(PRO_MAX.width)).toBeGreaterThan(shown / 3);
  });

  it('shows at least 4 whole pieces on a 375x667 screen', () => {
    expect(compactCardsInView(SE.width, listHeight(SE.height, SE.topInset))).toBeGreaterThanOrEqual(4);
  });

  it.each([
    [320, 568, 20],
    [375, 667, 20],
    [375, 812, 44],
    [393, 852, 59],
    [430, 932, 59],
    [440, 956, 62],
  ])('shows at least 4 whole pieces at %ix%i', (width, height, topInset) => {
    expect(compactCardsInView(width, listHeight(height, topInset))).toBeGreaterThanOrEqual(4);
  });

  it('shows more than the old two-across cards could, even counting only their photos', () => {
    // The old card was a 4:5 photo with a text block under it, so the photo alone is a floor on its height.
    const oldRowFloor = (width: number) => (gridCardWidth(width) * 5) / 4 + 2 * CARD_MARGIN;
    const oldMost = (s: { width: number; height: number; topInset: number }) =>
      Math.floor(listHeight(s.height, s.topInset) / oldRowFloor(s.width)) * GRID_COLUMNS;

    expect(oldMost(PRO_MAX)).toBeLessThan(compactCardsInView(PRO_MAX.width, listHeight(PRO_MAX.height, PRO_MAX.topInset)));
    expect(oldMost(SE)).toBeLessThan(compactCardsInView(SE.width, listHeight(SE.height, SE.topInset)));
    expect(oldMost(PRO_MAX)).toBeLessThanOrEqual(4);
    expect(oldMost(SE)).toBeLessThanOrEqual(2);
  });

  it('makes a row about as tall as it is wide: a square photo and a short text block', () => {
    for (const width of [320, 375, 440]) {
      const card = gridCardWidth(width, 'compact');
      expect(compactRowHeight(width)).toBeGreaterThan(card);
      expect(compactRowHeight(width) - card).toBeLessThanOrEqual(60);
    }
  });
});

describe('the Wardrobe list', () => {
  const mount = async (count = 7) => {
    (getOwnedClothingItems as jest.Mock).mockResolvedValue(Array.from({ length: count }, (_, i) => item(i)));
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WardrobeScreen navigation={navigation} />);
    });
    return tree;
  };

  it('is three columns wide, padded to match the cards', async () => {
    setWindow(393);
    const tree = await mount();
    const list = tree.root.findByType(FlatList);
    expect(list.props.numColumns).toBe(3);
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingHorizontal).toBe(GRID_LAYOUTS.compact.sidePadding);
  });

  it('draws every piece as a compact card', async () => {
    setWindow(393);
    const tree = await mount();
    // The card is memoized, so find it by what the screen hands it.
    const cards = tree.root.findAll(node => !!node.props.item && !!node.props.onDelete);
    expect(cards).toHaveLength(7);
    for (const c of cards) expect(c.props.variant).toBe('compact');
  });

  it('lays out a last row of one or two pieces at the same card size as a full one', async () => {
    setWindow(393);
    const tree = await mount(7);
    const widths = tree.root
      .findAll(node => typeof node.type === 'string' && node.props.testID === 'clothing-card')
      .map(node => StyleSheet.flatten(node.props.style).width);
    expect(widths).toHaveLength(7);
    expect(new Set(widths)).toEqual(new Set([gridCardWidth(393, 'compact')]));
  });
});
