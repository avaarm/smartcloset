/**
 * The compact card the Wardrobe lays out three across: a square photo, a one-line
 * name, one small line for category and brand, small round buttons that still
 * have a full-size touch target, and the colour match as a dot.
 */
import 'react-native';
import React from 'react';
import { Alert, Dimensions, Image, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ClothingItem from '../../src/components/ClothingItem';
import { COMPACT_DETAILS, GRID_LAYOUTS, gridCardWidth } from '../../src/utils/clothingGrid';
import type { BodyProfile } from '../../src/services/profileService';
import type { ClothingItem as ClothingItemType } from '../../src/types';

// Real iPhone portrait widths, narrowest (SE-class) to widest (Pro Max).
const WIDTHS = [320, 375, 393, 430, 440];
// What iOS asks of anything tappable.
const MIN_TOUCH = 32;

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

const LONG_NAME = 'Oscar de la Renta Cherry Blossom Embroidered Sequin Cocktail Dress In Pink Tulle '
  .repeat(2)
  .slice(0, 120);
const UNBROKEN_NAME = 'W'.repeat(120);
const LONG_BRAND = 'AUGUSTINASDESIGNERBOUTIQUEANDATELIERSOFPARIS';

// 'black' is in the recommended palette, 'white' in the avoid list.
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

const mount = async (
  extra: Partial<ClothingItemType> = {},
  props: Partial<React.ComponentProps<typeof ClothingItem>> = {},
  width = 375,
) => {
  setWindowWidth(width);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ClothingItem item={item(extra)} variant="compact" showActions {...props} />);
  });
  return tree;
};

const card = (tree: renderer.ReactTestRenderer) =>
  StyleSheet.flatten(
    tree.root.find(node => typeof node.type === 'string' && node.props.testID === 'clothing-card').props.style,
  ) as any;
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text);
const actionButtons = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(TouchableOpacity).filter(node => /^(Edit|Delete) /.test(node.props.accessibilityLabel ?? ''));
const style = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) as any;

describe('the compact card: size', () => {
  it.each(WIDTHS)('is one third of the row, margins included, never wider than its column (%ipt)', async width => {
    const tree = await mount({ name: LONG_NAME, brand: LONG_BRAND }, {}, width);
    const { columns, sidePadding, margin } = GRID_LAYOUTS.compact;
    const { width: cardWidth, margin: cardMargin } = card(tree);

    expect(columns).toBe(3);
    expect(cardMargin).toBe(margin);
    expect(cardWidth).toBe(gridCardWidth(width, 'compact'));
    const column = (width - 2 * sidePadding) / columns;
    expect(cardWidth + 2 * cardMargin).toBeLessThanOrEqual(column);
    expect(column - (cardWidth + 2 * cardMargin)).toBeLessThan(1);
  });

  it('follows the window instead of the width it had at start-up', async () => {
    const tree = await mount({}, {}, 375);
    expect(card(tree).width).toBe(gridCardWidth(375, 'compact'));
    setWindowWidth(430);
    expect(card(tree).width).toBe(gridCardWidth(430, 'compact'));
  });

  it('is much narrower than the default card, which is unchanged when no variant is given', async () => {
    setWindowWidth(375);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ClothingItem item={item()} showActions />);
    });
    expect(card(tree).width).toBe(gridCardWidth(375));
    expect(card(tree).width).toBe(Math.floor((375 - 2 * 12) / 2) - 2 * 8);
    expect(card(tree).margin).toBe(8);

    const compact = await mount({}, {}, 375);
    expect(card(compact).width).toBeLessThan(card(tree).width * 0.75);
  });

  it('shows a square photo, cropped rather than stretched', async () => {
    const tree = await mount({ userImage: 'https://example.com/a.jpg' });
    const image = tree.root.findByType(Image);
    expect(style(image)).toMatchObject({ width: '100%', aspectRatio: 1 });
    expect(image.props.resizeMode).toBe('cover');
  });

  it('keeps the placeholder square too when there is no photo', async () => {
    const tree = await mount({ userImage: undefined, retailerImage: undefined });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    const placeholder = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.aspectRatio !== undefined,
    );
    expect(style(placeholder).aspectRatio).toBe(1);
  });

  it('lays the text block out with the line heights the grid arithmetic counts on', async () => {
    const tree = await mount({ name: 'Plain Tee', brand: 'Acme' });
    const [name, meta] = texts(tree);
    expect(style(name).lineHeight).toBe(COMPACT_DETAILS.nameLine);
    expect(style(meta).lineHeight).toBe(COMPACT_DETAILS.metaLine);
    expect(style(meta).marginTop).toBe(COMPACT_DETAILS.gap);
    const details = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.padding === COMPACT_DETAILS.padding,
    );
    expect(details).toBeTruthy();
  });
});

