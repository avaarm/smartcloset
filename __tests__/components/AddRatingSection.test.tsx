/**
 * The rating pieces of Add/Edit item: the draft rules, the two hooks that keep the draft (and read what is
 * stored once), "How does it feel?", the "Rate <Brand>" row and the brand sheet host. Nothing here is sent by
 * the pieces themselves except the brand commit; the screen saves the item rating (see addItemFormSections).
 */
let mockFlags = { ratings: true, insights: false };
jest.mock('../../src/config/ratingFlags', () => ({
  ratingsActive: () => mockFlags.ratings,
  brandInsightsActive: () => mockFlags.ratings && mockFlags.insights,
  tagScanActive: () => false,
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: false,
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
}));

jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
  saveBrandRating: jest.fn(),
}));

// The sheet and the consent hook have their own tests; here they are stand-ins that show what they were given.
const mockSheetProps: { current: any } = { current: null };
jest.mock('../../src/components/RateBrandSheet', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockSheetProps.current = props;
      return mockReact.createElement('MockBrandSheet', props);
    },
  };
});
const mockConsent = { granted: false as boolean | null, requestConsent: jest.fn(async () => true), sheet: null as any };
jest.mock('../../src/components/RatingConsentSheet', () => ({
  useRatingConsent: () => mockConsent,
}));

import 'react-native';
import React from 'react';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AddRatingSection, {
  BRAND_LOOKUP_DEBOUNCE_MS,
  AddBrandRatingRow,
  BrandSheetHost,
  EMPTY_RATING_DRAFT,
  GUEST_RATING_LINE,
  NEEDS_STARS_LINE,
  RATING_LOADING_LINE,
  RATING_LOAD_FAILED_LINE,
  RATING_SECTION_TITLE,
  TAG_LIMIT_LINE,
  draftFromRating,
  hasDetail,
  ratingInputFromDraft,
  sameRatingDraft,
  useBrandRatingDraft,
  useItemRatingDraft,
  type BrandRatingDraftApi,
  type ItemRatingDraftApi,
  type ItemRatingStatus,
  type RatingDraft,
} from '../../src/components/AddRatingSection';
import { loadMyBrandSummary, loadMyItemRating, saveBrandRating } from '../../src/services/ratingService';
import { scaleStepLabel } from '../../src/components/RatingScale';
import { MAX_TAGS_PER_GROUP } from '../../src/config/ratingVocabulary';
import type { BrandRating, ItemRating } from '../../src/types/rating';

const loadItem = loadMyItemRating as jest.Mock;
const loadBrand = loadMyBrandSummary as jest.Mock;
const saveBrand = saveBrandRating as jest.Mock;

const ok = <T,>(value: T) => ({ state: 'ok' as const, value });

const stored = (over: Partial<ItemRating> = {}): ItemRating => ({
  itemId: 'item-1',
  overall: 4,
  touch: 3,
  touchTags: ['soft'],
  comfort: 2,
  comfortTags: ['warm'],
  holdsUp: 5,
  holdsUpTags: ['washes_well'],
  fit: 'true_to_size',
  wouldBuyAgain: 'yes',
  note: 'Bought in Lisbon',
  contributed: true,
  wearsAtRating: 4,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  ...over,
});

const brandRating = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Zara',
  overall: 3,
  quality: 4,
  fitConsistency: 2,
  value: 5,
  contributed: false,
  updatedAt: '2026-10-02T00:00:00Z',
  ...over,
});

const summary = (rating: BrandRating | null) =>
  ok({ itemsRated: rating ? 1 : 0, avgOverall: null, brandRating: rating, canRateBrand: true });

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const flush = () =>
  act(async () => {
    await new Promise(resolve => setImmediate(resolve));
  });

