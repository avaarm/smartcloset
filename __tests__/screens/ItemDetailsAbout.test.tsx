/**
 * Item Details, the owner's TestFlight findings: size, style, condition and washing instructions are always on
 * the screen (a prompt where nothing is filled in), the tag scan is a prominent card, the rating questions and
 * the brand rating are in plain view, and the brand badge rates the brand when there is no report to open.
 */
import 'react-native';
import React from 'react';
import { Alert, Modal, Pressable, Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

let mockFlags = { ratings: true, insights: false, tag: true };
jest.mock('../../src/config/ratingFlags', () => ({
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: false,
  TAG_SCAN_ENABLED: true,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => mockFlags.ratings,
  brandInsightsActive: () => mockFlags.ratings && mockFlags.insights,
  tagScanActive: () => mockFlags.tag,
}));

const mockNavigate = jest.fn();
let mockItem: any;
let mockRefocus: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useRoute: () => ({ params: { item: mockItem } }),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    // Runs once when the screen opens; mockRefocus runs it again, as coming back to the screen does.
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockRefocus = effect;
      React.useEffect(effect, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getClothingItem: jest.fn(async () => mockItem),
  updateClothingItem: jest.fn(async () => undefined),
  deleteClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markItemWorn: jest.fn(), undoLastWear: jest.fn() },
}));
jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
  saveItemRating: jest.fn(),
  deleteItemRating: jest.fn(),
  saveBrandRating: jest.fn(),
  deleteBrandRating: jest.fn(),
}));
// The swap card reads the member's session; it is not what this suite is about.
jest.mock('../../src/components/SwapListingCard', () => ({ __esModule: true, default: () => null }));

import ItemDetailsScreen from '../../src/screens/ItemDetailsScreen';
import { getAuthUserId } from '../../src/services/authUser';
import * as ratingService from '../../src/services/ratingService';
import type { BrandRating, ItemRating, MyBrandSummary } from '../../src/types/rating';

const authUserId = getAuthUserId as jest.Mock;
const loadMyItemRating = ratingService.loadMyItemRating as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;
const saveItemRating = ratingService.saveItemRating as jest.Mock;
const saveBrandRating = ratingService.saveBrandRating as jest.Mock;

const ID = '5f0e8a52-1b2c-4d3e-8f90-123456789abc';

const ok = <T,>(value: T) => ({ state: 'ok' as const, value });
const summary = (over: Partial<MyBrandSummary> = {}): MyBrandSummary => ({
  itemsRated: 0,
  avgOverall: null,
  brandRating: null,
  canRateBrand: true,
  ...over,
});
const itemRating = (over: Partial<ItemRating> = {}): ItemRating => ({
  itemId: ID,
  overall: 4,
  touch: null,
  touchTags: [],
  comfort: null,
  comfortTags: [],
  holdsUp: null,
  holdsUpTags: [],
  fit: null,
  wouldBuyAgain: null,
  note: 'Runs warm',
  contributed: false,
  wearsAtRating: 2,
  createdAt: '',
  updatedAt: '',
  ...over,
});
const brandRating = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Coach',
  overall: 5,
  quality: null,
  fitConsistency: null,
  value: null,
  contributed: false,
  updatedAt: '',
  ...over,
});

const makeItem = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Linen Shirt',
  category: 'tops',
  brand: 'Coach',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00.000Z',
  isWishlist: false,
  ...over,
});

let errorSpy: jest.SpyInstance;
const mounted: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockFlags = { ratings: true, insights: false, tag: true };
  mockNavigate.mockClear();
  mockRefocus = null;
  authUserId.mockReset().mockResolvedValue('u1');
  loadMyItemRating.mockReset().mockResolvedValue(ok(null));
  loadMyBrandSummary.mockReset().mockResolvedValue(ok(summary()));
  saveItemRating.mockReset().mockResolvedValue({ contributed: false, blocked: null, updatedAt: '' });
  saveBrandRating.mockReset().mockResolvedValue({ contributed: false, blocked: null });
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  while (mounted.length) {
    const tree = mounted.pop()!;
    act(() => tree.unmount());
  }
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const flush = () =>
  act(async () => {
    await new Promise(resolve => setImmediate(resolve));
  });

const render = async (item: any) => {
  mockItem = item;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemDetailsScreen />);
  });
  mounted.push(tree);
  await flush();
  return tree;
};

const textsOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

const indexOfText = (texts: string[], text: string): number => {
  const at = texts.indexOf(text);
  if (at === -1) {
    throw new Error(`no text "${text}" in: ${texts.join(' | ')}`);
  }
  return at;
};