describe('the compact card: text', () => {
  it('is two single lines: the name, then category and brand together', async () => {
    const tree = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme' });
    expect(texts(tree).map(t => t.props.children)).toEqual(['Wool Coat', 'Outerwear · Acme']);
    for (const t of texts(tree)) expect(t.props.numberOfLines).toBe(1);
  });

  it('has just the category when there is no brand, and adds no third line', async () => {
    const tree = await mount({ name: 'Plain Tee', category: 'bags', brand: undefined });
    expect(texts(tree).map(t => t.props.children)).toEqual(['Plain Tee', 'Bags']);
  });

  it.each([LONG_NAME, UNBROKEN_NAME])('keeps a 120-character name, and a brand with no break, to one line (%#)', async name => {
    for (const width of WIDTHS) {
      const tree = await mount({ name, brand: LONG_BRAND }, {}, width);
      const [nameText, metaText] = texts(tree);
      // One line each, so the ellipsis ends them inside the card instead of wrapping onto the next.
      expect(nameText.props.numberOfLines).toBe(1);
      expect(metaText.props.numberOfLines).toBe(1);
      // The category leads the line, so it is what stays visible when the brand is cut.
      expect(metaText.props.children).toBe(`Tops · ${LONG_BRAND}`);
      tree.unmount();
    }
  });

  it('writes the text small enough to fit three across, and not smaller than iOS reads comfortably', async () => {
    const tree = await mount({ brand: 'Acme' });
    const [name, meta] = texts(tree);
    expect(style(name).fontSize).toBeLessThanOrEqual(13);
    expect(style(name).fontSize).toBeGreaterThanOrEqual(11);
    expect(style(meta).fontSize).toBeGreaterThanOrEqual(11);
    expect(style(meta).fontSize).toBeLessThanOrEqual(style(name).fontSize);
  });
});

describe('the compact card: buttons and badge', () => {
  it('draws the edit and delete buttons smaller than the default 32pt, with a touch target of at least 32pt', async () => {
    const tree = await mount();
    const buttons = actionButtons(tree);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      const { width, height } = style(button);
      const slop = button.props.hitSlop;
      expect(width).toBeLessThan(32);
      expect(height).toBeLessThan(32);
      expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it('keeps the two touch targets from overlapping, so a tap on one never lands on the other', async () => {
    const tree = await mount();
    const tray = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.right !== undefined,
    );
    const [edit, del] = actionButtons(tree);
    expect(style(tray).gap).toBeGreaterThanOrEqual(edit.props.hitSlop.right + del.props.hitSlop.left);
  });

  it('keeps the buttons and their touch slop inside the card', async () => {
    const tree = await mount();
    const tray = tree.root.find(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.right !== undefined,
    );
    const slop = actionButtons(tree)[0].props.hitSlop;
    expect(style(tray).right).toBeGreaterThanOrEqual(slop.right);
    expect(style(tray).top).toBeGreaterThanOrEqual(slop.top);
  });

  it('still runs edit, and asks before deleting', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount({ id: 'coat', name: 'Wool Coat' }, { onEdit, onDelete });

    await act(async () => actionButtons(tree)[0].props.onPress());
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wool Coat' }));

    await act(async () => actionButtons(tree)[1].props.onPress());
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = (alertSpy.mock.calls[0][2] as any[]).find(b => b.text === 'Delete');
    confirm.onPress();
    expect(onDelete).toHaveBeenCalledWith('coat');
    alertSpy.mockRestore();
  });

  it('keeps the season badge clear of the buttons at the narrowest width', async () => {
    const tree = await mount({ season: ['fall'] }, {}, 320);
    const absolute = tree.root
      .findAll(node => typeof node.type === 'string' && style(node)?.position === 'absolute')
      .map(style);
    const badge = absolute.find(s => s.left !== undefined && s.width === 18)!;
    const tray = absolute.find(s => s.right !== undefined)!;
    const buttons = actionButtons(tree);
    const slop = buttons[0].props.hitSlop;

    const trayWidth = buttons.reduce((sum, b) => sum + style(b).width, 0) + tray.gap * (buttons.length - 1);
    const trayLeftEdge = gridCardWidth(320, 'compact') - tray.right - trayWidth;
    expect(badge.width).toBeLessThan(28);
    // The badge ends before the first button's touch target begins.
    expect(badge.left + badge.width).toBeLessThan(trayLeftEdge - slop.left);
    expect(trayLeftEdge - slop.left).toBeGreaterThanOrEqual(0);
  });

  it('shows no season badge for an item with no season', async () => {
    const tree = await mount({ season: [] });
    const badges = tree.root.findAll(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.left !== undefined,
    );
    expect(badges).toHaveLength(0);
  });
});