beforeEach(() => {
  mockFlags = { ratings: true, insights: false };
  mockSheetProps.current = null;
  mockConsent.granted = false;
  mockConsent.requestConsent.mockClear();
  loadItem.mockReset().mockResolvedValue(ok(null));
  loadBrand.mockReset().mockResolvedValue(summary(null));
  saveBrand.mockReset().mockResolvedValue({ contributed: false, blocked: null });
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── The draft rules ────────────────────────────────────────────────────────

describe('the draft', () => {
  it('starts empty and reads a stored rating back into the five things the form asks', () => {
    expect(draftFromRating(null)).toEqual(EMPTY_RATING_DRAFT);
    expect(draftFromRating(stored())).toEqual({
      overall: 4,
      touchTags: ['soft'],
      comfortTags: ['warm'],
      fit: 'true_to_size',
      wouldBuyAgain: 'yes',
    });
  });

  it('compares drafts by what was chosen, not by the order of the words', () => {
    const a: RatingDraft = { ...EMPTY_RATING_DRAFT, overall: 3, touchTags: ['soft', 'silky'] };
    expect(sameRatingDraft(a, { ...a, touchTags: ['silky', 'soft'] })).toBe(true);
    expect(sameRatingDraft(a, { ...a, touchTags: ['soft'] })).toBe(false);
    expect(sameRatingDraft(a, { ...a, overall: 4 })).toBe(false);
    expect(sameRatingDraft(a, { ...a, fit: 'runs_small' })).toBe(false);
    expect(sameRatingDraft(a, { ...a, wouldBuyAgain: 'no' })).toBe(false);
    expect(sameRatingDraft(a, { ...a, comfortTags: ['warm'] })).toBe(false);
  });

  it('tells a draft with words, a fit or an answer from one with only stars', () => {
    expect(hasDetail(EMPTY_RATING_DRAFT)).toBe(false);
    expect(hasDetail({ ...EMPTY_RATING_DRAFT, overall: 5 })).toBe(false);
    expect(hasDetail({ ...EMPTY_RATING_DRAFT, touchTags: ['soft'] })).toBe(true);
    expect(hasDetail({ ...EMPTY_RATING_DRAFT, comfortTags: ['warm'] })).toBe(true);
    expect(hasDetail({ ...EMPTY_RATING_DRAFT, fit: 'runs_large' })).toBe(true);
    expect(hasDetail({ ...EMPTY_RATING_DRAFT, wouldBuyAgain: 'maybe' })).toBe(true);
  });

  it('needs the overall score: without it there is nothing to save', () => {
    expect(ratingInputFromDraft({ ...EMPTY_RATING_DRAFT, touchTags: ['soft'], fit: 'runs_small' }, null)).toBeNull();
  });

  it('builds a new rating from the draft alone, and never asks to count toward insights', () => {
    const input = ratingInputFromDraft(
      { overall: 5, touchTags: ['soft'], comfortTags: ['cozy'], fit: 'runs_small', wouldBuyAgain: 'maybe' },
      null,
    );
    expect(input).toEqual({
      overall: 5,
      touch: null,
      touchTags: ['soft'],
      comfort: null,
      comfortTags: ['cozy'],
      holdsUp: null,
      holdsUpTags: [],
      fit: 'runs_small',
      wouldBuyAgain: 'maybe',
      note: null,
    });
    expect('contribute' in input!).toBe(false);
  });

  it('repeats what the form does not ask from the stored rating, because a save replaces the whole rating', () => {
    const base = stored();
    const input = ratingInputFromDraft({ ...draftFromRating(base), overall: 2, touchTags: [] }, base);
    expect(input).toMatchObject({
      overall: 2,
      touchTags: [],
      touch: 3,
      comfort: 2,
      holdsUp: 5,
      holdsUpTags: ['washes_well'],
      note: 'Bought in Lisbon',
      comfortTags: ['warm'],
      fit: 'true_to_size',
      wouldBuyAgain: 'yes',
    });
    expect('contribute' in input!).toBe(false);
  });
});

// ─── The item's draft ───────────────────────────────────────────────────────

type ItemOpts = Parameters<typeof useItemRatingDraft>[0];

const mountItemHook = async (opts: ItemOpts) => {
  const box: { api: ItemRatingDraftApi } = { api: undefined as unknown as ItemRatingDraftApi };
  const Probe = (props: ItemOpts) => {
    box.api = useItemRatingDraft(props);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe {...opts} />);
  });
  await flush();
  const update = async (next: ItemOpts) => {
    await act(async () => {
      tree.update(<Probe {...next} />);
    });
    await flush();
  };
  return { box, update, tree };
};