const pressables = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const hasLabel = (tree: renderer.ReactTestRenderer, label: string) => pressables(tree, label).length > 0;
const pressLabel = async (tree: renderer.ReactTestRenderer, label: string) => {
  const found = pressables(tree, label);
  if (found.length === 0) {
    throw new Error(`nothing to press labelled "${label}"`);
  }
  await act(async () => {
    await found[0].props.onPress();
  });
};
const sheetOpen = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Modal).some(m => m.props.visible === true);

describe('About this piece', () => {
  it('is on every owned piece, with a prompt for each thing that is missing', async () => {
    const tree = await render(makeItem());
    const texts = textsOf(tree);
    for (const label of ['About this piece', 'Size', 'Style', 'Condition', 'Washing instructions', 'Made in']) {
      expect(texts).toContain(label);
    }
    for (const prompt of ['Add size', 'Add style', 'Add condition', 'Add washing instructions', 'Add country']) {
      expect(texts).toContain(prompt);
      expect(hasLabel(tree, prompt)).toBe(true);
    }
  });

  it('sits under the value and scan card, above the rating card and Details', async () => {
    const tree = await render(makeItem());
    const texts = textsOf(tree);
    const value = indexOfText(texts, 'Value');
    const scan = indexOfText(texts, 'Scan the tag & washing instructions');
    const about = indexOfText(texts, 'About this piece');
    const rating = indexOfText(texts, 'How is it?');
    const details = indexOfText(texts, 'Details');
    expect(value).toBeLessThan(scan);
    expect(scan).toBeLessThan(about);
    expect(about).toBeLessThan(rating);
    expect(rating).toBeLessThan(details);
  });

  it('opens Edit item from a prompt, with the wear count shown on the screen', async () => {
    const tree = await render(makeItem({ wearCount: 4 }));
    await pressLabel(tree, 'Add size');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: ID, name: 'Linen Shirt', wearCount: 4 }),
    });
    // A plain edit: the scanner is not asked to open.
    expect(mockNavigate.mock.calls[0][1]).not.toHaveProperty('scanTag');
  });

  it('shows the values that are filled in, and care as readable phrases', async () => {
    const tree = await render(
      makeItem({
        size: 'EU 38',
        condition: 'like_new',
        careInstructions: ['Hand wash', 'Do not tumble dry'],
        originCountry: 'Portugal',
        tags: ['boho', 'gift'],
      }),
    );
    const texts = textsOf(tree);
    for (const shown of ['EU 38', 'Like new', 'Hand wash', 'Do not tumble dry', 'Portugal', 'Boho']) {
      expect(texts).toContain(shown);
    }
    for (const prompt of ['Add size', 'Add style', 'Add condition', 'Add washing instructions', 'Add country']) {
      expect(texts).not.toContain(prompt);
    }
  });

  it('shows size and style for a wishlist piece, and nothing about wearing or washing', async () => {
    const tree = await render(makeItem({ isWishlist: true, size: 'S', tags: ['elegant'] }));
    const texts = textsOf(tree);
    expect(texts).toContain('About this piece');
    expect(texts).toContain('S');
    expect(texts).toContain('Elegant');
    for (const gone of ['Condition', 'Washing instructions', 'Made in', 'Scan the tag & washing instructions']) {
      expect(texts).not.toContain(gone);
    }
  });

  it('sends a wishlist piece to the editor from its prompts', async () => {
    const tree = await render(makeItem({ isWishlist: true }));
    expect(hasLabel(tree, 'Add size')).toBe(true);
    expect(hasLabel(tree, 'Add condition')).toBe(false);
    await pressLabel(tree, 'Add style');
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing', { editItem: expect.objectContaining({ id: ID, isWishlist: true }) });
  });

  it('keeps its facts when tag scanning is off, without the rows only a scan fills', async () => {
    mockFlags = { ratings: true, insights: false, tag: false };
    const tree = await render(makeItem({ size: 'M', tags: ['classic'] }));
    const texts = textsOf(tree);
    expect(texts).toContain('About this piece');
    expect(texts).toContain('M');
    expect(texts).toContain('Classic');
    expect(texts).toContain('Condition');
    expect(texts).not.toContain('Washing instructions');
    expect(texts).not.toContain('Scan the tag & washing instructions');
  });
});

