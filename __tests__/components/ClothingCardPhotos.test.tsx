/**
 * The grid card (ClothingItem) and the plain card (ClothingCard) both show the item's cover, by one rule,
 * and add a small photo count in the corner only when the item has more than one photo. At the three-across
 * size the count must not land on the season badge, the edit/delete buttons or the colour-match dot.
 */
import 'react-native';
import React from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ClothingItem from '../../src/components/ClothingItem';
import ClothingCard from '../../src/components/ClothingCard';
import { gridCardWidth } from '../../src/utils/clothingGrid';
import type { BodyProfile } from '../../src/services/profileService';
import type { ClothingItem as ClothingItemType } from '../../src/types';

const A = 'https://example.com/a.jpg';
const B = 'https://example.com/b.jpg';
const C = 'file:///var/mobile/c.jpg';

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

const profile: BodyProfile = {
  skinTone: 'medium',
  undertone: 'warm',
  bodyType: 'rectangle',
  recommendedPalette: ['#000000'],
  avoidColors: ['#FFFFFF'],
  recommendedFits: { tops: [], bottoms: [], dresses: [] },
  sizeHints: {},
  updatedAt: '2026-01-01T00:00:00Z',
};

const original = Dimensions.get('window');
const setWindowWidth = (width: number) => {
  const window = { width, height: 900, scale: 3, fontScale: 1 };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
};
afterEach(() => setWindowWidth(original.width));

const style = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) as any;
const hostWithId = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === id);
const badge = (tree: renderer.ReactTestRenderer) => hostWithId(tree, 'photo-count-badge');
const uri = (tree: renderer.ReactTestRenderer) => tree.root.findByType(Image).props.source?.uri;
const badgeTexts = (tree: renderer.ReactTestRenderer) =>
  badge(tree)[0].findAllByType(Text).map(t => String(t.props.children));
/** The view the badge is drawn in (its nearest host ancestor). */
const badgeParent = (tree: renderer.ReactTestRenderer) => {
  let up = badge(tree)[0].parent!;
  while (typeof up.type !== 'string') up = up.parent!;
  return up;
};

const mountItem = async (extra: Partial<ClothingItemType>, props: Partial<React.ComponentProps<typeof ClothingItem>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ClothingItem item={item(extra)} {...props} />);
  });
  return tree;
};
const mountCard = async (extra: Partial<ClothingItemType>) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ClothingCard item={item(extra)} />);
  });
  return tree;
};

const VARIANTS = ['default', 'compact'] as const;

