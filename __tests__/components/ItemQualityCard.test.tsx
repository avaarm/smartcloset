/**
 * ItemQualityCard (documentation/design/quality-ratings.md, 3.3, 3.7 and 6.1): every row of the card table, the
 * one-tap star, the nudge at 3 and 10 wears, and the rule that with the flag off nothing renders and nothing
 * is called.
 */
import 'react-native';
import React from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

let mockRatingsOn = true;
let mockInsightsOn = true;
jest.mock('../../src/config/ratingFlags', () => ({
  get RATINGS_ENABLED() {
    return mockRatingsOn;
  },
  get BRAND_INSIGHTS_ENABLED() {
    return mockInsightsOn;
  },
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => mockRatingsOn,
  brandInsightsActive: () => mockRatingsOn && mockInsightsOn,
  tagScanActive: () => false,
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  saveItemRating: jest.fn(),
  deleteItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
}));

let mockConsent: any;
let mockConsentHookCalls = 0;
jest.mock('../../src/components/RatingConsentSheet', () => ({
  useRatingConsent: () => {
    mockConsentHookCalls += 1;
    return mockConsent;
  },
}));

import ItemQualityCard, {
  GUEST_LINE,
  LOAD_FAILED,
  NUDGE_TEN,
  NUDGE_THREE,
  STAR_HELPER,
  STATUS_COUNTS,
  STATUS_PRIVATE,
  type ItemQualityCardProps,
} from '../../src/components/ItemQualityCard';
import { scaleStepLabel } from '../../src/components/RatingScale';
import { REMOVE_MESSAGE, REMOVE_TITLE } from '../../src/components/RateItemSheet';
import type { Score } from '../../src/config/ratingVocabulary';
import * as ratingService from '../../src/services/ratingService';
import type { ClothingItem } from '../../src/types';
import type { ItemRating, Loaded, MyBrandSummary } from '../../src/types/rating';

const loadMyItemRating = ratingService.loadMyItemRating as jest.Mock;
const saveItemRating = ratingService.saveItemRating as jest.Mock;
const deleteItemRating = ratingService.deleteItemRating as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;
const realRatingService = jest.requireActual('../../src/services/ratingService');

const ID = '5f0e8a52-1b2c-4d3e-8f90-123456789abc';

const makeItem = (over: Partial<ClothingItem> = {}): ClothingItem => ({
  id: ID,
  name: 'Linen shirt',
  category: 'tops',
  brand: 'Zara',
  size: 'M',
  color: 'white',
  season: ['summer'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...over,
});

const rating = (over: Partial<ItemRating> = {}): ItemRating => ({
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
  note: null,
  contributed: false,
  wearsAtRating: 2,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

const ok = <T,>(value: T): Loaded<T> => ({ state: 'ok', value });
const summary = (over: Partial<MyBrandSummary> = {}): MyBrandSummary => ({
  itemsRated: 4,
  avgOverall: 3.75,
  brandRating: null,
  canRateBrand: true,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join(' ');
  }
  return flatten(node.children);
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
const trees: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockRatingsOn = true;
  mockInsightsOn = true;
  mockConsentHookCalls = 0;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockFrom.mockReset();
  loadMyItemRating.mockReset().mockResolvedValue(ok(null));
  saveItemRating.mockReset().mockResolvedValue({ contributed: false, blocked: null, updatedAt: '2026-10-13T00:00:00Z' });
  deleteItemRating.mockReset().mockResolvedValue(undefined);
  loadMyBrandSummary.mockReset().mockResolvedValue(ok(summary({ itemsRated: 0, avgOverall: null })));
  mockConsent = {
    granted: true,
    needsReconsent: false,
    available: true,
    requiresAdult: true,
    loading: false,
    refresh: jest.fn(async () => {}),
    requestConsent: jest.fn(async () => true),
    sheet: React.createElement(View, { accessibilityLabel: 'consent sheet' }),
  };
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop()!;
    act(() => tree.unmount());
  }
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const baseProps = (over: Partial<ItemQualityCardProps> = {}): ItemQualityCardProps => ({
  item: makeItem(),
  wearCount: 2,
  onOpenBrand: jest.fn(),
  onRatingChange: jest.fn(),
  ...over,
});

const mount = async (over: Partial<ItemQualityCardProps> = {}) => {
  const props = baseProps(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemQualityCard {...props} />);
  });
  trees.push(tree);
  const all = (label: string): ReactTestInstance[] =>
    tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  const has = (label: string) => all(label).length > 0;
  const press = async (label: string) => {
    const found = all(label);
    if (found.length !== 1) {throw new Error(`expected one "${label}", found ${found.length}`);}
    await act(async () => {
      await found[0].props.onPress();
    });
  };
  const star = (n: Score) => press(scaleStepLabel('Rate this piece', n));
  const text = () => flatten(tree.toJSON());
  const setWears = async (wearCount: number) => {
    await act(async () => {
      tree.update(<ItemQualityCard {...props} wearCount={wearCount} />);
    });
  };
  const sheetOpen = () => tree.root.findAllByType(Modal).some(m => m.props.visible === true);
  const answer = async (buttonText: string) => {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => unknown }>;
    await act(async () => {
      await buttons.find(b => b.text === buttonText)!.onPress?.();
    });
  };
  return { tree, props, all, has, press, star, text, setWears, sheetOpen, answer };
};

