/**
 * ItemQualityCard, brand rating: any piece with a brand gets "Rate <Brand>" (or the person's stored stars with
 * Edit), whether or not brand insights are on. The sheet saves privately when there is no agreement to ask for,
 * and the brand badge at the top of the screen reaches the same sheet through the opener the card hands over.
 */
import 'react-native';
import React from 'react';
import { Alert, Modal, Platform, Pressable, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

let mockInsightsOn = false;
jest.mock('../../src/config/ratingFlags', () => ({
  RATINGS_ENABLED: true,
  get BRAND_INSIGHTS_ENABLED() {
    return mockInsightsOn;
  },
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => true,
  brandInsightsActive: () => mockInsightsOn,
  tagScanActive: () => false,
}));

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));

jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  saveItemRating: jest.fn(),
  deleteItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
  saveBrandRating: jest.fn(),
  deleteBrandRating: jest.fn(),
}));

let mockConsent: any;
let mockConsentHookCalls = 0;
jest.mock('../../src/components/RatingConsentSheet', () => ({
  useRatingConsent: () => {
    mockConsentHookCalls += 1;
    return mockConsent;
  },
}));

import ItemQualityCard, { type ItemQualityCardProps } from '../../src/components/ItemQualityCard';
import { BRAND_PROMPT_HELPER, brandDetailLine } from '../../src/components/BrandRatingRow';
import { scaleStepLabel } from '../../src/components/RatingScale';
import type { Score } from '../../src/config/ratingVocabulary';
import * as ratingService from '../../src/services/ratingService';
import type { ClothingItem } from '../../src/types';
import type { BrandRating, ItemRating, Loaded, MyBrandSummary } from '../../src/types/rating';

const loadMyItemRating = ratingService.loadMyItemRating as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;
const saveBrandRating = ratingService.saveBrandRating as jest.Mock;
const deleteBrandRating = ratingService.deleteBrandRating as jest.Mock;

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

const itemRating: ItemRating = {
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
};

const stored = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Zara',
  overall: 4,
  quality: 3,
  fitConsistency: null,
  value: 5,
  contributed: false,
  updatedAt: '2026-10-14T10:00:00Z',
  ...over,
});

const ok = <T,>(value: T): Loaded<T> => ({ state: 'ok', value });
const summary = (over: Partial<MyBrandSummary> = {}): MyBrandSummary => ({
  itemsRated: 0,
  avgOverall: null,
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
  mockInsightsOn = false;
  mockConsentHookCalls = 0;
  loadMyItemRating.mockReset().mockResolvedValue(ok(null));
  loadMyBrandSummary.mockReset().mockResolvedValue(ok(summary()));
  saveBrandRating.mockReset().mockResolvedValue({ contributed: false, blocked: null });
  deleteBrandRating.mockReset().mockResolvedValue(undefined);
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
    if (found.length !== 1) {
      throw new Error(`expected one "${label}", found ${found.length}`);
    }
    await act(async () => {
      await found[0].props.onPress();
    });
  };
  const text = () => flatten(tree.toJSON());
  const sheetOpen = () => tree.root.findAllByType(Modal).some(m => m.props.visible === true);
  const brandStar = (n: Score) => press(scaleStepLabel('Overall rating', n));
  const answer = async (buttonText: string) => {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => unknown }>;
    await act(async () => {
      await buttons.find(b => b.text === buttonText)!.onPress?.();
    });
  };
  return { tree, props, all, has, press, text, sheetOpen, brandStar, answer };
};

