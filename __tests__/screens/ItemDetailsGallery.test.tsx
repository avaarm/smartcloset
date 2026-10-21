/**
 * ItemDetails hero: an item with several photos gets the swipeable gallery (dots, counter, tap for full
 * screen); an item with one photo, or only the old single-picture fields, looks as it did.
 */
import 'react-native';
import React from 'react';
import { Animated, Dimensions, Image, Modal, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import { ClothingItem } from '../../src/types';

const mockNavigate = jest.fn();
let mockItem: ClothingItem;
let mockFresh: ClothingItem | null = null;

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockFresh ?? mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));

const A = 'https://example.com/a.jpg';
const B = 'https://example.com/b.jpg';
const C = 'file:///var/mobile/c.jpg';

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
  mockFresh = null;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemDetailsScreen />);
  });
  return tree;
};

const hosts = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id);
const gallery = (tree: renderer.ReactTestRenderer) => hosts(tree, 'item-image-gallery');
/** The hero's images: everything outside the full-screen viewer. */
const heroImages = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Image).filter(img => {
    for (let up = img.parent; up; up = up.parent) if (up.type === Modal) return false;
    return true;
  });
const counterTexts = (tree: renderer.ReactTestRenderer) =>
  gallery(tree)[0]
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''));
const flat = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) as any;

beforeEach(() => {
  mockNavigate.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('ItemDetails hero with several photos', () => {
  const many = () => makeItem({ images: [A, B, C], userImage: A, retailerImage: A });

  it('shows every photo as a page of the gallery, cover first', async () => {
    const tree = await render(many());
    expect(gallery(tree)).toHaveLength(1);
    expect(heroImages(tree).map(i => i.props.source.uri)).toEqual([A, B, C]);
  });

  it('shows the page dots and the n/N counter', async () => {
    const tree = await render(many());
    expect(hosts(tree, 'item-image-dots')).toHaveLength(1);
    expect(hosts(tree, 'item-image-dot')).toHaveLength(2);
    expect(hosts(tree, 'item-image-dot-active')).toHaveLength(1);
    expect(counterTexts(tree)).toEqual(['1/3']);
  });

  it('labels the pages for VoiceOver', async () => {
    const tree = await render(many());
    const labels = gallery(tree)[0].findAll(
      n => typeof n.type === 'string' && /^Photo \d of \d$/.test(n.props.accessibilityLabel ?? ''),
    );
    expect(labels.map(n => n.props.accessibilityLabel)).toEqual(['Photo 1 of 3', 'Photo 2 of 3', 'Photo 3 of 3']);
  });

  it('opens a photo full screen when it is tapped', async () => {
    const tree = await render(many());
    expect(hosts(tree, 'item-image-viewer')).toHaveLength(0);
    const page = tree.root.find(
      n => n.props.testID === 'item-image-page-1' && typeof n.props.onPress === 'function' && typeof n.type !== 'string',
    );
    await act(async () => page.props.onPress());
    expect(hosts(tree, 'item-image-viewer')).toHaveLength(1);
  });

  it('keeps the dots and counter above the bottom of the hero that the content sheet covers', async () => {
    const tree = await render(many());
    const row = gallery(tree)[0].find(n => typeof n.type === 'string' && n.props.pointerEvents === 'none');
    // The sheet is pulled 24pt up over the hero.
    expect(flat(row).bottom).toBeGreaterThan(24);
  });

  it('lets swipes and taps through the gradient at the foot of the hero', async () => {
    const tree = await render(many());
    const gradients = tree.root.findAll(n => (n.type as any) === 'LinearGradient' && flat(n)?.height === 100);
    expect(gradients).toHaveLength(1);
    expect(gradients[0].props.pointerEvents).toBe('none');
  });

  it('takes the hero\'s height, inside the container that keeps the pull-down scale animation', async () => {
    const tree = await render(many());
    const heroHeight = Dimensions.get('window').height * 0.5;
    expect(flat(gallery(tree)[0]).height).toBe(heroHeight);
    const animated = tree.root.findAllByType(Animated.View).filter(n => {
      const s = flat(n);
      return s?.height === heroHeight && Array.isArray(s?.transform) && n.findAll(x => x === gallery(tree)[0]).length > 0;
    });
    expect(animated).toHaveLength(1);
  });

  it('shows the new photos when the screen re-reads the item and finds a longer list', async () => {
    mockItem = makeItem({ images: [A], userImage: A, retailerImage: A });
    mockFresh = many();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ItemDetailsScreen />);
    });
    await act(async () => {});
    expect(hosts(tree, 'item-image-dots')).toHaveLength(1);
    expect(counterTexts(tree)).toEqual(['1/3']);
  });
});

describe('ItemDetails hero with one photo', () => {
  it.each([
    ['both single-picture fields', { userImage: A, retailerImage: A }],
    ['only the shop picture', { retailerImage: A }],
    ['only the own photo', { userImage: A }],
    ['a one-photo list', { images: [A], userImage: A, retailerImage: A }],
  ])('looks as it did, for %s: the picture alone, cropped to fill the hero', async (_label, fields) => {
    const tree = await render(makeItem(fields as Partial<ClothingItem>));
    expect(heroImages(tree)).toHaveLength(1);
    expect(heroImages(tree)[0].props.source).toEqual({ uri: A });
    expect(heroImages(tree)[0].props.resizeMode).toBe('cover');
    expect(flat(heroImages(tree)[0])).toMatchObject({ width: '100%', height: '100%' });
    expect(hosts(tree, 'item-image-dots')).toHaveLength(0);
    expect(hosts(tree, 'item-image-gallery-scroll')).toHaveLength(0);
    expect(counterTexts(tree)).toEqual([]);
  });

  it('still shows the gradient over the picture', async () => {
    const tree = await render(makeItem({ userImage: A, retailerImage: A }));
    const gradients = tree.root.findAll(n => (n.type as any) === 'LinearGradient' && flat(n)?.height === 100);
    expect(gradients).toHaveLength(1);
    expect(flat(gradients[0])).toMatchObject({ position: 'absolute', bottom: 0, left: 0, right: 0 });
  });

  it('shows a placeholder, not a broken picture, for an item with no photo', async () => {
    const tree = await render(makeItem({}));
    expect(heroImages(tree)).toHaveLength(0);
    expect(hosts(tree, 'item-image-dots')).toHaveLength(0);
    expect(gallery(tree)).toHaveLength(1);
  });

  it('keeps the rest of the screen: the name, the buttons and the edit pencil', async () => {
    const tree = await render(makeItem({ userImage: A, retailerImage: A }));
    const texts = tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
    expect(texts).toContain('Linen Shirt');
    expect(tree.root.findAll(n => n.props.name === 'pencil').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.props.name === 'heart-outline').length).toBeGreaterThan(0);
  });
});

describe('ItemDetails floating buttons', () => {
  it('pass touches through the space between them, so the photos can be swiped under the row', async () => {
    const tree = await render(makeItem({ images: [A, B], userImage: A }));
    const row = tree.root.find(n => typeof n.type === 'string' && flat(n)?.zIndex === 99);
    expect(row.props.pointerEvents).toBe('box-none');
  });
});