describe('useItemRatingDraft', () => {
  it('is ready at once for a new item, reads nothing and has nothing to save until stars are chosen', async () => {
    const { box } = await mountItemHook({ itemId: null, active: true, signedIn: true });
    expect(box.api.status).toBe('ready');
    expect(loadItem).not.toHaveBeenCalled();
    expect(box.api.toInput()).toBeNull();
    await act(async () => box.api.setDraft({ ...EMPTY_RATING_DRAFT, overall: 4 }));
    expect(box.api.toInput()).toMatchObject({ overall: 4 });
  });

  it('keeps chosen words without stars out of the save', async () => {
    const { box } = await mountItemHook({ itemId: null, active: true, signedIn: true });
    await act(async () => box.api.setDraft({ ...EMPTY_RATING_DRAFT, touchTags: ['soft'] }));
    expect(box.api.toInput()).toBeNull();
  });

  it('reads the stored rating of an edited item and starts the draft from it', async () => {
    loadItem.mockResolvedValue(ok(stored()));
    const { box } = await mountItemHook({ itemId: 'item-1', active: true, signedIn: true });
    expect(loadItem).toHaveBeenCalledWith('item-1');
    expect(box.api.status).toBe('ready');
    expect(box.api.draft).toEqual(draftFromRating(stored()));
    expect(box.api.stored).toEqual(stored());
  });

  it('sends nothing for an unchanged rating, and the whole rating when something changed', async () => {
    loadItem.mockResolvedValue(ok(stored()));
    const { box } = await mountItemHook({ itemId: 'item-1', active: true, signedIn: true });
    expect(box.api.toInput()).toBeNull();
    await act(async () => box.api.setDraft({ ...box.api.draft, fit: 'runs_large' }));
    expect(box.api.toInput()).toMatchObject({ overall: 4, fit: 'runs_large', touch: 3, holdsUp: 5, note: 'Bought in Lisbon' });
    // Putting it back is no change again.
    await act(async () => box.api.setDraft(draftFromRating(stored())));
    expect(box.api.toInput()).toBeNull();
  });

  it('starts empty for an item that is not rated yet', async () => {
    const { box } = await mountItemHook({ itemId: 'item-1', active: true, signedIn: true });
    expect(box.api.status).toBe('ready');
    expect(box.api.draft).toEqual(EMPTY_RATING_DRAFT);
    expect(box.api.stored).toBeNull();
  });

  it('shows "loading" while the stored rating is read, and offers no save', async () => {
    let finish!: (value: unknown) => void;
    loadItem.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const { box } = await mountItemHook({ itemId: 'item-1', active: true, signedIn: true });
    expect(box.api.status).toBe('loading');
    expect(box.api.toInput()).toBeNull();
    await act(async () => finish(ok(null)));
    expect(box.api.status).toBe('ready');
  });

  it('says "failed" when the stored rating cannot be read, so a rating can never overwrite one it did not see', async () => {
    for (const state of ['offline', 'error'] as const) {
      loadItem.mockResolvedValue({ state });
      const { box } = await mountItemHook({ itemId: 'item-1', active: true, signedIn: true });
      expect(box.api.status).toBe('failed');
      await act(async () => box.api.setDraft({ ...EMPTY_RATING_DRAFT, overall: 5 }));
      expect(box.api.toInput()).toBeNull();
    }
    loadItem.mockRejectedValue(new Error('boom'));
    expect((await mountItemHook({ itemId: 'item-1', active: true, signedIn: true })).box.api.status).toBe('failed');
  });

  it('shows nothing for an item that cannot be rated from here (a local item, or no server function)', async () => {
    for (const state of ['guest', 'unavailable'] as const) {
      loadItem.mockResolvedValue({ state });
      expect((await mountItemHook({ itemId: 'local-1', active: true, signedIn: true })).box.api.status).toBe('off');
    }
  });

  it('is off, and asks nothing, when inactive (ratings off, or a wishlist item)', async () => {
    const { box } = await mountItemHook({ itemId: 'item-1', active: false, signedIn: true });
    expect(box.api.status).toBe('off');
    expect(loadItem).not.toHaveBeenCalled();
    expect(box.api.toInput()).toBeNull();
  });

  it('is a guest line for a guest, off while the session is unknown, and asks nothing either way', async () => {
    const guest = await mountItemHook({ itemId: 'item-1', active: true, signedIn: false });
    expect(guest.box.api.status).toBe('guest');
    const unknown = await mountItemHook({ itemId: 'item-1', active: true, signedIn: null });
    expect(unknown.box.api.status).toBe('off');
    expect(loadItem).not.toHaveBeenCalled();
    // Once the session is known the stored rating is read.
    await unknown.update({ itemId: 'item-1', active: true, signedIn: true });
    expect(loadItem).toHaveBeenCalledTimes(1);
  });
});

