/**
 * The category cards on the Stats screen sit three to a row. With the old
 * width formula three cards plus their gaps were wider than the section, so the
 * row wrapped to two and the grid looked broken; with eleven categories that
 * shows. The width must follow the real window and always fit three.
 */
import 'react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import { StatsScreen } from '../../src/screens/StatsScreen';
import { CLOTHING_CATEGORIES } from '../../src/utils/clothingOptions';

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const WIDTHS = [320, 375, 393, 430, 440];
// Matches the screen's section padding and the gap between category cards.
const SECTION_PADDING = 20;
const GAP = 12;

const original = Dimensions.get('window');
const setWindowWidth = (width: number) => {
  const window = { width, height: 900, scale: 3, fontScale: 1 };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
};
afterEach(() => setWindowWidth(original.width));

const mount = async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@smartcloset_initialized_v6', 'true');
  await AsyncStorage.setItem('@smartcloset_items', JSON.stringify([]));
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<StatsScreen />);
  });
  return tree;
};

const cardWidths = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll(node => typeof node.type === 'string' && node.props.testID === 'category-card')
    .map(node => (StyleSheet.flatten(node.props.style) as any).width as number);

describe('Stats category grid', () => {
  it.each(WIDTHS)('fits three cards and their gaps in a row at %ipt', async width => {
    setWindowWidth(width);
    const tree = await mount();
    const widths = cardWidths(tree);

    expect(widths).toHaveLength(CLOTHING_CATEGORIES.length);
    const available = width - 2 * SECTION_PADDING;
    const row = widths[0] * 3 + 2 * GAP;
    expect(row).toBeLessThanOrEqual(available);
    // ...and uses (almost) all of it: no dead strip beside the third card.
    expect(available - row).toBeLessThan(3);
  });

  it('follows the window instead of the width it had at start-up', async () => {
    setWindowWidth(375);
    const tree = await mount();
    const before = cardWidths(tree)[0];
    setWindowWidth(430);
    expect(cardWidths(tree)[0]).toBeGreaterThan(before);
  });
});