describe('ItemQualityCard brand rating', () => {
  describe('with brand insights off', () => {
    it('offers "Rate Zara" with no request about agreements and no members’ words', async () => {
      const { has, text } = await mount();
      expect(has('Rate Zara')).toBe(true);
      expect(text()).toContain(BRAND_PROMPT_HELPER);
      expect(BRAND_PROMPT_HELPER).toBe('One rating for the whole brand.');
      expect(mockConsentHookCalls).toBe(0);
      expect(text()).not.toContain('members say');
    });

    it('is a button with a name that says what it does', async () => {
      const { all } = await mount();
      expect(all('Rate Zara')[0].props.accessibilityRole).toBe('button');
    });

    it('shows it for a piece that is already rated, too', async () => {
      loadMyItemRating.mockResolvedValue(ok(itemRating));
      const { has, text } = await mount();
      expect(text()).toContain('Your rating');
      expect(has('Rate Zara')).toBe(true);
    });

    it('opens the brand sheet, empty, and nothing is saved by opening it', async () => {
      const { press, sheetOpen, all } = await mount();
      expect(sheetOpen()).toBe(false);
      await press('Rate Zara');
      expect(sheetOpen()).toBe(true);
      expect(all(scaleStepLabel('Overall rating', 4))).toHaveLength(1);
      expect(saveBrandRating).not.toHaveBeenCalled();
    });

    it('saves privately, closes, and then shows the stored stars with Edit', async () => {
      const { press, brandStar, sheetOpen, text, has } = await mount();
      await press('Rate Zara');
      await brandStar(4);
      loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: stored({ overall: 4, quality: null, value: null }) })));
      await press('Save');
      expect(saveBrandRating).toHaveBeenCalledTimes(1);
      // No agreement to offer, so no choice about counting is sent: the server keeps the rating private.
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', { overall: 4, quality: null, fitConsistency: null, value: null });
      expect(sheetOpen()).toBe(false);
      expect(text()).toContain('Your Zara rating');
      expect(text()).toContain('Private to you');
      expect(has('Edit your rating of Zara')).toBe(true);
      expect(has('Rate Zara')).toBe(false);
    });

    it('shows a stored brand rating with the scores that were given', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: stored() })));
      const { text, has } = await mount();
      expect(text()).toContain('Your Zara rating');
      expect(text()).toContain('Quality 3 · Value 5');
      expect(has('Rate Zara')).toBe(false);
      expect(has('Edit your rating of Zara')).toBe(true);
    });

    it('describes the scores in a short line', () => {
      expect(brandDetailLine(stored({ quality: 2, fitConsistency: 4, value: 5 }))).toBe('Quality 2 · Size consistency 4 · Value 5');
      expect(brandDetailLine(stored({ quality: null, fitConsistency: null, value: null }))).toBe('');
    });

    it('opens Edit filled in from the stored rating, with a way to remove it', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: stored({ overall: 3 }) })));
      const { press, sheetOpen, has } = await mount();
      await press('Edit your rating of Zara');
      expect(sheetOpen()).toBe(true);
      expect(has('Remove rating')).toBe(true);
    });

    it('removes the rating and offers "Rate Zara" again', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: stored() })));
      const { press, answer, has, sheetOpen } = await mount();
      await press('Edit your rating of Zara');
      loadMyBrandSummary.mockResolvedValue(ok(summary()));
      await press('Remove rating');
      await answer('Remove');
      expect(deleteBrandRating).toHaveBeenCalledWith('Zara');
      expect(sheetOpen()).toBe(false);
      expect(has('Rate Zara')).toBe(true);
    });

    it('says why when the server kept the rating private', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'not_worn' });
      const { press, brandStar, text } = await mount();
      await press('Rate Zara');
      await brandStar(5);
      await press('Save');
      expect(text()).toContain('Saved privately. Brand insights count brands you have worn something from.');
    });

    it('keeps the sheet open with the reason when the save fails', async () => {
      saveBrandRating.mockRejectedValue(new Error('offline'));
      const { press, brandStar, sheetOpen, text } = await mount();
      await press('Rate Zara');
      await brandStar(5);
      await press('Save');
      expect(sheetOpen()).toBe(true);
      expect(text()).toContain('offline');
    });

    it('trims the brand it shows and rates', async () => {
      const { has, press, brandStar } = await mount({ item: makeItem({ brand: '  Zara  ' }) });
      expect(has('Rate Zara')).toBe(true);
      await press('Rate Zara');
      await brandStar(2);
      await press('Save');
      expect(saveBrandRating.mock.calls[0][0]).toBe('Zara');
    });
  });

  describe('when it is not offered', () => {
    it('is left out when the person cannot rate that brand and has not rated it', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ canRateBrand: false })));
      const { has, sheetOpen } = await mount();
      expect(has('Rate Zara')).toBe(false);
      expect(sheetOpen()).toBe(false);
    });

    it('is offered to edit a brand rating the server will no longer let them start', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ canRateBrand: false, brandRating: stored() })));
      expect((await mount()).has('Edit your rating of Zara')).toBe(true);
    });

    it('is left out for a piece with no brand', async () => {
      const { text } = await mount({ item: makeItem({ brand: undefined }) });
      expect(text()).not.toContain('Rate ');
      expect(loadMyBrandSummary).not.toHaveBeenCalled();
    });

    it('is left out for a guest, and for a wishlist piece', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'guest' });
      expect((await mount()).has('Rate Zara')).toBe(false);

      loadMyItemRating.mockResolvedValue(ok(null));
      expect((await mount({ item: makeItem({ isWishlist: true }) })).has('Rate Zara')).toBe(false);
    });

    it('is left out while the brand cannot be read, or the server cannot take it', async () => {
      loadMyBrandSummary.mockResolvedValue({ state: 'offline' });
      expect((await mount()).has('Rate Zara')).toBe(false);
      loadMyBrandSummary.mockResolvedValue({ state: 'unavailable' });
      expect((await mount()).has('Rate Zara')).toBe(false);
      loadMyBrandSummary.mockRejectedValue(new Error('network'));
      expect((await mount()).has('Rate Zara')).toBe(false);
    });

    it('is left out while the piece’s own rating could not be read', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'offline' });
      expect((await mount()).has('Rate Zara')).toBe(false);
    });
  });

  describe('the opener for the brand badge', () => {
    it('is handed over while the brand can be rated, and opens the same sheet', async () => {
      const onBrandRatingOpener = jest.fn();
      const { sheetOpen } = await mount({ onBrandRatingOpener });
      const opener = onBrandRatingOpener.mock.calls.map(call => call[0]).filter(Boolean).pop();
      expect(typeof opener).toBe('function');
      await act(async () => opener());
      expect(sheetOpen()).toBe(true);
    });

    it('is never handed over when the brand cannot be rated', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ canRateBrand: false })));
      const onBrandRatingOpener = jest.fn();
      await mount({ onBrandRatingOpener });
      expect(onBrandRatingOpener.mock.calls.filter(call => call[0] !== null)).toHaveLength(0);
    });

    it('is taken back when the card goes away', async () => {
      const onBrandRatingOpener = jest.fn();
      const { tree } = await mount({ onBrandRatingOpener });
      expect(onBrandRatingOpener).toHaveBeenLastCalledWith(expect.any(Function));
      act(() => tree.unmount());
      trees.splice(trees.indexOf(tree), 1);
      expect(onBrandRatingOpener).toHaveBeenLastCalledWith(null);
    });

    it('is not handed over for a guest or a wishlist piece', async () => {
      const guestOpener = jest.fn();
      loadMyItemRating.mockResolvedValue({ state: 'guest' });
      await mount({ onBrandRatingOpener: guestOpener });
      expect(guestOpener.mock.calls.filter(call => call[0] !== null)).toHaveLength(0);

      const wishlistOpener = jest.fn();
      loadMyItemRating.mockResolvedValue(ok(null));
      await mount({ item: makeItem({ isWishlist: true }), onBrandRatingOpener: wishlistOpener });
      expect(wishlistOpener).not.toHaveBeenCalled();
    });
  });

  describe('with brand insights on', () => {
    beforeEach(() => {
      mockInsightsOn = true;
    });

    it('keeps the report link and adds the rating next to it', async () => {
      const { has } = await mount();
      expect(has('Rate Zara')).toBe(true);
      expect(has('See what members say about Zara')).toBe(true);
      expect(mockConsentHookCalls).toBeGreaterThan(0);
    });

    it('mounts the agreement sheet only while the brand sheet is open', async () => {
      const { press, tree } = await mount();
      const consentSheets = () => tree.root.findAll(n => n.props.accessibilityLabel === 'consent sheet');
      expect(consentSheets()).toHaveLength(0);
      await press('Rate Zara');
      expect(consentSheets().length).toBeGreaterThan(0);
    });

    it('offers to add the rating to brand insights when the person has not agreed yet', async () => {
      // On iOS the brand sheet waits for itself to leave before the agreement comes up; Android asks at once.
      const realOS = Platform.OS;
      Platform.OS = 'android';
      try {
        mockConsent.granted = false;
        const { press, has } = await mount();
        await press('Rate Zara');
        expect(has('Add to brand insights')).toBe(true);
        await press('Add to brand insights');
        expect(mockConsent.requestConsent).toHaveBeenCalledTimes(1);
      } finally {
        Platform.OS = realOS;
      }
    });

    it('reads the agreement again when the server says it was not in force', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'no_consent' });
      const { press, brandStar, text } = await mount();
      await press('Rate Zara');
      await brandStar(4);
      await press('Save');
      expect(mockConsent.refresh).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Saved privately. Agree to brand insights first to add it.');
    });

    it('says a rating that counts counts, once the agreement stands', async () => {
      loadMyBrandSummary.mockResolvedValue(ok(summary({ brandRating: stored({ contributed: true }) })));
      expect((await mount()).text()).toContain('Counts toward brand insights');

      mockConsent.granted = false;
      const lapsed = await mount();
      expect(lapsed.text()).not.toContain('Counts toward brand insights');
    });
  });
});