// ─── How does it feel? ──────────────────────────────────────────────────────

const mountSection = async (
  over: { status?: ItemRatingStatus; draft?: RatingDraft; canClear?: boolean } = {},
) => {
  const box: { draft: RatingDraft; onChange: jest.Mock } = { draft: over.draft ?? EMPTY_RATING_DRAFT, onChange: jest.fn() };
  const Host = () => {
    const [draft, setDraft] = React.useState<RatingDraft>(over.draft ?? EMPTY_RATING_DRAFT);
    box.draft = draft;
    return (
      <AddRatingSection
        status={over.status ?? 'ready'}
        draft={draft}
        onChange={next => {
          box.onChange(next);
          setDraft(next);
        }}
        canClear={over.canClear ?? true}
      />
    );
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Host />);
  });
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) => tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  const tap = async (label: string) => {
    const found = byLabel(label);
    if (found.length !== 1) throw new Error(`expected one "${label}", found ${found.length}`);
    await act(async () => found[0].props.onPress());
  };
  const isOn = (label: string) => {
    const state = byLabel(label)[0].props.accessibilityState;
    return !!(state.selected ?? state.checked);
  };
  return { tree, box, text, byLabel, tap, isOn };
};

describe('AddRatingSection', () => {
  it('is titled "How does it feel?" and says it is optional and private', async () => {
    const { text } = await mountSection();
    expect(RATING_SECTION_TITLE).toBe('How does it feel?');
    expect(text()).toContain('How does it feel?');
    expect(text()).toContain('Optional');
    expect(text()).toContain('Private to you');
  });

  it('asks for the overall stars, hand feel, how it wears, fit and whether they would buy it again', async () => {
    const { text, byLabel } = await mountSection();
    for (const heading of ['Overall', 'Hand feel', 'How it wears', 'Fit', 'Would you buy it again?']) {
      expect(text()).toContain(heading);
    }
    expect(byLabel('Hand feel: Soft')).toHaveLength(1);
    expect(byLabel('Hand feel: Stiff')).toHaveLength(1);
    expect(byLabel('How it wears: Breathable')).toHaveLength(1);
    expect(byLabel('How it wears: Heavy')).toHaveLength(1);
    expect(byLabel('Fit: Runs small')).toHaveLength(1);
    expect(byLabel('Fit: True to size')).toHaveLength(1);
    expect(byLabel('Fit: Runs large')).toHaveLength(1);
    expect(byLabel('Would buy again: Yes')).toHaveLength(1);
    expect(byLabel('Would buy again: Maybe')).toHaveLength(1);
    expect(byLabel('Would buy again: No')).toHaveLength(1);
    expect(byLabel(scaleStepLabel('Overall rating', 4))).toHaveLength(1);
  });

  it('sets the stars, and takes them back by choosing the same star again while nothing is stored', async () => {
    const { tap, box } = await mountSection();
    await tap(scaleStepLabel('Overall rating', 4));
    expect(box.draft.overall).toBe(4);
    await tap(scaleStepLabel('Overall rating', 4));
    expect(box.draft.overall).toBeNull();
  });

  it('cannot take the stars back once a rating is stored (removing one is done from the item)', async () => {
    const { tap, box } = await mountSection({ draft: draftFromRating(stored()), canClear: false });
    await tap(scaleStepLabel('Overall rating', 4));
    expect(box.draft.overall).toBe(4);
    await tap(scaleStepLabel('Overall rating', 2));
    expect(box.draft.overall).toBe(2);
  });

  it('toggles hand feel and comfort words, at most four each, and says so when full', async () => {
    const { tap, isOn, byLabel, text, box } = await mountSection();
    const words = ['Soft', 'Silky', 'Buttery', 'Smooth'];
    for (const word of words) await tap(`Hand feel: ${word}`);
    expect(box.draft.touchTags).toEqual(['soft', 'silky', 'buttery', 'smooth']);
    expect(MAX_TAGS_PER_GROUP).toBe(4);
    expect(text()).toContain(TAG_LIMIT_LINE);
    // The rest are off until one is taken away.
    expect(byLabel('Hand feel: Crisp')[0].props.disabled).toBe(true);
    await tap('Hand feel: Soft');
    expect(isOn('Hand feel: Soft')).toBe(false);
    expect(byLabel('Hand feel: Crisp')[0].props.disabled).toBeFalsy();
    await tap('Hand feel: Crisp');
    expect(box.draft.touchTags).toEqual(['silky', 'buttery', 'smooth', 'crisp']);

    await tap('How it wears: Warm');
    await tap('How it wears: Cozy');
    expect(box.draft.comfortTags).toEqual(['warm', 'cozy']);
    // The two groups count separately.
    expect(box.draft.touchTags).toHaveLength(4);
  });

  it('picks one fit and one answer, and clears either by choosing it again', async () => {
    const { tap, isOn, box } = await mountSection();
    await tap('Fit: Runs small');
    await tap('Fit: True to size');
    expect(box.draft.fit).toBe('true_to_size');
    expect(isOn('Fit: Runs small')).toBe(false);
    await tap('Fit: True to size');
    expect(box.draft.fit).toBeNull();

    await tap('Would buy again: Maybe');
    expect(box.draft.wouldBuyAgain).toBe('maybe');
    await tap('Would buy again: Maybe');
    expect(box.draft.wouldBuyAgain).toBeNull();
  });

  it('reminds the person that a rating needs stars, only while words are chosen without them', async () => {
    const { tap, text } = await mountSection();
    expect(text()).not.toContain(NEEDS_STARS_LINE);
    await tap('Fit: Runs small');
    expect(text()).toContain(NEEDS_STARS_LINE);
    await tap(scaleStepLabel('Overall rating', 3));
    expect(text()).not.toContain(NEEDS_STARS_LINE);
  });

  it('shows what a stored rating holds', async () => {
    const { isOn } = await mountSection({ draft: draftFromRating(stored()) });
    expect(isOn('Hand feel: Soft')).toBe(true);
    expect(isOn('How it wears: Warm')).toBe(true);
    expect(isOn('Fit: True to size')).toBe(true);
    expect(isOn('Would buy again: Yes')).toBe(true);
    expect(isOn('Fit: Runs small')).toBe(false);
  });

  it('gives a guest one short line and no controls', async () => {
    const { text, tree } = await mountSection({ status: 'guest' });
    expect(text()).toContain('How does it feel?');
    expect(text()).toContain(GUEST_RATING_LINE);
    expect(GUEST_RATING_LINE).toBe('Sign in to rate your pieces.');
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
  });

  it('says it is loading or could not load, with no controls, so a stored rating is never overwritten blind', async () => {
    const loading = await mountSection({ status: 'loading' });
    expect(loading.text()).toContain(RATING_LOADING_LINE);
    expect(loading.tree.root.findAllByType(Pressable)).toHaveLength(0);
    const failed = await mountSection({ status: 'failed' });
    expect(failed.text()).toContain(RATING_LOAD_FAILED_LINE);
    expect(failed.tree.root.findAllByType(Pressable)).toHaveLength(0);
  });

  it('renders nothing when there is nothing to show, or when ratings are off', async () => {
    expect((await mountSection({ status: 'off' })).tree.toJSON()).toBeNull();
    mockFlags.ratings = false;
    expect((await mountSection()).tree.toJSON()).toBeNull();
  });

  it('puts every control behind an accessibility label', async () => {
    const { tree } = await mountSection();
    const unlabelled = tree.root.findAllByType(Pressable).filter(n => !n.props.accessibilityLabel);
    expect(unlabelled).toHaveLength(0);
  });
});