describe.each(VARIANTS)('ClothingItem (%s)', variant => {
  const mount = (extra: Partial<ClothingItemType>, props: Partial<React.ComponentProps<typeof ClothingItem>> = {}) =>
    mountItem(extra, { variant, ...props });

  it('shows the cover of an item with several photos', async () => {
    const tree = await mount({ images: [A, B, C], userImage: A, retailerImage: A });
    expect(uri(tree)).toBe(A);
  });

  it('shows the cover from the list even if the single-picture fields are stale', async () => {
    const tree = await mount({ images: [B, A], userImage: A, retailerImage: A });
    expect(uri(tree)).toBe(B);
  });

  it('shows the one picture of an item saved before photo lists, as it always did', async () => {
    expect(uri(await mount({ userImage: A, retailerImage: A }))).toBe(A);
    expect(uri(await mount({ retailerImage: B }))).toBe(B);
    expect(uri(await mount({ userImage: A }))).toBe(A);
  });

  it('has no count badge for one photo, in either form', async () => {
    expect(badge(await mount({ userImage: A, retailerImage: A }))).toHaveLength(0);
    expect(badge(await mount({ images: [A], userImage: A, retailerImage: A }))).toHaveLength(0);
  });

  it('has no count badge, and the placeholder, for an item with no photo', async () => {
    const tree = await mount({ images: [], userImage: undefined, retailerImage: undefined });
    expect(badge(tree)).toHaveLength(0);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('does not count a repeated or blank entry as another photo', async () => {
    const tree = await mount({ images: [A, A, '  ', ''], userImage: A, retailerImage: A });
    expect(badge(tree)).toHaveLength(0);
  });

  it('shows the number of photos, and says "N photos" to VoiceOver, for several', async () => {
    const tree = await mount({ images: [A, B, C], userImage: A, retailerImage: A });
    expect(badge(tree)).toHaveLength(1);
    expect(badge(tree)[0].props.accessibilityLabel).toBe('3 photos');
    expect(badgeTexts(tree)).toEqual(['3']);
  });

  it('counts two photos', async () => {
    const tree = await mount({ images: [A, B], userImage: A, retailerImage: A });
    expect(badge(tree)[0].props.accessibilityLabel).toBe('2 photos');
  });

  it('puts the count in the photo\'s bottom-right corner and lets touches through to the card', async () => {
    const tree = await mount({ images: [A, B], userImage: A, retailerImage: A });
    const s = style(badge(tree)[0]);
    expect(s.position).toBe('absolute');
    expect(s.bottom).toBeGreaterThan(0);
    expect(s.right).toBeGreaterThan(0);
    expect(s.top).toBeUndefined();
    expect(s.left).toBeUndefined();
    expect(badge(tree)[0].props.pointerEvents).toBe('none');
  });

  it('sits on the photo itself, so the corner is the photo\'s and not the whole card\'s', async () => {
    const tree = await mount({ images: [A, B], userImage: A, retailerImage: A });
    const photoBlock = badgeParent(tree);
    expect(photoBlock.findAllByType(Image)).toHaveLength(1);
    // The photo and the badge are all that is in it: the name and brand are outside.
    expect(photoBlock.findAllByType(Text).map(t => String(t.props.children))).toEqual(['2']);
  });

  it('adds the photo count to what VoiceOver reads for the card, without changing it for one photo', async () => {
    const many = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme', images: [A, B, C], userImage: A }, { onPress: jest.fn() });
    expect(many.root.findByType(Pressable).props.accessibilityLabel).toBe('Wool Coat, Outerwear, Acme, 3 photos');

    const one = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme', userImage: A }, { onPress: jest.fn() });
    expect(one.root.findByType(Pressable).props.accessibilityLabel).toBe('Wool Coat, Outerwear, Acme');
  });

  it('keeps the count when the cover cannot be loaded and the placeholder takes its place', async () => {
    const tree = await mount({ images: [A, B], userImage: A, retailerImage: A });
    await act(async () => {
      tree.root.findByType(Image).props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(badge(tree)).toHaveLength(1);
  });

  it('tries again when the cover changes after a failure', async () => {
    const extra = { images: [A, B], userImage: A, retailerImage: A };
    const first = item(extra);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ClothingItem item={first} variant={variant} />);
    });
    await act(async () => {
      tree.root.findByType(Image).props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    await act(async () => {
      tree.update(<ClothingItem item={{ ...first, images: [B, A], userImage: B, retailerImage: B }} variant={variant} />);
    });
    expect(uri(tree)).toBe(B);
  });

  it('shows the same cover as the plain card for the same item', async () => {
    const extra = { images: [B, A, C], userImage: B, retailerImage: B };
    const grid = await mount(extra);
    const card = await mountCard(extra);
    expect(uri(grid)).toBe(B);
    expect(uri(card)).toBe(B);
  });
});

describe('the count at the three-across grid size', () => {
  const all = {
    images: [A, B, C],
    userImage: A,
    retailerImage: A,
    season: ['fall' as const],
    color: 'black',
  };

  it('leaves every other overlay where it was, and takes the one corner none of them use', async () => {
    const tree = await mountItem(all, { variant: 'compact', showActions: true, bodyProfile: profile });
    const absolute = tree.root
      .findAll(node => typeof node.type === 'string' && style(node)?.position === 'absolute')
      .map(style);
    const count = style(badge(tree)[0]);
    const others = absolute.filter(s => s !== count && !(s.right === count.right && s.bottom === count.bottom));

    const corner = (s: any) => `${s.top !== undefined ? 'top' : 'bottom'}-${s.left !== undefined ? 'left' : 'right'}`;
    // Season badge: top-left. Buttons: top-right. Colour-match dot: bottom-left. Count: bottom-right.
    expect(others.map(corner).sort()).toEqual(['bottom-left', 'top-left', 'top-right']);
    expect(corner(count)).toBe('bottom-right');
  });

  it('is small next to the photo, at the narrowest width of the grid', async () => {
    setWindowWidth(320);
    const tree = await mountItem(all, { variant: 'compact', showActions: true, bodyProfile: profile });
    const s = style(badge(tree)[0]);
    const photoWidth = gridCardWidth(320, 'compact');
    // The colour-match dot (10pt, 4pt in) shares this edge: the count, its own width at most ~40pt, stays clear of it.
    const dot = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.width === 10,
    );
    const countLeftEdge = photoWidth - s.right - 40;
    expect(s.height).toBeLessThanOrEqual(18);
    expect(countLeftEdge).toBeGreaterThan(style(dot).left + style(dot).width);
  });

  it('keeps the buttons and their touch slop clear of the count', async () => {
    setWindowWidth(320);
    const tree = await mountItem(all, { variant: 'compact', showActions: true });
    const photoSide = gridCardWidth(320, 'compact'); // the compact photo is square
    const button = tree.root.findAllByType(TouchableOpacity).find(b => /^Edit /.test(b.props.accessibilityLabel ?? ''))!;
    const tray = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.right !== undefined && style(node)?.top !== undefined,
    );
    const count = style(badge(tree)[0]);
    const buttonsBottom = style(tray).top + style(button).height + button.props.hitSlop.bottom;
    const countTop = photoSide - count.bottom - count.height;
    expect(buttonsBottom).toBeLessThan(countTop);
  });

  it('changes nothing about the overlays of an item with one photo', async () => {
    const tree = await mountItem({ ...all, images: [A] }, { variant: 'compact', showActions: true, bodyProfile: profile });
    expect(badge(tree)).toHaveLength(0);
    const absolute = tree.root.findAll(node => typeof node.type === 'string' && style(node)?.position === 'absolute');
    expect(absolute).toHaveLength(3);
  });
});

describe('ClothingCard', () => {
  it('shows the cover', async () => {
    expect(uri(await mountCard({ images: [A, B], userImage: A, retailerImage: A }))).toBe(A);
  });

  it('shows the same single picture the grid card does, whichever field holds it (one rule)', async () => {
    // It used to prefer retailerImage while the grid card preferred userImage.
    const extra = { userImage: A, retailerImage: B };
    expect(uri(await mountCard(extra))).toBe(uri(await mountItem(extra, { variant: 'compact' })));
  });

  it('still shows its image for an item with just one picture field', async () => {
    expect(uri(await mountCard({ retailerImage: B }))).toBe(B);
    expect(uri(await mountCard({ userImage: A }))).toBe(A);
  });

  it('has no badge for one photo, and a count for several', async () => {
    expect(badge(await mountCard({ userImage: A, retailerImage: A }))).toHaveLength(0);
    const many = await mountCard({ images: [A, B, C], userImage: A, retailerImage: A });
    expect(badge(many)).toHaveLength(1);
    expect(badge(many)[0].props.accessibilityLabel).toBe('3 photos');
    expect(badgeTexts(many)).toEqual(['3']);
  });

  it('draws the badge on the photo, in its bottom-right corner', async () => {
    const tree = await mountCard({ images: [A, B], userImage: A });
    const s = style(badge(tree)[0]);
    expect(s).toMatchObject({ position: 'absolute' });
    expect(s.bottom).toBeGreaterThan(0);
    expect(s.right).toBeGreaterThan(0);
    expect(badgeParent(tree).findAllByType(Image)).toHaveLength(1);
  });

  it('leaves the source empty after the image fails, and tries again for a new cover', async () => {
    const first = item({ images: [A, B], userImage: A });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ClothingCard item={first} />);
    });
    await act(async () => {
      tree.root.findByType(Image).props.onError();
    });
    expect(tree.root.findByType(Image).props.source).toBeUndefined();
    await act(async () => {
      tree.update(<ClothingCard item={{ ...first, images: [B], userImage: B }} />);
    });
    expect(uri(tree)).toBe(B);
  });
});