describe('Tags and style', () => {
  it('shows style words as chips under Style and keeps them out of Tags', async () => {
    const tree = await render(makeItem({ tags: ['casual', 'summer', 'Vintage', 'gift'] }));
    const texts = textsOf(tree);
    expect(texts).toContain('Casual');
    expect(texts).toContain('Vintage');
    // The Tags section is left with what the person typed.
    const tagsAt = indexOfText(texts, 'Tags');
    const afterTags = texts.slice(tagsAt + 1, tagsAt + 3);
    expect(afterTags).toEqual(['summer', 'gift']);
    expect(texts.filter(t => t === 'casual')).toHaveLength(0);
  });

  it('hides Tags when only style words were left', async () => {
    const tree = await render(makeItem({ tags: ['casual', 'boho'] }));
    const texts = textsOf(tree);
    expect(texts).not.toContain('Tags');
    expect(texts).toContain('Casual');
    expect(texts).toContain('Boho');
  });

  it('keeps Tags when the person typed some and no style was chosen', async () => {
    const tree = await render(makeItem({ tags: ['summer'] }));
    expect(textsOf(tree)).toContain('Tags');
    expect(textsOf(tree)).toContain('Add style');
  });
});

describe('the tag scan card', () => {
  it('is a card-sized button that sends the piece to the form with the scanner open', async () => {
    const tree = await render(makeItem({ wearCount: 2, lastWorn: '2026-09-01T00:00:00.000Z' }));
    const [card] = pressables(tree, 'Scan the tag & washing instructions');
    expect(card.props.accessibilityRole).toBe('button');
    await pressLabel(tree, 'Scan the tag & washing instructions');
    expect(mockNavigate).toHaveBeenCalledWith('AddClothing', {
      editItem: expect.objectContaining({ id: ID, wearCount: 2, lastWorn: '2026-09-01T00:00:00.000Z' }),
      scanTag: true,
    });
  });

  it('says "Scan the tag again" once the piece has tag text', async () => {
    const tree = await render(makeItem({ tagText: '100% linen' }));
    expect(hasLabel(tree, 'Scan the tag again')).toBe(true);
    expect(hasLabel(tree, 'Scan the tag & washing instructions')).toBe(false);
  });

  it('is not shown to a guest or on a wishlist piece', async () => {
    authUserId.mockResolvedValue(null);
    expect(hasLabel(await render(makeItem()), 'Scan the tag & washing instructions')).toBe(false);
    authUserId.mockResolvedValue('u1');
    expect(hasLabel(await render(makeItem({ isWishlist: true })), 'Scan the tag & washing instructions')).toBe(false);
  });
});