// ─── The brand's draft ──────────────────────────────────────────────────────

const mountBrandHook = async (brand: string, enabled = true) => {
  const box: { api: BrandRatingDraftApi } = { api: undefined as unknown as BrandRatingDraftApi };
  const Probe = ({ text, on }: { text: string; on: boolean }) => {
    box.api = useBrandRatingDraft(text, on);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe text={brand} on={enabled} />);
  });
  await flush();
  const update = async (text: string, on = enabled) => {
    await act(async () => {
      tree.update(<Probe text={text} on={on} />);
    });
  };
  return { box, update, tree };
};

describe('useBrandRatingDraft', () => {
  it('is unusable, and asks nothing, while disabled or for a brand with no key', async () => {
    expect((await mountBrandHook('Zara', false)).box.api.usable).toBe(false);
    expect((await mountBrandHook('', true)).box.api.usable).toBe(false);
    expect((await mountBrandHook('  ', true)).box.api.usable).toBe(false);
    expect((await mountBrandHook('Z', true)).box.api.usable).toBe(false);
    expect((await mountBrandHook('!!', true)).box.api.usable).toBe(false);
    expect(loadBrand).not.toHaveBeenCalled();
  });

  it('reads the stored rating of the brand at once and shows its stars', async () => {
    loadBrand.mockResolvedValue(summary(brandRating({ overall: 3 })));
    const { box } = await mountBrandHook(' Zara ');
    expect(loadBrand).toHaveBeenCalledWith('Zara');
    expect(box.api.usable).toBe(true);
    expect(box.api.brand).toBe('Zara');
    expect(box.api.stored?.overall).toBe(3);
    expect(box.api.score).toBe(3);
    expect(box.api.dirty).toBe(false);
  });

  it('shows no stars for a brand that is not rated, and is dirty once stars are chosen', async () => {
    const { box } = await mountBrandHook('Zara');
    expect(box.api.score).toBeNull();
    await act(async () => box.api.setScore(4));
    expect(box.api.score).toBe(4);
    expect(box.api.dirty).toBe(true);
    // Choosing what is already stored changes nothing.
    loadBrand.mockResolvedValue(summary(brandRating({ overall: 4 })));
    const same = await mountBrandHook('Zara');
    await act(async () => same.box.api.setScore(4));
    expect(same.box.api.dirty).toBe(false);
  });

  it('takes the stars back when they were not stored, and never reports a cleared score as something to save', async () => {
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(4));
    await act(async () => box.api.setScore(null));
    expect(box.api.score).toBeNull();
    expect(box.api.dirty).toBe(false);
  });

  it('drops stars chosen for another brand when the brand changes, and waits for a pause before reading the new one', async () => {
    const { box, update } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(5));
    loadBrand.mockClear();
    jest.useFakeTimers();
    await update('Mango');
    expect(box.api.score).toBeNull();
    expect(box.api.dirty).toBe(false);
    expect(loadBrand).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(BRAND_LOOKUP_DEBOUNCE_MS);
    });
    expect(loadBrand).toHaveBeenCalledWith('Mango');
  });

  it('commits the stars with the detail scores of the stored rating, read fresh, and no consent request', async () => {
    loadBrand.mockResolvedValue(summary(brandRating({ overall: 3, quality: 4, fitConsistency: 2, value: 5 })));
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(5));
    await act(async () => box.api.commit());
    expect(saveBrand).toHaveBeenCalledTimes(1);
    expect(saveBrand).toHaveBeenCalledWith('Zara', { overall: 5, quality: 4, fitConsistency: 2, value: 5 });
    expect('contribute' in saveBrand.mock.calls[0][1]).toBe(false);
  });

  it('commits stars for a brand not rated before with empty detail scores', async () => {
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(2));
    await act(async () => box.api.commit());
    expect(saveBrand).toHaveBeenCalledWith('Zara', { overall: 2, quality: null, fitConsistency: null, value: null });
  });

  it('commits nothing when there is nothing new, and refuses to replace a rating it could not read', async () => {
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.commit());
    expect(saveBrand).not.toHaveBeenCalled();

    await act(async () => box.api.setScore(5));
    loadBrand.mockResolvedValue({ state: 'offline' });
    await expect(box.api.commit()).rejects.toThrow();
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it('lets a failed save throw, for the screen to report', async () => {
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(5));
    saveBrand.mockRejectedValue(new Error('Couldn’t save your rating.'));
    await expect(box.api.commit()).rejects.toThrow('Couldn’t save your rating.');
  });

  it('reads the stored rating again and drops the unsaved stars on reload', async () => {
    const { box } = await mountBrandHook('Zara');
    await act(async () => box.api.setScore(5));
    loadBrand.mockResolvedValue(summary(brandRating({ overall: 2 })));
    await act(async () => box.api.reload());
    expect(box.api.score).toBe(2);
    expect(box.api.dirty).toBe(false);
  });
});

