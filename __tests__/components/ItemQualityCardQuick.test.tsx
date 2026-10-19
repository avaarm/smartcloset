/**
 * ItemQualityCard, quick inputs: the rating questions ("Hand feel", "How it wears", "Fit") are on the card
 * itself, with nothing to open. On a rated piece a tap saves at once by sending the stored rating again with that
 * one change; on an unrated one the words wait for a star, because a word alone is not a rating.
 */
import 'react-native';
import React from 'react';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../../src/config/ratingFlags', () => ({
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: false,
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => true,
  brandInsightsActive: () => false,
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

import ItemQualityCard, {
  STAR_HELPER,
  WORDS_SAVED_HELPER,
  WORDS_WAIT_HELPER,
  type ItemQualityCardProps,
} from '../../src/components/ItemQualityCard';
import { CHIP_LIMIT_HINT } from '../../src/components/RatingChips';
import { scaleStepLabel } from '../../src/components/RatingScale';
import { COMFORT_TAGS, FIT_VERDICTS, TAG_LABELS, TOUCH_TAGS, type Score } from '../../src/config/ratingVocabulary';
import * as ratingService from '../../src/services/ratingService';
import type { ClothingItem } from '../../src/types';
import type { ItemRating, Loaded, MyBrandSummary } from '../../src/types/rating';

const loadMyItemRating = ratingService.loadMyItemRating as jest.Mock;
const saveItemRating = ratingService.saveItemRating as jest.Mock;
const deleteItemRating = ratingService.deleteItemRating as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;

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

const FULL = rating({
  overall: 4,
  touch: 4,
  touchTags: ['soft'],
  comfort: 3,
  comfortTags: ['cozy'],
  holdsUp: 5,
  holdsUpTags: ['washes_well'],
  fit: 'true_to_size',
  wouldBuyAgain: 'yes',
  note: 'Runs warm',
});

const ok = <T,>(value: T): Loaded<T> => ({ state: 'ok', value });
const noBrandRating = (): MyBrandSummary => ({ itemsRated: 0, avgOverall: null, brandRating: null, canRateBrand: false });

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
const trees: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  loadMyItemRating.mockReset().mockResolvedValue(ok(null));
  saveItemRating.mockReset().mockResolvedValue({ contributed: false, blocked: null, updatedAt: '' });
  deleteItemRating.mockReset().mockResolvedValue(undefined);
  loadMyBrandSummary.mockReset().mockResolvedValue(ok(noBrandRating()));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
  const one = (label: string): ReactTestInstance => {
    const found = all(label);
    if (found.length !== 1) {
      throw new Error(`expected one "${label}", found ${found.length}`);
    }
    return found[0];
  };
  const press = async (label: string) => {
    const target = one(label);
    await act(async () => {
      await target.props.onPress();
    });
  };
  const selected = (label: string): boolean => !!one(label).props.accessibilityState.selected;
  const disabled = (label: string): boolean => !!one(label).props.accessibilityState.disabled;
  const text = () => flatten(tree.toJSON());
  const rerender = async (next: Partial<ItemQualityCardProps>) => {
    Object.assign(props, next);
    await act(async () => {
      tree.update(<ItemQualityCard {...props} />);
    });
  };
  const settle = () =>
    act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
  const sheetOpen = () => tree.root.findAllByType(Modal).some(m => m.props.visible === true);
  return { tree, props, all, one, press, selected, disabled, text, rerender, settle, sheetOpen };
};

const touch = (tag: (typeof TOUCH_TAGS)[number]) => `Rate hand feel: ${TAG_LABELS[tag]}`;
const comfort = (tag: (typeof COMFORT_TAGS)[number]) => `Rate how it wears: ${TAG_LABELS[tag]}`;
const fit = (label: string) => `Rate fit: ${label}`;
const star = (n: Score) => scaleStepLabel('Rate this piece', n);
const overallStar = (n: Score) => scaleStepLabel('Your overall rating', n);