describe('the compact card: colour match', () => {
  const dot = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAll(
      node => typeof node.type === 'string' && style(node)?.position === 'absolute' && style(node)?.width === 10 && style(node)?.height === 10,
    );

  it('is a dot, not a line of text', async () => {
    const tree = await mount({ name: 'Black Tee', color: 'black', brand: 'Acme' }, { bodyProfile: profile });
    expect(dot(tree)).toHaveLength(1);
    expect(style(dot(tree)[0])).toMatchObject({ width: 10, height: 10, backgroundColor: '#2E8B57' });
    // Still just the name and the category line.
    expect(texts(tree).map(t => t.props.children)).toEqual(['Black Tee', 'Tops · Acme']);
    expect(texts(tree).some(t => /color|palette/i.test(String(t.props.children)))).toBe(false);
  });

  it('is a hollow red ring for a colour on the avoid list (a different shape, not just a different colour), and says so to VoiceOver', async () => {
    const tree = await mount({ color: 'white' }, { bodyProfile: profile });
    expect(style(dot(tree)[0])).toMatchObject({ backgroundColor: '#FFFFFF', borderColor: '#E57373', borderWidth: 2 });
    const details = tree.root.findByType(Pressable);
    expect(details.props.accessibilityValue).toEqual({ text: 'Outside your palette' });
  });

  it('says a match to VoiceOver, without changing the label', async () => {
    const tree = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme', color: 'black' }, { bodyProfile: profile });
    const details = tree.root.findByType(Pressable);
    expect(details.props.accessibilityLabel).toBe('Wool Coat, Outerwear, Acme');
    expect(details.props.accessibilityValue).toEqual({ text: 'Great color for you' });
  });

  it('shows nothing without a profile or for a colour in neither list', async () => {
    const noProfile = await mount({ color: 'black' });
    expect(dot(noProfile)).toHaveLength(0);
    expect(noProfile.root.findByType(Pressable).props.accessibilityValue).toBeUndefined();

    const neutral = await mount({ color: 'red' }, { bodyProfile: profile });
    expect(dot(neutral)).toHaveLength(0);
  });

  it('leaves the default card as it was: a text line, no dot', async () => {
    setWindowWidth(375);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ClothingItem item={item({ color: 'black' })} bodyProfile={profile} />);
    });
    expect(texts(tree).map(t => t.props.children)).toContain('Great color for you');
    expect(dot(tree)).toHaveLength(0);
    expect(tree.root.findByType(Pressable).props.accessibilityValue).toBeUndefined();
  });
});

describe('the compact card, for VoiceOver', () => {
  const host = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root.find(node => typeof node.type === 'string' && node.props.accessibilityLabel === label);
  const accessibleAncestors = (node: renderer.ReactTestInstance) => {
    const found: string[] = [];
    for (let up = node.parent; up; up = up.parent) {
      if (typeof up.type === 'string' && up.props.accessible === true) {
        found.push(up.props.accessibilityLabel ?? up.props.testID ?? 'unnamed');
      }
    }
    return found;
  };

  it('reads as one button with name, category and brand, and keeps the card itself out of the way', async () => {
    const tree = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme' }, { onPress: jest.fn() });
    const wrapper = tree.root.find(node => typeof node.type === 'string' && node.props.testID === 'clothing-card');
    expect(wrapper.props.accessible).toBe(false);
    const details = host(tree, 'Wool Coat, Outerwear, Acme');
    expect(details.props.accessible).toBe(true);
    expect(details.props.accessibilityRole).toBe('button');
    expect(accessibleAncestors(details)).toEqual([]);
  });

  it.each(['Edit Wool Coat', 'Delete Wool Coat'])('leaves "%s" reachable beside the details, not inside them', async label => {
    const tree = await mount({ name: 'Wool Coat', category: 'outerwear', brand: 'Acme' }, { onPress: jest.fn() });
    const button = host(tree, label);
    expect(button.props.accessible).toBe(true);
    expect(accessibleAncestors(button)).toEqual([]);
    const details = host(tree, 'Wool Coat, Outerwear, Acme');
    expect(details.findAll(node => node.props.accessibilityLabel === label)).toHaveLength(0);
  });

  it('opens the item from the details', async () => {
    const onPress = jest.fn();
    const tree = await mount({ name: 'Wool Coat' }, { onPress });
    await act(async () => tree.root.findByType(Pressable).props.onPress());
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wool Coat' }));
  });
});