// ─── Rate <Brand> ───────────────────────────────────────────────────────────

describe('AddBrandRatingRow', () => {
  const mountRow = async (props: Partial<React.ComponentProps<typeof AddBrandRatingRow>> = {}) => {
    const onChange = jest.fn();
    const onMore = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AddBrandRatingRow brand="Zara" score={null} onChange={onChange} canClear onMore={onMore} {...props} />,
      );
    });
    const byLabel = (label: string) => tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
    return { tree, onChange, onMore, byLabel, text: () => flatten(tree.toJSON()) };
  };

  it('says "Rate <Brand>" over five stars, with a More link', async () => {
    const { text, byLabel } = await mountRow();
    expect(text()).toContain('Rate Zara');
    expect(byLabel(scaleStepLabel('Rate Zara', 5))).toHaveLength(1);
    expect(byLabel('More about your Zara rating')).toHaveLength(1);
  });

  it('reports the star chosen, and no star when the same one is chosen again while it can be cleared', async () => {
    const { byLabel, onChange } = await mountRow({ score: 4 });
    await act(async () => byLabel(scaleStepLabel('Rate Zara', 2))[0].props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(2);
    await act(async () => byLabel(scaleStepLabel('Rate Zara', 4))[0].props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('cannot clear a stored rating', async () => {
    const { byLabel, onChange } = await mountRow({ score: 4, canClear: false });
    await act(async () => byLabel(scaleStepLabel('Rate Zara', 4))[0].props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the brand sheet from More', async () => {
    const { byLabel, onMore } = await mountRow();
    await act(async () => byLabel('More about your Zara rating')[0].props.onPress());
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('has no More link when the sheet cannot be used yet', async () => {
    const { byLabel } = await mountRow({ onMore: undefined });
    expect(byLabel('More about your Zara rating')).toHaveLength(0);
  });

  it('renders nothing when ratings are off', async () => {
    mockFlags.ratings = false;
    expect((await mountRow()).tree.toJSON()).toBeNull();
  });
});

// ─── The brand sheet behind More ────────────────────────────────────────────

describe('BrandSheetHost', () => {
  const mountHost = async () => {
    const onClose = jest.fn();
    const onChanged = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    const rating = brandRating();
    await act(async () => {
      tree = renderer.create(
        <BrandSheetHost visible brand="Zara" initial={rating} onClose={onClose} onChanged={onChanged} />,
      );
    });
    return { tree, onClose, onChanged, rating };
  };

  it('opens the brand sheet on the stored rating', async () => {
    const { rating } = await mountHost();
    expect(mockSheetProps.current).toMatchObject({ visible: true, brand: 'Zara', initial: rating });
  });

  it('asks nothing of the consent hook while brand insights are off', async () => {
    await mountHost();
    expect(mockSheetProps.current.consentGranted).toBeNull();
    expect(await mockSheetProps.current.onRequestConsent()).toBe(false);
    expect(mockConsent.requestConsent).not.toHaveBeenCalled();
  });

  it('uses the consent hook when brand insights are on', async () => {
    mockFlags.insights = true;
    mockConsent.granted = true;
    await mountHost();
    expect(mockSheetProps.current.consentGranted).toBe(true);
    await mockSheetProps.current.onRequestConsent();
    expect(mockConsent.requestConsent).toHaveBeenCalledTimes(1);
  });

  it('tells the screen to read the rating again, and closes, after a save or a removal', async () => {
    const { onClose, onChanged } = await mountHost();
    await act(async () => mockSheetProps.current.onSaved({ contributed: false, blocked: null }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => mockSheetProps.current.onRemoved());
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when ratings are off', async () => {
    mockFlags.ratings = false;
    const { tree } = await mountHost();
    expect(tree.toJSON()).toBeNull();
    expect(mockSheetProps.current).toBeNull();
  });
});