describe('ItemQualityCard quick inputs', () => {
  describe('on a piece that is not rated yet', () => {
    it('shows every question on the card with nothing to open', async () => {
      const { all, text, sheetOpen } = await mount();
      expect(text()).toContain('Hand feel');
      expect(text()).toContain('How it wears');
      expect(text()).toContain('Fit');
      for (const tag of TOUCH_TAGS) {
        expect(all(touch(tag))).toHaveLength(1);
      }
      for (const tag of COMFORT_TAGS) {
        expect(all(comfort(tag))).toHaveLength(1);
      }
      for (const [verdict, label] of [['runs_small', 'Runs small'], ['true_to_size', 'True to size'], ['runs_large', 'Runs large']] as const) {
        expect(FIT_VERDICTS).toContain(verdict);
        expect(all(fit(label))).toHaveLength(1);
      }
      expect(sheetOpen()).toBe(false);
      expect(saveItemRating).not.toHaveBeenCalled();
    });

    it('gives every chip a button role, a name of its own and a selected state', async () => {
      const { one } = await mount();
      const chip = one(touch('soft'));
      expect(chip.props.accessibilityRole).toBe('button');
      expect(chip.props.accessibilityState).toEqual({ selected: false, disabled: false });
    });

    it('holds a word tapped before a star: nothing is saved, and the helper says it waits', async () => {
      const { press, selected, text } = await mount();
      expect(text()).toContain(STAR_HELPER);
      await press(touch('soft'));
      expect(saveItemRating).not.toHaveBeenCalled();
      expect(selected(touch('soft'))).toBe(true);
      expect(text()).toContain(WORDS_WAIT_HELPER);
      expect(WORDS_WAIT_HELPER).toBe('Pick a star to save the words you chose.');
      expect(text()).not.toContain(STAR_HELPER);
    });

    it('takes a held word back with a second tap', async () => {
      const { press, selected, text } = await mount();
      await press(touch('soft'));
      await press(touch('soft'));
      expect(selected(touch('soft'))).toBe(false);
      expect(text()).toContain(STAR_HELPER);
    });

    it('saves the held words together with the star that is tapped next', async () => {
      const { press, selected } = await mount();
      await press(touch('soft'));
      await press(touch('silky'));
      await press(comfort('cozy'));
      await press(fit('True to size'));
      loadMyItemRating.mockResolvedValue(
        ok(rating({ overall: 4, touchTags: ['soft', 'silky'], comfortTags: ['cozy'], fit: 'true_to_size' })),
      );
      await press(star(4));
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating).toHaveBeenCalledWith(ID, {
        overall: 4,
        createOnly: true,
        touchTags: ['soft', 'silky'],
        comfortTags: ['cozy'],
        fit: 'true_to_size',
      });
      // Now stored: the chips show what the server has.
      expect(selected(touch('soft'))).toBe(true);
      expect(selected(fit('True to size'))).toBe(true);
    });

    it('never makes a rating out of words alone', async () => {
      const { press } = await mount();
      await press(touch('soft'));
      await press(comfort('warm'));
      await press(fit('Runs small'));
      expect(saveItemRating).not.toHaveBeenCalled();
    });

    it('holds at most four words per question and dims the rest', async () => {
      const { press, disabled, selected, text } = await mount();
      for (const tag of ['soft', 'silky', 'buttery', 'smooth'] as const) {
        await press(touch(tag));
      }
      expect(text()).toContain(CHIP_LIMIT_HINT);
      expect(disabled(touch('crisp'))).toBe(true);
      expect(disabled(touch('soft'))).toBe(false);
      expect(disabled(comfort('warm'))).toBe(false);
      // A chosen word can be taken back to make room.
      await press(touch('soft'));
      expect(disabled(touch('crisp'))).toBe(false);
      expect(selected(touch('soft'))).toBe(false);
    });

    it('treats fit as one choice: another answer replaces it', async () => {
      const { press, selected } = await mount();
      await press(fit('Runs small'));
      await press(fit('Runs large'));
      expect(selected(fit('Runs small'))).toBe(false);
      expect(selected(fit('Runs large'))).toBe(true);
    });

    it('keeps the held words when the star cannot be saved, and says why', async () => {
      saveItemRating.mockRejectedValue(new Error('offline'));
      const { press, selected, text } = await mount();
      await press(touch('soft'));
      await press(star(3));
      expect(text()).toContain('offline');
      expect(selected(touch('soft'))).toBe(true);
    });

    it('opens the full sheet from Say more', async () => {
      const { press, sheetOpen } = await mount();
      await press('Say more');
      expect(sheetOpen()).toBe(true);
    });
  });

  describe('on a rated piece', () => {
    beforeEach(() => {
      loadMyItemRating.mockResolvedValue(ok(FULL));
    });

    it('lights the words that were chosen and says a tap is saved right away', async () => {
      const { selected, text } = await mount();
      expect(selected(touch('soft'))).toBe(true);
      expect(selected(touch('silky'))).toBe(false);
      expect(selected(comfort('cozy'))).toBe(true);
      expect(selected(fit('True to size'))).toBe(true);
      expect(text()).toContain(WORDS_SAVED_HELPER);
      expect(text()).not.toContain(STAR_HELPER);
    });

    it('saves the whole stored rating again with the one word changed, and no choice about counting', async () => {
      const { press } = await mount();
      await press(touch('silky'));
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      const [id, input] = saveItemRating.mock.calls[0];
      expect(id).toBe(ID);
      expect(input).toEqual({
        overall: 4,
        touch: 4,
        touchTags: ['soft', 'silky'],
        comfort: 3,
        comfortTags: ['cozy'],
        holdsUp: 5,
        holdsUpTags: ['washes_well'],
        fit: 'true_to_size',
        wouldBuyAgain: 'yes',
        note: 'Runs warm',
      });
      expect(input).not.toHaveProperty('contribute');
      expect(input).not.toHaveProperty('createOnly');
    });

    it('shows the tap at once and reads the rating back afterwards', async () => {
      let finish!: (v: unknown) => void;
      saveItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const { press, selected, text } = await mount();
      await press(touch('silky'));
      expect(selected(touch('silky'))).toBe(true);
      expect(text()).toContain('Hand feel Soft, Silky');
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);

      loadMyItemRating.mockResolvedValue(ok(rating({ ...FULL, touchTags: ['soft', 'silky'] })));
      await act(async () => finish({ contributed: false, blocked: null, updatedAt: '' }));
      expect(loadMyItemRating).toHaveBeenCalledTimes(2);
      expect(selected(touch('silky'))).toBe(true);
    });

    it('removes a chosen word when it is tapped again', async () => {
      const { press } = await mount();
      await press(touch('soft'));
      expect(saveItemRating.mock.calls[0][1].touchTags).toEqual([]);
    });

    it('swaps fit for another answer, and clears it when the lit one is tapped', async () => {
      const { press } = await mount();
      await press(fit('Runs small'));
      expect(saveItemRating.mock.calls[0][1].fit).toBe('runs_small');
      await press(fit('True to size'));
      expect(saveItemRating.mock.calls[1][1].fit).toBeNull();
    });

    it('changes the overall with a tap on a star and keeps every word', async () => {
      const { press } = await mount();
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(1);
      await press(overallStar(5));
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(saveItemRating.mock.calls[0][1]).toMatchObject({ overall: 5, touchTags: ['soft'], fit: 'true_to_size', note: 'Runs warm' });
      // The average of the brand's rated pieces moved, so it is read again.
      expect(loadMyBrandSummary.mock.calls.length).toBeGreaterThan(1);
    });

    it('does not read the brand again for a change of words', async () => {
      const { press } = await mount();
      await press(touch('silky'));
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(1);
    });

    it('sends taps made during a save as one more save, so none is lost', async () => {
      let finishFirst!: (v: unknown) => void;
      saveItemRating
        .mockReturnValueOnce(new Promise(resolve => (finishFirst = resolve)))
        .mockResolvedValue({ contributed: false, blocked: null, updatedAt: '' });
      const { press, selected, settle } = await mount();
      await press(touch('silky'));
      await press(comfort('warm'));
      await press(comfort('breathable'));
      // All three show, though only the first has been sent.
      expect(saveItemRating).toHaveBeenCalledTimes(1);
      expect(selected(comfort('warm'))).toBe(true);
      expect(selected(comfort('breathable'))).toBe(true);

      await act(async () => finishFirst({ contributed: false, blocked: null, updatedAt: '' }));
      await settle();
      expect(saveItemRating).toHaveBeenCalledTimes(2);
      expect(saveItemRating.mock.calls[1][1]).toMatchObject({
        touchTags: ['soft', 'silky'],
        comfortTags: ['cozy', 'warm', 'breathable'],
        note: 'Runs warm',
      });
    });

    it('puts a change back and says why when it cannot be saved', async () => {
      saveItemRating.mockRejectedValue(new Error('You’ve rated a lot today. Please come back tomorrow.'));
      const { press, selected, text } = await mount();
      await press(touch('silky'));
      expect(text()).toContain('You’ve rated a lot today. Please come back tomorrow.');
      expect(selected(touch('silky'))).toBe(false);
      expect(selected(touch('soft'))).toBe(true);
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);
    });

    it('can be changed again after a failure', async () => {
      saveItemRating.mockRejectedValueOnce(new Error('offline'));
      const { press, text } = await mount();
      await press(touch('silky'));
      expect(text()).toContain('offline');
      await press(touch('silky'));
      expect(saveItemRating).toHaveBeenCalledTimes(2);
      expect(text()).not.toContain('offline');
    });

    it('holds the Edit and Remove buttons back while a change is being saved', async () => {
      let finish!: (v: unknown) => void;
      saveItemRating.mockReturnValue(new Promise(resolve => (finish = resolve)));
      const { press, one } = await mount();
      await press(touch('silky'));
      expect(one('Edit').props.disabled).toBe(true);
      expect(one('Remove').props.disabled).toBe(true);
      await act(async () => finish({ contributed: false, blocked: null, updatedAt: '' }));
      expect(one('Edit').props.disabled).toBeFalsy();
    });

    it('dims the other words once four are chosen', async () => {
      loadMyItemRating.mockResolvedValue(ok(rating({ touchTags: ['soft', 'silky', 'buttery', 'smooth'] })));
      const { disabled, text } = await mount();
      expect(disabled(touch('crisp'))).toBe(true);
      expect(disabled(touch('soft'))).toBe(false);
      expect(text()).toContain(CHIP_LIMIT_HINT);
    });

    it('still opens the full sheet from Edit', async () => {
      const { press, sheetOpen } = await mount();
      await press('Edit');
      expect(sheetOpen()).toBe(true);
    });

    it('keeps tapping from changing anything while the rating is being removed', async () => {
      let finish!: () => void;
      deleteItemRating.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
      const { press, one, settle } = await mount();
      await press('Remove');
      const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
      await act(async () => {
        buttons.find((b: { text: string }) => b.text === 'Remove').onPress();
      });
      await act(async () => {
        await one(touch('silky')).props.onPress();
      });
      expect(saveItemRating).not.toHaveBeenCalled();
      await act(async () => finish());
      await settle();
    });
  });

  describe('when the screen comes back into view', () => {
    it('reads the rating again, keeping what is shown until the answer arrives', async () => {
      loadMyItemRating.mockResolvedValue(ok(FULL));
      const { rerender, selected, text, tree } = await mount({ reloadKey: 0 });
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);

      // The edit form changed the words meanwhile.
      loadMyItemRating.mockResolvedValue(ok(rating({ ...FULL, touchTags: ['silky'] })));
      await rerender({ reloadKey: 1 });
      expect(loadMyItemRating).toHaveBeenCalledTimes(2);
      expect(selected(touch('silky'))).toBe(true);
      expect(selected(touch('soft'))).toBe(false);
      expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Loading your rating')).toHaveLength(0);
      expect(text()).toContain('Your rating');
    });

    it('picks up a rating made elsewhere for a piece that showed as unrated', async () => {
      const { rerender, text } = await mount({ reloadKey: 0 });
      expect(text()).toContain('How is it?');
      loadMyItemRating.mockResolvedValue(ok(FULL));
      await rerender({ reloadKey: 1 });
      expect(text()).toContain('Your rating');
    });

    it('does nothing when the key has not changed', async () => {
      const { rerender } = await mount({ reloadKey: 3 });
      await rerender({ wearCount: 2 });
      expect(loadMyItemRating).toHaveBeenCalledTimes(1);
    });
  });

  describe('where the questions do not belong', () => {
    it('shows none to a guest', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'guest' });
      const { tree } = await mount();
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
    });

    it('shows none on a wishlist piece', async () => {
      const { all } = await mount({ item: makeItem({ isWishlist: true }) });
      expect(all(touch('soft'))).toHaveLength(0);
      expect(loadMyItemRating).not.toHaveBeenCalled();
    });

    it('shows none while the rating is loading or could not be read', async () => {
      loadMyItemRating.mockResolvedValue({ state: 'offline' });
      const { all } = await mount();
      expect(all(touch('soft'))).toHaveLength(0);
    });

    it('adds no text field and no adjustable element: a screen reader picks a star or a word itself', async () => {
      const { tree } = await mount();
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
      expect(tree.root.findAllByType(View).filter(v => v.props.accessibilityRole === 'adjustable')).toHaveLength(0);
    });
  });
});
