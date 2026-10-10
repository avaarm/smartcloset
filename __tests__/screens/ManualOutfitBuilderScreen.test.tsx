/**
 * The manual outfit builder: its category filter lists the eleven categories
 * by name, and the Save modal's season tags have an "All" choice.
 */
import 'react-native';
import React from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ManualOutfitBuilderScreen from '../../src/screens/ManualOutfitBuilderScreen';
import { getClothingItems } from '../../src/services/storage';
import { saveOutfit } from '../../src/services/outfitService';
import type { ClothingItem } from '../../src/types';

jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ saveOutfit: jest.fn(async () => undefined) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));

const closet: ClothingItem[] = [
  { id: 'b1', name: 'Andiamo shopper', category: 'bags', color: 'brown', season: ['fall'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false },
  { id: 't1', name: 'Linen shirt', category: 'tops', color: 'white', season: ['summer'], dateAdded: '2026-01-01T00:00:00Z', isWishlist: false },
];

let tree: renderer.ReactTestRenderer;

const textsOf = (node: any): string[] => {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  return textsOf(node.children);
};

/** The pressable around the text `label` (a title may show the same words, so each match is tried). */
const pressableWithText = (label: string) => {
  const texts = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label);
  for (const text of texts) {
    let node: any = text;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    if (node) return node;
  }
  throw new Error(`nothing to press for "${label}"`);
};

const seasonChip = (label: string) =>
  tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole === 'checkbox' &&
      n.findAll(t => (t.type as unknown) === 'Text' && t.props.children === label).length > 0,
  )[0];

const isOn = (node: any): boolean => !!node.props.accessibilityState?.checked;

/** Pick the first item, tap the header's check mark, and wait for the Save modal. */
const openSaveModal = async () => {
  await act(async () => pressableWithText('Andiamo shopper').props.onPress());
  const headerCheck = tree.root
    .findAllByType(TouchableOpacity)
    .find(t => t.findAll(n => (n.type as unknown) === 'Icon' && n.props.name === 'checkmark').length > 0)!;
  await act(async () => headerCheck.props.onPress());
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (getClothingItems as jest.Mock).mockResolvedValue(closet);
  await act(async () => {
    tree = renderer.create(<ManualOutfitBuilderScreen />);
  });
});

afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
});

describe('category filter', () => {
  it('lists All and every category by its name', () => {
    const all = textsOf(tree.toJSON());
    for (const label of [
      'All', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes',
      'Bags', 'Jewelry', 'Hats', 'Activewear', 'Swimwear', 'Accessories',
    ]) {
      expect(all).toContain(label);
    }
  });

  it('narrows the grid to the tapped category and back with All', async () => {
    await act(async () => pressableWithText('Bags').props.onPress());
    expect(textsOf(tree.toJSON())).toContain('Andiamo shopper');
    expect(textsOf(tree.toJSON())).not.toContain('Linen shirt');

    await act(async () => pressableWithText('All').props.onPress());
    expect(textsOf(tree.toJSON())).toContain('Linen shirt');
  });
});

describe('season tags in the Save modal', () => {
  it('has an All chip that lights as soon as every season is on, and saves all four', async () => {
    await openSaveModal();
    expect(isOn(seasonChip('all'))).toBe(false);

    await act(async () => seasonChip('all').props.onPress());
    expect(isOn(seasonChip('all'))).toBe(true);
    expect(isOn(seasonChip('summer'))).toBe(false); // "All" stands for them

    await act(async () => {
      tree.root.findAll(n => n.props.placeholder === 'e.g., Summer Brunch Look')[0].props.onChangeText('Everything look');
    });
    await act(async () => pressableWithText('Save Outfit').props.onPress());
    expect(saveOutfit).toHaveBeenCalledWith(
      expect.objectContaining({ season: ['spring', 'summer', 'fall', 'winter'] }),
    );
  });

  it('narrows to one season when one is tapped while All is on, and All clears them again', async () => {
    await openSaveModal();
    await act(async () => seasonChip('all').props.onPress());
    await act(async () => seasonChip('winter').props.onPress());
    expect(isOn(seasonChip('all'))).toBe(false);
    expect(isOn(seasonChip('winter'))).toBe(true);
    expect(isOn(seasonChip('fall'))).toBe(false);

    await act(async () => seasonChip('winter').props.onPress());
    await act(async () => seasonChip('all').props.onPress());
    await act(async () => seasonChip('all').props.onPress());
    expect(isOn(seasonChip('all'))).toBe(false);
  });

  it('still lets seasons be picked one by one', async () => {
    await openSaveModal();
    await act(async () => seasonChip('spring').props.onPress());
    await act(async () => seasonChip('fall').props.onPress());
    expect(isOn(seasonChip('spring'))).toBe(true);
    expect(isOn(seasonChip('fall'))).toBe(true);
    expect(isOn(seasonChip('summer'))).toBe(false);
  });
});