describe('ItemQualityCard', () => {
  describe('with the flag off', () => {
    it('renders nothing and touches nothing', async () => {
      mockRatingsOn = false;
      const { tree } = await mount();
      expect(tree.toJSON()).toBeNull();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
      expect(loadMyItemRating).not.toHaveBeenCalled();
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
      expect(mockConsentHookCalls).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('renders nothing for a wishlist piece either, and does not report', async () => {
      mockRatingsOn = false;
      const { tree, props } = await mount({ item: makeItem({ isWishlist: true }) });
      expect(tree.toJSON()).toBeNull();
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
      expect(props.onRatingChange).not.toHaveBeenCalled();
    });

    it('stays out of the way when the flag is turned off while mounted', async () => {
      const { tree, props } = await mount();
      expect(tree.toJSON()).not.toBeNull();
      mockRatingsOn = false;
      await act(async () => {
        tree.update(<ItemQualityCard {...props} />);
      });
      expect(tree.toJSON()).toBeNull();
    });
  });

  describe('with ratings on and brand insights off', () => {
    beforeEach(() => {
      mockInsightsOn = false;
    });

    it('asks nothing about agreements and shows no brand insight words', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ contributed: true })));
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      const { text, has } = await mount();
      expect(mockConsentHookCalls).toBe(0);
      expect(text()).toContain(STATUS_PRIVATE);
      expect(text()).not.toContain(STATUS_COUNTS);
      expect(text()).toContain('Your Zara pieces: 3.8 across 4 rated');
      expect(text()).not.toContain('members say');
      expect(has('See what members say about Zara')).toBe(false);
    });

    it('still lets the person rate', async () => {
      loadMyItemRating.mockResolvedValueOnce(ok(null)).mockResolvedValue(ok(rating()));
      const { star, text } = await mount();
      await star(4);
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Your rating');
    });
  });

  describe('guest', () => {
    it('shows one quiet line and no controls', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'guest' });
      const { text, tree, all } = await mount();
      expect(text()).toBe(GUEST_LINE);
      expect(GUEST_LINE).toBe('Sign in to rate your pieces and see what members say about brands.');
      expect(all('Say more')).toHaveLength(0);
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
    });

    it('makes no network call with the real service when signed out', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      loadMyItemRating.mockImplementation(realRatingService.loadMyItemRating);
      loadMyBrandSummary.mockImplementation(realRatingService.loadMyBrandSummary);
      const { text } = await mount();
      expect(text()).toBe(GUEST_LINE);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('treats a piece with a local id as a guest piece', async () => {
      loadMyItemRating.mockImplementation(realRatingService.loadMyItemRating);
      const { text } = await mount({ item: makeItem({ id: 'local-1' }) });
      expect(text()).toBe(GUEST_LINE);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('reports no rating', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'guest' });
      const { props } = await mount();
      expect(props.onRatingChange).toHaveBeenCalledWith(false);
      expect(props.onRatingChange).not.toHaveBeenCalledWith(true);
    });
  });

  describe('wishlist piece', () => {
    const wishlist = () => makeItem({ isWishlist: true });

    it('shows only the brand line: no stars, no rating read', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      const { text, all, tree } = await mount({ item: wishlist() });
      expect(loadMyItemRating).not.toHaveBeenCalled();
      expect(text()).toContain('Your Zara pieces: 3.8 across 4 rated');
      expect(all('See what members say about Zara')).toHaveLength(1);
      expect(text()).not.toContain('How is it?');
      expect(tree.root.findAllByType(Pressable)).toHaveLength(1);
    });

    it('opens the brand report from the link', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      const { press, props } = await mount({ item: wishlist() });
      await press('See what members say about Zara');
      expect(props.onOpenBrand).toHaveBeenCalledWith('Zara');
    });

    it('still offers the link when the person has rated nothing of the brand', async () => {
      const { text, all } = await mount({ item: wishlist() });
      expect(text()).not.toContain('Your Zara pieces');
      expect(all('See what members say about Zara')).toHaveLength(1);
    });

    it('renders nothing without a brand, for a guest, or while loading', async () => {
      expect((await mount({ item: makeItem({ isWishlist: true, brand: undefined }) })).tree.toJSON()).toBeNull();
      expect((await mount({ item: makeItem({ isWishlist: true, brand: '  ' }) })).tree.toJSON()).toBeNull();

      loadMyBrandSummary.mockResolvedValue({ state: 'guest' });
      expect((await mount({ item: wishlist() })).tree.toJSON()).toBeNull();

      loadMyBrandSummary.mockReturnValue(new Promise(() => {}));
      expect((await mount({ item: wishlist() })).tree.toJSON()).toBeNull();
    });

    it('renders nothing when the server function is missing', async () => {
      loadMyBrandSummary.mockResolvedValue({ state: 'unavailable' });
      expect((await mount({ item: wishlist() })).tree.toJSON()).toBeNull();
    });

    it('has no link, and so nothing, while brand insights are off and nothing is rated', async () => {
      mockInsightsOn = false;
      expect((await mount({ item: wishlist() })).tree.toJSON()).toBeNull();
    });

    it('makes no consent request', async () => {
      await mount({ item: wishlist() });
      expect(mockConsentHookCalls).toBe(0);
    });
  });

  describe('loading', () => {
    it('shows a one-line skeleton and no stars', async () => {
      loadMyItemRating.mockReturnValue(new Promise(() => {}));
      const { tree, text } = await mount();
      expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading your rating').length).toBeGreaterThan(0);
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
      expect(text()).not.toContain(STAR_HELPER);
    });

    it('does not load a brand summary until the rating is known', async () => {
      loadMyItemRating.mockReturnValue(new Promise(() => {}));
      await mount();
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
    });
  });

  describe('unrated', () => {
    it('asks "How is it?" with five stars and says they save at once', async () => {
      const { text, all, tree } = await mount();
      expect(text()).toContain('How is it?');
      expect(text()).toContain('Tap a star. It’s saved right away.');
      expect(STAR_HELPER).toBe('Tap a star. It’s saved right away.');
      for (const n of [1, 2, 3, 4, 5]) {
        expect(all(scaleStepLabel('Rate this piece', n as Score))).toHaveLength(1);
      }
      expect(all('Edit')).toHaveLength(0);
      expect(all('Remove')).toHaveLength(0);
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('asks to read the stored rating of this piece', async () => {
      await mount();
      expect(loadMyItemRating).toHaveBeenCalledWith(ID);
    });

    it('has no adjustable element: a screen reader picks a star, one swipe cannot save a rating', async () => {
      const { tree, all } = await mount();
      expect(tree.root.findAllByType(View).filter(v => v.props.accessibilityRole === 'adjustable')).toHaveLength(0);
      expect(tree.root.findAll(n => typeof n.props.onAccessibilityAction === 'function')).toHaveLength(0);
      for (const n of [1, 2, 3, 4, 5]) {
        const [mark] = all(scaleStepLabel('Rate this piece', n as Score));
        expect(mark.props.accessibilityRole).toBe('button');
      }
    });

    it('saves nothing until a star is pressed', async () => {
      const { star } = await mount();
      expect(saveItemRating).not.toHaveBeenCalled();
      await star(2);
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating).toHaveBeenCalledWith(ID, { overall: 2, createOnly: true });
    });
  });

  describe('one tap on a star', () => {
    it('saves an overall-only, private rating with createOnly and no contribute', async () => {
      const { star } = await mount();
      await star(4);
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating).toHaveBeenCalledWith(ID, { overall: 4, createOnly: true });
      const input = saveItemRating.mock.calls[0][1];
      expect(Object.keys(input).sort()).toEqual(['createOnly', 'overall']);
      expect(input).not.toHaveProperty('contribute');
    });

    it('shows the star and its word at once, then the stored rating once it is read back', async () => {
      let finish!: (v: unknown) => void;
      saveItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const { star, text, all } = await mount();
      await star(4);
      // Optimistic: the star is filled, the word shows, the stars can't be tapped again, nothing was read yet.
      expect(text()).toContain('Good');
      expect(all(scaleStepLabel('Rate this piece', 2))).toHaveLength(0);
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);

      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 4 })));
      await act(async () => finish({ contributed: false, blocked: null, updatedAt: '' }));
      expect(loadMyItemRating).toHaveBeenCalledTimes(2);
      expect(text()).toContain('Your rating');
      expect(text()).toContain('Good');
      expect(all('Say more')).toHaveLength(1);
      expect(all('Edit')).toHaveLength(1);
    });

    it('shows what the server kept when a fuller rating already existed', async () => {
      // This screen thought it was unrated; another device had rated it 5 with details. The server changed nothing.
      loadMyItemRating
        .mockResolvedValueOnce(ok(null))
        .mockResolvedValueOnce(ok(rating({ overall: 5, touchTags: ['soft'], fit: 'true_to_size' })));
      const { star, text } = await mount();
      await star(2);
      expect(text()).toContain('Excellent');
      expect(text()).not.toContain('Fair');
      expect(text()).toContain('Hand feel Soft');
      expect(text()).toContain('Fit True to size');
    });

    it('goes back to the empty stars with the reason when the save fails', async () => {
      saveItemRating.mockRejectedValue(new Error('You’ve rated a lot today. Please come back tomorrow.'));
      const { star, text, all } = await mount();
      await star(4);
      expect(text()).toContain('You’ve rated a lot today. Please come back tomorrow.');
      expect(text()).toContain('How is it?');
      expect(text()).not.toContain('Good');
      expect(all(scaleStepLabel('Rate this piece', 4))).toHaveLength(1);
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);
    });

    it('lets the person try again after a failure', async () => {
      saveItemRating.mockRejectedValueOnce(new Error('offline'));
      const { star, text } = await mount();
      await star(3);
      expect(text()).toContain('offline');
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 3 })));
      await star(3);
      expect(saveItemRating).toHaveBeenCalledTimes(2);
      expect(text()).toContain('Your rating');
      expect(text()).not.toContain('offline');
    });

    it('falls back to a plain sentence for a failure without a message', async () => {
      saveItemRating.mockRejectedValue('boom');
      const { star, text } = await mount();
      await star(3);
      expect(text()).toContain('Couldn’t save your rating. Check your connection and try again.');
    });

    it('says so, with a retry, when the rating cannot be read back', async () => {
      loadMyItemRating.mockResolvedValueOnce(ok(null)).mockResolvedValueOnce({ state: 'offline' });
      const { star, text, press } = await mount();
      await star(5);
      expect(text()).toContain(LOAD_FAILED);
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 5 })));
      await press('Try again');
      expect(text()).toContain('Your rating');
      expect(text()).toContain('Excellent');
    });

    it('ignores a second tap while the first is saving', async () => {
      let finish!: (v: unknown) => void;
      saveItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const { star } = await mount();
      await star(4);
      await act(async () => finish({ contributed: false, blocked: null, updatedAt: '' }));
      expect(saveItemRating).toHaveBeenCalledTimes(1);
    });

    it('refreshes the brand line afterwards', async () => {
      const { star } = await mount();
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(1);
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 4 })));
      loadMyBrandSummary.mockResolvedValue(ok(summary({ itemsRated: 1, avgOverall: 4 })));
      await star(4);
      expect(loadMyBrandSummary.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('rated', () => {
    const richRating = rating({
      overall: 4,
      touchTags: ['soft'],
      fit: 'true_to_size',
      wouldBuyAgain: 'yes',
    });

    it('shows the rating, a labelled line for what was chosen, and Edit and Remove', async () => {
      loadMyItemRating.mockResolvedValue(ok(richRating));
      const { text, all } = await mount();
      expect(text()).toContain('Your rating');
      expect(text()).toContain('Overall Good');
      expect(text()).toContain('Hand feel Soft');
      expect(text()).toContain('Fit True to size');
      expect(text()).toContain('Would buy again Yes');
      expect(text()).toContain(STATUS_PRIVATE);
      expect(all('Edit')).toHaveLength(1);
      expect(all('Remove')).toHaveLength(1);
      expect(all('Say more')).toHaveLength(0);
      expect(text()).not.toContain('How is it?');
    });

    it('shows the stars filled to the rating, and saves nothing by showing them', async () => {
      loadMyItemRating.mockResolvedValue(ok(richRating));
      const { tree, all } = await mount();
      // The stars are tappable (see the quick inputs); the sheet's own scale is not there while it is closed.
      expect(all(scaleStepLabel('Rate this piece', 2))).toHaveLength(0);
      expect(all(scaleStepLabel('Your overall rating', 2))).toHaveLength(1);
      const stars = tree.root.findAll(n => (n.type as unknown) === 'Icon' && String(n.props.name).startsWith('star')).map(n => n.props.name);
      expect(stars).toEqual(['star', 'star', 'star', 'star', 'star-outline']);
      expect(saveItemRating).not.toHaveBeenCalled();
    });

    it('lists only Overall when nothing else was chosen', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { text } = await mount();
      expect(text()).toContain('Overall Good');
      expect(text()).not.toContain('Comfort');
      expect(text()).not.toContain('Holds up');
      expect(text()).not.toContain('Would buy again');
      expect(text()).toContain(STATUS_PRIVATE);
    });

    it('says a counting rating counts, once the agreement stands', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ contributed: true })));
      const { text } = await mount();
      expect(text()).toContain(STATUS_COUNTS);
      expect(text()).not.toContain(STATUS_PRIVATE);
    });

    it('says private for a counting rating whose agreement is no longer in force', async () => {
      mockConsent.granted = false;
      mockConsent.needsReconsent = true;
      loadMyItemRating.mockResolvedValue(ok(rating({ contributed: true })));
      const { text } = await mount();
      expect(text()).toContain(STATUS_PRIVATE);
      expect(text()).not.toContain(STATUS_COUNTS);
    });

    it('still says counts while the agreement is not known yet', async () => {
      mockConsent.granted = null;
      loadMyItemRating.mockResolvedValue(ok(rating({ contributed: true })));
      expect((await mount()).text()).toContain(STATUS_COUNTS);
    });

  });

  describe('Edit, Say more and the sheet', () => {
    it('opens the sheet filled in from the stored rating', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 3, note: 'Runs warm' })));
      const { press, sheetOpen, tree, text } = await mount();
      expect(sheetOpen()).toBe(false);
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      await press('Edit');
      expect(sheetOpen()).toBe(true);
      expect(text()).toContain('Rate this piece');
      expect(tree.root.findByType(TextInput).props.value).toBe('Runs warm');
      expect(text()).toContain('Okay');
    });

    it('opens it from Say more right after a one-tap rating', async () => {
      const { star, press, sheetOpen } = await mount();
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 5 })));
      await star(5);
      await press('Say more');
      expect(sheetOpen()).toBe(true);
    });

    it('stops offering Say more once it was used', async () => {
      const { star, press, has } = await mount();
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 5 })));
      await star(5);
      await press('Say more');
      expect(has('Say more')).toBe(false);
    });

    it('saves from the sheet, reads the rating again and closes', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 3 })));
      const { press, star, sheetOpen, text } = await mount({ wearCount: 5 });
      await press('Edit');
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 3, fit: 'runs_large' })));
      await press('Fit: Runs large');
      await press('Save');
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating.mock.calls[0][0]).toBe(ID);
      expect(saveItemRating.mock.calls[0][1]).toMatchObject({ overall: 3, fit: 'runs_large', contribute: false });
      expect(loadMyItemRating).toHaveBeenCalledTimes(2);
      expect(sheetOpen()).toBe(false);
      expect(text()).toContain('Runs large');
      expect(star).toBeDefined();
    });

    it('keeps the sheet open to say why a request to count was only saved privately', async () => {
      saveItemRating.mockResolvedValue({ contributed: false, blocked: 'no_consent', updatedAt: '' });
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 3 })));
      const { press, sheetOpen, tree } = await mount({ wearCount: 5 });
      await press('Edit');
      await press('Save');
      expect(flatten(tree.toJSON())).toContain('Saved privately. Agree to brand insights first to add it.');
      expect(sheetOpen()).toBe(true);
      expect(loadMyItemRating).toHaveBeenCalledTimes(2);
      await press('Done');
      expect(sheetOpen()).toBe(false);
    });

    it('closes the sheet with Cancel and saves nothing', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, sheetOpen } = await mount();
      await press('Edit');
      await press('Cancel');
      expect(sheetOpen()).toBe(false);
      expect(saveItemRating).not.toHaveBeenCalled();
    });

    it('removes the rating from the sheet and shows the empty stars', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, answer, sheetOpen, text, props } = await mount();
      await press('Edit');
      await press('Remove rating');
      await answer('Remove rating');
      expect(deleteItemRating).toHaveBeenCalledWith(ID);
      expect(sheetOpen()).toBe(false);
      expect(text()).toContain('How is it?');
      expect(props.onRatingChange).toHaveBeenLastCalledWith(false);
    });

    it('offers the sheet the agreement choice from the hook', async () => {
      mockConsent.granted = false;
      mockConsent.needsReconsent = true;
      loadMyItemRating.mockResolvedValue(ok(rating({ contributed: true })));
      const { press, has } = await mount({ wearCount: 5 });
      await press('Edit');
      expect(has('Add to brand insights...')).toBe(true);
      await press('Add to brand insights...');
      expect(mockConsent.requestConsent).toHaveBeenCalledTimes(1);
    });

    it('shows the on switch to a member whose agreement stands', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, tree } = await mount({ wearCount: 5 });
      await press('Edit');
      const switches = tree.root.findAll(
        n => n.props.accessibilityLabel === 'Count toward brand insights' && n.props.onValueChange,
      );
      expect(switches.length).toBeGreaterThan(0);
    });

    it('mounts the consent sheet inside the rating sheet, where it can be shown', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, tree } = await mount();
      const labelled = () => tree.root.findAll(n => n.props.accessibilityLabel === 'consent sheet');
      expect(labelled()).toHaveLength(0);
      await press('Edit');
      expect(labelled().length).toBeGreaterThan(0);
      const open = tree.root.findAllByType(Modal).filter(m => m.props.visible === true);
      expect(open).toHaveLength(1);
      expect(open[0].findAll(n => n.props.accessibilityLabel === 'consent sheet').length).toBeGreaterThan(0);
    });
  });

  describe('Remove', () => {
    it('asks first', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press } = await mount();
      await press('Remove');
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0];
      expect(title).toBe(REMOVE_TITLE);
      expect(title).toBe('Remove your rating?');
      expect(message).toBe(REMOVE_MESSAGE);
      expect((buttons as Array<{ text: string }>).map(b => b.text)).toEqual(['Cancel', 'Remove']);
      expect(deleteItemRating).not.toHaveBeenCalled();
    });

    it('deletes, shows the empty stars, and reports there is no rating', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, answer, text, props } = await mount();
      await press('Remove');
      await answer('Remove');
      expect(deleteItemRating).toHaveBeenCalledWith(ID);
      expect(text()).toContain('How is it?');
      expect(text()).not.toContain('Your rating');
      expect(props.onRatingChange).toHaveBeenLastCalledWith(false);
    });

    it('keeps the rating and says what happened when it fails', async () => {
      deleteItemRating.mockRejectedValue(new Error('Couldn’t remove that. Check your connection and try again.'));
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { press, answer, text, has } = await mount();
      await press('Remove');
      await answer('Remove');
      expect(text()).toContain('Couldn’t remove that.');
      expect(text()).toContain('Your rating');
      expect(has('Remove')).toBe(true);
    });
  });

  describe('offline or error', () => {
    it.each([['offline'], ['error']])('says it could not load (%s) and tries again', async state => {
      loadMyItemRating.mockResolvedValueOnce({ state, message: 'something technical' });
      const { text, press, tree } = await mount();
      expect(text()).toContain('Couldn’t load your rating.');
      expect(text()).not.toContain('something technical');
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

      loadMyItemRating.mockResolvedValue(ok(rating()));
      await press('Try again');
      expect(text()).toContain('Your rating');
    });

    it('does not report a rating while it cannot tell', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'offline' });
      const { props } = await mount();
      expect(props.onRatingChange).not.toHaveBeenCalledWith(true);
    });

    it('shows no brand line while the rating cannot be read', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'offline' });
      const { all } = await mount();
      expect(all('See what members say about Zara')).toHaveLength(0);
    });

    it('treats a read that throws like a failed read', async () => {
      loadMyItemRating.mockRejectedValue(new Error('network'));
      const { text } = await mount();
      expect(text()).toContain('Couldn’t load your rating.');
    });
  });

  describe('server function missing', () => {
    it('hides the rating part and breaks nothing', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'unavailable' });
      const { tree, props } = await mount();
      expect(tree.toJSON()).toBeNull();
      expect(props.onRatingChange).not.toHaveBeenCalledWith(true);
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
    });
  });

  describe('the brand line', () => {
    it('shows the person’s own average and count, and the link', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      const { text, all } = await mount();
      expect(loadMyBrandSummary).toHaveBeenCalledWith('Zara');
      expect(text()).toContain('Your Zara pieces: 3.8 across 4 rated');
      expect(all('See what members say about Zara')).toHaveLength(1);
    });

    it('opens the brand report from the link', async () => {
      const { press, props } = await mount();
      await press('See what members say about Zara');
      expect(props.onOpenBrand).toHaveBeenCalledWith('Zara');
    });

    it('shows no average when nothing of the brand is rated, but keeps the link', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ itemsRated: 0, avgOverall: null })));
      const { text, has } = await mount();
      expect(text()).not.toContain('Your Zara pieces');
      expect(has('See what members say about Zara')).toBe(true);
    });

    it('is silent when it cannot be read, and keeps the link', async () => {
      loadMyBrandSummary.mockResolvedValue({ state: 'offline' });
      const { text, has } = await mount();
      expect(text()).not.toContain('Your Zara pieces');
      expect(has('See what members say about Zara')).toBe(true);
    });

    it('is silent when the read throws', async () => {
      loadMyBrandSummary.mockRejectedValue(new Error('network'));
      const { text } = await mount();
      expect(text()).not.toContain('Your Zara pieces');
    });

    it('is left out for a piece with no brand', async () => {
      const { text, all } = await mount({ item: makeItem({ brand: undefined }) });
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
      expect(text()).not.toContain('members say');
      expect(all('See what members say about Zara')).toHaveLength(0);
    });

    it('trims the brand it shows and looks up', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      const { text } = await mount({ item: makeItem({ brand: '  Zara  ' }) });
      expect(loadMyBrandSummary).toHaveBeenCalledWith('Zara');
      expect(text()).toContain('Your Zara pieces: 3.8 across 4 rated');
    });
  });

  describe('the nudge (3.7)', () => {
    it('shows nothing on opening a piece already worn 3 or 10 times', async () => {
      expect((await mount({ wearCount: 3 })).text()).not.toContain('Worn 3 times');
      loadMyItemRating.mockResolvedValue(ok(rating()));
      expect((await mount({ wearCount: 10 })).text()).not.toContain('Worn 10 times');
    });

    it('shows "Worn 3 times" when the count becomes 3 and there is no rating', async () => {
      const { setWears, text, all } = await mount({ wearCount: 2 });
      await setWears(3);
      expect(text()).toContain(NUDGE_THREE);
      expect(NUDGE_THREE).toBe('Worn 3 times. How is it holding up?');
      expect(all('Rate it')).toHaveLength(1);
      expect(all('Not now')).toHaveLength(1);
    });

    it('shows "Worn 10 times" when the count becomes 10 and the rating has no holding-up answer', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ holdsUp: null })));
      const { setWears, text } = await mount({ wearCount: 9 });
      await setWears(10);
      expect(text()).toContain(NUDGE_TEN);
      expect(NUDGE_TEN).toBe('Worn 10 times. Still holding up?');
    });

    it('does not nudge at 10 when holding up was already answered, or when unrated', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ holdsUp: 4 })));
      const answered = await mount({ wearCount: 9 });
      await answered.setWears(10);
      expect(answered.text()).not.toContain('Worn 10 times');

      loadMyItemRating.mockResolvedValue(ok(null));
      const unrated = await mount({ wearCount: 9 });
      await unrated.setWears(10);
      expect(unrated.text()).not.toContain('Worn 10 times');
    });

    it('does not nudge at 3 when there is a rating already', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { setWears, text } = await mount({ wearCount: 2 });
      await setWears(3);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('does not nudge on a jump that is not a single wear', async () => {
      const { setWears, text } = await mount({ wearCount: 1 });
      await setWears(3);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('does not nudge at other counts', async () => {
      const { setWears, text } = await mount({ wearCount: 3 });
      await setWears(4);
      expect(text()).not.toContain('Worn');
    });

    it('goes away when the wear is undone', async () => {
      const { setWears, text } = await mount({ wearCount: 2 });
      await setWears(3);
      expect(text()).toContain(NUDGE_THREE);
      await setWears(2);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('goes away on any other change of the count', async () => {
      const { setWears, text } = await mount({ wearCount: 2 });
      await setWears(3);
      await setWears(4);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('goes away with Not now, and is not stored anywhere', async () => {
      const { setWears, press, text } = await mount({ wearCount: 2 });
      await setWears(3);
      await press('Not now');
      expect(text()).not.toContain('Worn 3 times');
      expect(text()).toContain('How is it?');
    });

    it('opens the sheet with Rate it and goes away', async () => {
      const { setWears, press, text, sheetOpen } = await mount({ wearCount: 2 });
      await setWears(3);
      await press('Rate it');
      expect(sheetOpen()).toBe(true);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('opens the sheet on the stored rating from the 10-wear nudge, with holding up offered', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ overall: 4 })));
      const { setWears, press, text } = await mount({ wearCount: 9 });
      await setWears(10);
      await press('Rate it');
      expect(text()).toContain('How it’s holding up');
      expect(text()).toContain('Good');
    });

    it('goes away when the person taps a star instead', async () => {
      const { setWears, star, text } = await mount({ wearCount: 2 });
      await setWears(3);
      await star(4);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('does not show while the rating is still loading', async () => {
      loadMyItemRating.mockReturnValue(new Promise(() => {}));
      const { setWears, text } = await mount({ wearCount: 2 });
      await setWears(3);
      expect(text()).not.toContain('Worn 3 times');
    });

    it('can come back at 10 after being dismissed at 3', async () => {
      const { setWears, press, text, star } = await mount({ wearCount: 2 });
      await setWears(3);
      await press('Not now');
      loadMyItemRating.mockResolvedValue(ok(rating({ holdsUp: null })));
      await star(4);
      await setWears(9);
      await setWears(10);
      expect(text()).toContain(NUDGE_TEN);
    });
  });

  describe('onRatingChange', () => {
    it('reports whether a rating exists as that changes', async () => {
      const { star, props, press, answer } = await mount();
      expect(props.onRatingChange).toHaveBeenLastCalledWith(false);

      loadMyItemRating.mockResolvedValue(ok(rating()));
      await star(4);
      expect(props.onRatingChange).toHaveBeenLastCalledWith(true);

      await press('Remove');
      await answer('Remove');
      expect(props.onRatingChange).toHaveBeenLastCalledWith(false);
    });

    it('reports true when the piece is already rated', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { props } = await mount();
      expect(props.onRatingChange).toHaveBeenLastCalledWith(true);
    });

    it('reports only when the answer changes', async () => {
      const { props, star } = await mount();
      const before = (props.onRatingChange as jest.Mock).mock.calls.length;
      saveItemRating.mockRejectedValue(new Error('no'));
      await star(3);
      expect((props.onRatingChange as jest.Mock).mock.calls.length).toBe(before);
    });

    it('is optional', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      await expect(mount({ onRatingChange: undefined })).resolves.toBeDefined();
    });
  });

  describe('idle', () => {
    it('renders no text field in any state', async () => {
      const unrated = await mount();
      expect(unrated.tree.root.findAllByType(TextInput)).toHaveLength(0);

      loadMyItemRating.mockResolvedValue(ok(rating({ note: 'private words' })));
      const rated = await mount();
      expect(rated.tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(rated.text()).not.toContain('private words');

      const nudged = await mount({ wearCount: 2 });
      await nudged.setWears(3);
      expect(nudged.tree.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('never logs an error, even when everything fails', async () => {
      loadMyItemRating.mockRejectedValue(new Error('x'));
      loadMyBrandSummary.mockRejectedValue(new Error('y'));
      await mount();
      await mount({ item: makeItem({ isWishlist: true }) });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('survives being unmounted before anything resolves', async () => {
      let finish!: (v: unknown) => void;
      loadMyItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const { tree } = await mount();
      act(() => tree.unmount());
      trees.pop();
      await act(async () => finish(ok(rating())));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('reads again for another piece', async () => {
      const { tree, props } = await mount();
      await act(async () => {
        tree.update(<ItemQualityCard {...props} item={makeItem({ id: '11111111-2222-4333-8444-555555555555' })} />);
      });
      expect(loadMyItemRating).toHaveBeenLastCalledWith('11111111-2222-4333-8444-555555555555');
    });
  });

  describe('words on screen', () => {
    it('never starts with "From " or uses the strings the Item Details tests forbid', async () => {
      const states: Array<() => Promise<{ tree: renderer.ReactTestRenderer }>> = [
        () => mount(),
        async () => {
          loadMyItemRating.mockResolvedValue(ok(rating({ touchTags: ['soft'], fit: 'runs_small', wouldBuyAgain: 'yes', contributed: true })));
          return mount();
        },
        async () => {
          loadMyItemRating.mockResolvedValue({ state: 'guest' });
          return mount();
        },
        async () => {
          loadMyItemRating.mockResolvedValue({ state: 'offline' });
          return mount();
        },
      ];
      for (const build of states) {
        const { tree } = await build();
        for (const t of tree.root.findAllByType(Text)) {
          const s = flatten(t.props.children).trim();
          expect(s.startsWith('From ')).toBe(false);
          expect(s).not.toContain('Brand:');
          expect(s).not.toContain('Color: ');
          expect(s).not.toContain('Material: ');
        }
      }
    });

    it('labels every button', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating()));
      const { tree, setWears } = await mount({ wearCount: 9 });
      await setWears(10);
      for (const node of tree.root.findAllByType(Pressable)) {
        expect(typeof node.props.accessibilityLabel).toBe('string');
        expect(node.props.accessibilityLabel.length).toBeGreaterThan(0);
      }
    });
  });
});