describe('rating questions on the screen', () => {
  it('shows the stars and the hand feel, how it wears and fit chips with nothing to open', async () => {
    const tree = await render(makeItem());
    const texts = textsOf(tree);
    for (const shown of ['How is it?', 'Hand feel', 'How it wears', 'Fit', 'Soft', 'Breathable', 'Runs small', 'True to size']) {
      expect(texts).toContain(shown);
    }
    expect(hasLabel(tree, 'Rate hand feel: Soft')).toBe(true);
    expect(hasLabel(tree, 'Rate how it wears: Cozy')).toBe(true);
    expect(hasLabel(tree, 'Rate fit: Runs large')).toBe(true);
    expect(sheetOpen(tree)).toBe(false);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('saves a tap on a word at once once the piece is rated', async () => {
    loadMyItemRating.mockResolvedValue(ok(itemRating({ touchTags: ['soft'] })));
    const tree = await render(makeItem());
    await pressLabel(tree, 'Rate fit: True to size');
    await flush();
    expect(saveItemRating).toHaveBeenCalledWith(ID, expect.objectContaining({ overall: 4, touchTags: ['soft'], fit: 'true_to_size', note: 'Runs warm' }));
  });

  it('holds a word for the star when the piece is not rated yet', async () => {
    const tree = await render(makeItem());
    await pressLabel(tree, 'Rate hand feel: Soft');
    expect(saveItemRating).not.toHaveBeenCalled();
    expect(textsOf(tree)).toContain('Pick a star to save the words you chose.');
  });

  it('reads the rating again when the screen comes back into view', async () => {
    const tree = await render(makeItem());
    expect(textsOf(tree)).toContain('How is it?');
    expect(loadMyItemRating).toHaveBeenCalledTimes(1);

    // The edit form rated the piece meanwhile.
    loadMyItemRating.mockResolvedValue(ok(itemRating({ comfortTags: ['cozy'] })));
    await act(async () => {
      mockRefocus!();
    });
    await flush();
    expect(loadMyItemRating).toHaveBeenCalledTimes(2);
    expect(textsOf(tree)).toContain('Your rating');
    expect(pressables(tree, 'Rate how it wears: Cozy')[0].props.accessibilityState.selected).toBe(true);
  });

  it('shows no questions to a guest, who gets the one line', async () => {
    loadMyItemRating.mockResolvedValue({ state: 'guest' });
    const tree = await render(makeItem());
    expect(textsOf(tree)).toContain('Sign in to rate your pieces and see what members say about brands.');
    expect(hasLabel(tree, 'Rate hand feel: Soft')).toBe(false);
  });

  it('shows no questions on a wishlist piece, and none with ratings off', async () => {
    expect(hasLabel(await render(makeItem({ isWishlist: true })), 'Rate hand feel: Soft')).toBe(false);
    mockFlags = { ratings: false, insights: false, tag: true };
    const off = await render(makeItem());
    expect(textsOf(off)).not.toContain('How is it?');
    expect(hasLabel(off, 'Rate hand feel: Soft')).toBe(false);
  });
});

describe('the brand rating', () => {
  it('is in the card as "Rate Coach", with brand insights off', async () => {
    const tree = await render(makeItem());
    expect(hasLabel(tree, 'Rate Coach')).toBe(true);
    expect(loadMyBrandSummary).toHaveBeenCalledWith('Coach');
    expect(hasLabel(tree, 'See what members say about Coach')).toBe(false);
  });

  it('opens the same sheet from the card and from the brand badge', async () => {
    const tree = await render(makeItem());
    expect(sheetOpen(tree)).toBe(false);
    await pressLabel(tree, 'Rate Coach');
    expect(sheetOpen(tree)).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('turns the brand badge into a button that rates the brand', async () => {
    const tree = await render(makeItem());
    const [badge] = pressables(tree, 'Rate the brand Coach');
    expect(badge.props.accessibilityRole).toBe('button');
    await pressLabel(tree, 'Rate the brand Coach');
    expect(sheetOpen(tree)).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('refreshes the brand rating after a save, in the card', async () => {
    const tree = await render(makeItem());
    await pressLabel(tree, 'Rate the brand Coach');
    await pressLabel(tree, 'Overall rating, 5 of 5');
    loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: brandRating() })));
    await pressLabel(tree, 'Save');
    await flush();
    expect(saveBrandRating).toHaveBeenCalledWith('Coach', { overall: 5, quality: null, fitConsistency: null, value: null });
    expect(sheetOpen(tree)).toBe(false);
    expect(textsOf(tree)).toContain('Your Coach rating');
    expect(hasLabel(tree, 'Edit your rating of Coach')).toBe(true);
    // The badge still opens the sheet, now for editing.
    await pressLabel(tree, 'Rate the brand Coach');
    expect(sheetOpen(tree)).toBe(true);
    expect(hasLabel(tree, 'Remove rating')).toBe(true);
  });

  it('shows a stored brand rating without any tap', async () => {
    loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: brandRating({ overall: 3, quality: 4 }) })));
    const tree = await render(makeItem());
    expect(textsOf(tree)).toContain('Your Coach rating');
    expect(textsOf(tree)).toContain('Quality 4');
    expect(hasLabel(tree, 'Rate Coach')).toBe(false);
  });

  it('keeps the badge a plain label for a guest, for a wishlist piece, and with ratings off', async () => {
    loadMyItemRating.mockResolvedValue({ state: 'guest' });
    const guest = await render(makeItem());
    expect(hasLabel(guest, 'Rate the brand Coach')).toBe(false);
    expect(textsOf(guest)).toContain('Coach');

    loadMyItemRating.mockResolvedValue(ok(null));
    const wishlist = await render(makeItem({ isWishlist: true }));
    expect(hasLabel(wishlist, 'Rate the brand Coach')).toBe(false);
    expect(hasLabel(wishlist, 'Rate Coach')).toBe(false);

    mockFlags = { ratings: false, insights: false, tag: true };
    const off = await render(makeItem());
    expect(hasLabel(off, 'Rate the brand Coach')).toBe(false);
    expect(textsOf(off)).toContain('Coach');
  });

  it('keeps the badge plain when the brand cannot be rated', async () => {
    loadMyBrandSummary.mockResolvedValue(ok(summary({ canRateBrand: false })));
    const tree = await render(makeItem());
    expect(hasLabel(tree, 'Rate the brand Coach')).toBe(false);
    expect(hasLabel(tree, 'Rate Coach')).toBe(false);
  });

  it('has no brand badge button for a piece with no brand', async () => {
    const tree = await render(makeItem({ brand: undefined }));
    expect(tree.root.findAllByType(Pressable).filter(n => String(n.props.accessibilityLabel).startsWith('Rate the brand'))).toHaveLength(0);
  });
});
