/**
 * Add / Edit Item: the sections the owner could not find, now in the form. Size categories, the card that scans the
 * tag and washing instructions, style chips that live in the tags, "How does it feel?" with the draft rating that is
 * saved after the item, the brand rating under the Brand field, and the "Not right?" hint for the photo reading.
 */
let mockFlags = { ratings: true, insights: false, tag: true };
jest.mock('../../src/config/ratingFlags', () => ({
  ...jest.requireActual('../../src/config/ratingFlags'),
  ratingsActive: () => mockFlags.ratings,
  brandInsightsActive: () => mockFlags.ratings && mockFlags.insights,
  tagScanActive: () => mockFlags.tag,
}));

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) },
    rpc: jest.fn(),
  },
}));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(async () => undefined),
  updateClothingItem: jest.fn(async () => undefined),
  getClothingItems: jest.fn(async () => []),
}));
jest.mock('../../src/services/imageStorage', () => ({
  copyImageToPermanentStorage: jest.fn(async (uri: string) => uri),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
  discardTempImage: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/productContributions', () => ({
  lookupKnowledgeBase: jest.fn(async () => []),
  recordContribution: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/imageRecognition', () => ({
  ...jest.requireActual('../../src/services/imageRecognition'),
  analyzeClothingImage: jest.fn(),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));
jest.mock('../../src/services/ratingService', () => ({
  loadMyItemRating: jest.fn(),
  loadMyBrandSummary: jest.fn(),
  saveItemRating: jest.fn(),
  saveBrandRating: jest.fn(),
  loadMyRatingCounts: jest.fn(),
}));
jest.mock('../../src/services/consentService', () => ({ getConsent: jest.fn(), setConsent: jest.fn() }));
jest.mock('../../src/services/brandInsightService', () => ({ loadBrandInsight: jest.fn() }));
const mockEnsureConsent = jest.fn();
jest.mock('../../src/services/aiConsent', () => ({
  ensureAiConsent: (...a: unknown[]) => mockEnsureConsent(...a),
  AI_CONSENT_ERROR: 'ai_consent_required',
}));
const mockPick = jest.fn();
const mockReadTag = jest.fn();
jest.mock('../../src/services/tagReader', () => ({
  MAX_TAG_PHOTOS: 3,
  pickTagPhoto: (...a: unknown[]) => mockPick(...a),
  readTag: (...a: unknown[]) => mockReadTag(...a),
}));

import 'react-native';
import React from 'react';
import { AccessibilityInfo, Alert, InteractionManager, Modal, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import TagReviewSheet from '../../src/components/TagReviewSheet';
import { scaleStepLabel } from '../../src/components/RatingScale';
import { getAuthUserId } from '../../src/services/authUser';
import { getClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage } from '../../src/services/lensSearchService';
import { loadMyBrandSummary, loadMyItemRating, saveBrandRating, saveItemRating } from '../../src/services/ratingService';
import { parseTagText } from '../../src/utils/tagParser';
import type { BrandRating, ItemRating } from '../../src/types/rating';

const authUserId = getAuthUserId as jest.Mock;
const save = saveClothingItem as jest.Mock;
const update = updateClothingItem as jest.Mock;
const recent = getClothingItems as jest.Mock;
const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;
const loadItem = loadMyItemRating as jest.Mock;
const loadBrand = loadMyBrandSummary as jest.Mock;
const saveItem = saveItemRating as jest.Mock;
const saveBrand = saveBrandRating as jest.Mock;

const CLEAN = parseTagText('100% COTTON\nMADE IN BANGLADESH\nMACHINE WASH COLD\nTUMBLE DRY LOW\nSIZE M');
const NEW_ID = '9f0e8a52-1b2c-4d3e-8f90-123456789abc';

const ok = <T,>(value: T) => ({ state: 'ok' as const, value });

const summary = (brandRating: BrandRating | null) =>
  ok({ itemsRated: brandRating ? 1 : 0, avgOverall: null, brandRating, canRateBrand: true });

const brandRatingRow = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Zara',
  overall: 3,
  quality: 4,
  fitConsistency: 2,
  value: 5,
  contributed: false,
  updatedAt: '2026-10-02T00:00:00Z',
  ...over,
});

const storedRating = (over: Partial<ItemRating> = {}): ItemRating => ({
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
  contributed: false,
  wearsAtRating: 4,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  ...over,
});

let tree: renderer.ReactTestRenderer;
let goBack: jest.Mock;
let alertSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const render = async (params: any = {}) => {
  goBack = jest.fn();
  await act(async () => {
    tree = renderer.create(<AddClothingScreen navigation={{ goBack, navigate: jest.fn() } as any} route={{ params }} />);
  });
  await flush();
};

const texts = (): string[] =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => React.Children.toArray(n.props.children).join(''));
const hasText = (label: string) => texts().includes(label);
const indexOf = (label: string): number => {
  const at = texts().indexOf(label);
  if (at === -1) throw new Error(`no text "${label}" in: ${texts().join(' | ')}`);
  return at;
};

/** The element a person would tap for this label: the first one that carries it and can be pressed. */
const byLabel = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const chip = (label: string) => {
  const found = byLabel(label);
  if (found.length === 0) throw new Error(`nothing labelled "${label}"`);
  return found[0];
};
const has = (label: string) => byLabel(label).length > 0;
const isOn = (label: string): boolean => {
  const state = chip(label).props.accessibilityState || {};
  return !!(state.selected ?? state.checked);
};
const tap = (label: string) => act(async () => chip(label).props.onPress());

const input = (match: { placeholder?: string; label?: string }) =>
  tree.root
    .findAllByType(TextInput)
    .find(i => (match.placeholder ? i.props.placeholder === match.placeholder : i.props.accessibilityLabel === match.label))!;
const typeInto = (match: { placeholder?: string; label?: string }, value: string) =>
  act(async () => {
    input(match).props.onChangeText(value);
  });
const typeName = (value: string) => typeInto({ placeholder: 'Item Name' }, value);
const typeBrand = (value: string) => typeInto({ placeholder: 'Brand' }, value);

const pressText = (label: string) => {
  const t = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label)[0];
  let node: any = t;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`nothing to press for "${label}"`);
  return node;
};
const pressSave = async (label = 'Save Item') => {
  await act(async () => {
    pressText(label).props.onPress();
  });
  await flush();
};

const analysis = (over: any = {}) => ({
  isReal: true,
  confidence: {},
  category: 'shoes',
  subtype: 'knee-high boots',
  color: 'tan',
  ...over,
});

const addPhoto = async (uri = 'file:///photo.jpg') => {
  (ImagePicker.launchImageLibrary as jest.Mock).mockImplementation((_o: any, cb: (r: any) => void) =>
    cb({ assets: [{ uri }] }),
  );
  const photoArea = tree.root.findAllByType(TouchableOpacity).find(t => (t.props.style as any)?.height === 250);
  await act(async () => {
    photoArea!.props.onPress();
  });
  const buttons: any[] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as any[];
  await act(async () => {
    buttons.find(b => b.text === 'Choose from Library').onPress();
  });
  await flush();
};

const editItem = (over: any = {}) => ({
  id: 'item-1',
  name: 'Wool coat',
  category: 'outerwear',
  color: 'Grey',
  season: ['fall', 'winter'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...over,
});

beforeEach(() => {
  mockFlags = { ratings: true, insights: false, tag: true };
  jest.clearAllMocks();
  authUserId.mockReset().mockResolvedValue('user-1');
  recent.mockReset().mockResolvedValue([{ id: NEW_ID, name: 'Silk blouse', category: 'tops', isWishlist: false }]);
  search.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
  loadItem.mockReset().mockResolvedValue(ok(null));
  loadBrand.mockReset().mockResolvedValue(summary(null));
  saveItem.mockReset().mockResolvedValue({ contributed: false, blocked: null, updatedAt: '' });
  saveBrand.mockReset().mockResolvedValue({ contributed: false, blocked: null });
  mockEnsureConsent.mockReset().mockResolvedValue(true);
  mockPick.mockReset().mockResolvedValue({ status: 'ok', uri: 'file:///cache/one.jpg' });
  mockReadTag.mockReset().mockResolvedValue({ ok: true, read: CLEAN });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((task: () => void) => {
    task();
    return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() };
  }) as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  // A late state update or a bad prop would show up here.
  expect(errorSpy).not.toHaveBeenCalled();
  act(() => {
    tree?.unmount();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Size ───────────────────────────────────────────────────────────────────

describe('size', () => {
  it('sits right after Type as chips, with the condition chips in the section after it', async () => {
    await render();
    expect(hasText('Size & Condition')).toBe(false);
    expect(indexOf('Type')).toBeLessThan(indexOf('Size'));
    expect(indexOf('Size')).toBeLessThan(indexOf('Condition'));
    expect(indexOf('Condition')).toBeLessThan(indexOf('Price'));
    expect(hasText('Letter')).toBe(true);
    expect(hasText('Numeric (US)')).toBe(true);
    expect(has('Letter M')).toBe(true);
    expect(has('Like new')).toBe(true);
  });

  it('follows the category: shoe sizes and a "Shoe size" title for shoes, waist sizes for bottoms', async () => {
    await render();
    await tap('Shoes');
    expect(hasText('Shoe size')).toBe(true);
    expect(hasText('Shoe (US)')).toBe(true);
    expect(hasText('Shoe (EU)')).toBe(true);
    expect(has('Letter M')).toBe(false);
    await tap('Bottoms');
    expect(hasText('Size or waist')).toBe(true);
    expect(has('Waist (in) 30')).toBe(true);
  });

  it('saves the chip tapped, and nothing when it is tapped again', async () => {
    await render();
    await tap('Letter M');
    await typeName('Silk blouse');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ size: 'M' }));
    act(() => tree.unmount());

    await render();
    await tap('Letter M');
    await tap('Letter M');
    await typeName('Silk blouse');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ size: '' }));
  });

  it('saves a size typed in the Other size field, cleaned, as one string', async () => {
    await render();
    await typeInto({ label: 'Other size' }, '  w30   l32 ');
    await typeName('Jeans');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ size: 'w30 l32' }));
  });

  it('shows the size of an edited item on its chip, or in the field when the chips do not offer it', async () => {
    await render({ editItem: editItem({ category: 'tops', size: 'm' }) });
    expect(isOn('Letter M')).toBe(true);
    expect(input({ label: 'Other size' }).props.value).toBe('');
    act(() => tree.unmount());

    await render({ editItem: editItem({ category: 'tops', size: 'EU 38' }) });
    expect(input({ label: 'Other size' }).props.value).toBe('EU 38');
    const sizeChips = tree.root.findAll(
      n => typeof n.props.onPress === 'function' && /^(Letter|Numeric \(US\)) /.test(String(n.props.accessibilityLabel)),
    );
    expect(sizeChips.length).toBeGreaterThan(10);
    expect(sizeChips.filter(n => n.props.accessibilityState?.selected)).toHaveLength(0);
  });
});

// ─── The scan card ──────────────────────────────────────────────────────────

describe('the tag and washing instructions card', () => {
  it('is right under the photo, before Details, and the bottom section is renamed', async () => {
    await render();
    expect(indexOf('Photo')).toBeLessThan(indexOf('Scan the tag & washing instructions'));
    expect(indexOf('Scan the tag & washing instructions')).toBeLessThan(indexOf('Details'));
    expect(hasText('Take a photo of the tag')).toBe(true);
    expect(hasText('Label & washing instructions')).toBe(true);
    expect(hasText('Label')).toBe(false);
    expect(indexOf('Tags')).toBeLessThan(indexOf('Label & washing instructions'));
    expect(indexOf('Label & washing instructions')).toBeLessThan(indexOf('Materials'));
  });

  it('is the only scanner: one review sheet, and no second Scan tag button below', async () => {
    await render();
    expect(tree.root.findAllByType(TagReviewSheet)).toHaveLength(1);
    expect(has('Scan tag')).toBe(false);
    expect(has('Scan the tag and washing instructions')).toBe(true);
  });

  it('starts the scan, fills the form from the tag, shows what it read, and saves it with the item', async () => {
    await render();
    await tap('Scan the tag and washing instructions');
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    await tap('Take photo');
    await tap('Use these');

    // The card says what was read.
    expect(hasText('Read from the tag')).toBe(true);
    expect(hasText('Size M · 100% cotton · 2 care instructions · Made in Bangladesh')).toBe(true);
    expect(has('Rescan the tag and washing instructions')).toBe(true);
    // The size chip, the Made in field and the care chips in the bottom section hold the same state.
    expect(isOn('Letter M')).toBe(true);
    expect(input({ label: 'Made in' }).props.value).toBe('Bangladesh');
    expect(has('Remove Machine wash cold')).toBe(true);
    expect(has('Remove Tumble dry low')).toBe(true);

    await typeName('Cotton tee');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        size: 'M',
        originCountry: 'Bangladesh',
        careInstructions: ['Machine wash cold', 'Tumble dry low'],
        tagText: CLEAN.transcription,
        materials: [{ name: 'cotton', percentage: 100, tier: 'primary' }],
      }),
    );
  });

  it('opens the scan straight away for an edit that came from the scan link, and not otherwise', async () => {
    await render({ editItem: editItem(), scanTag: true });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(hasText('Take photo')).toBe(true);
    act(() => tree.unmount());
    mockEnsureConsent.mockClear();
    await render({ editItem: editItem() });
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it('works on an edited item that already has tag text: it says it was read', async () => {
    await render({ editItem: editItem({ size: 'L', tagText: '100% wool', careInstructions: ['Dry clean only'] }) });
    expect(hasText('Read from the tag')).toBe(true);
    expect(hasText('Size L · 1 care instruction')).toBe(true);
  });

  it('tells a guest to sign in, and does nothing when pressed', async () => {
    authUserId.mockResolvedValue(null);
    await render();
    expect(hasText('Sign in to scan tags.')).toBe(true);
    expect(chip('Scan the tag and washing instructions').props.disabled).toBe(true);
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it('lets the care instructions be edited in the bottom section', async () => {
    await render({ editItem: editItem({ careInstructions: ['Hand wash'] }) });
    expect(hasText('Edit')).toBe(true);
    expect(has('Remove Hand wash')).toBe(true);
    await tap('Care instructions (1)');
    expect(hasText('Done')).toBe(true);
    await tap('Line dry');
    await pressSave('Update Item');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ careInstructions: ['Hand wash', 'Line dry'] }));
  });

  it('is not there with the tag flag off', async () => {
    mockFlags.tag = false;
    await render();
    expect(hasText('Scan the tag & washing instructions')).toBe(false);
    expect(hasText('Label & washing instructions')).toBe(false);
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });
});

// ─── Style ──────────────────────────────────────────────────────────────────

describe('style', () => {
  it('is a section after Occasion, before Tags, with a chip for each style', async () => {
    await render();
    expect(indexOf('Occasion')).toBeLessThan(indexOf('Style'));
    expect(indexOf('Style')).toBeLessThan(indexOf('Tags'));
    for (const label of ['Casual', 'Classic', 'Boho', 'Vintage', 'Trendy']) expect(has(`Style: ${label}`)).toBe(true);
  });

  it('lights the chips for the style words in an edited item\'s tags and leaves the rest in the Tags field', async () => {
    await render({ editItem: editItem({ tags: ['casual', 'Boho', 'summer', 'my favourite'] }) });
    expect(isOn('Style: Casual')).toBe(true);
    expect(isOn('Style: Boho')).toBe(true);
    expect(isOn('Style: Classic')).toBe(false);
    expect(input({ placeholder: 'Tags (comma separated, e.g., summer, favorite)' }).props.value).toBe('summer, my favourite');
  });

  it('keeps the tags as they were when the edit changes nothing', async () => {
    await render({ editItem: editItem({ tags: ['casual', 'Boho', 'summer'] }) });
    await pressSave('Update Item');
    // Style words are lower-case and first, the person\'s own tags follow in their order.
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['casual', 'boho', 'summer'] }));
  });

  it('saves chosen styles and typed tags together, once each', async () => {
    await render();
    await tap('Style: Vintage');
    await tap('Style: Casual');
    await typeInto({ placeholder: 'Tags (comma separated, e.g., summer, favorite)' }, 'summer, favorite');
    await typeName('Linen shirt');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['casual', 'vintage', 'summer', 'favorite'] }));
  });

  it('loses nothing typed: a style word in the Tags field counts as that style and is not listed twice', async () => {
    await render();
    await tap('Style: Casual');
    await typeInto({ placeholder: 'Tags (comma separated, e.g., summer, favorite)' }, 'Casual, boho, mine, casual');
    await typeName('Linen shirt');
    await pressSave();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['casual', 'boho', 'mine'] }));
  });

  it('moves a style word typed in the Tags field onto its chip when the field is left', async () => {
    await render();
    const tagsField = { placeholder: 'Tags (comma separated, e.g., summer, favorite)' };
    await typeInto(tagsField, 'boho, mine');
    expect(isOn('Style: Boho')).toBe(false);
    await act(async () => input(tagsField).props.onBlur());
    expect(isOn('Style: Boho')).toBe(true);
    expect(input(tagsField).props.value).toBe('mine');
  });

  it('removes a style when its chip is turned off, and keeps the other tags', async () => {
    await render({ editItem: editItem({ tags: ['casual', 'my tag'] }) });
    await tap('Style: Casual');
    expect(isOn('Style: Casual')).toBe(false);
    await pressSave('Update Item');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['my tag'] }));
  });

  it('lights the chips for the styles the photo reading names, and keeps its other words as tags', async () => {
    analyze.mockResolvedValue(analysis({ category: 'tops', style: ['Casual', 'minimalist', 'Boho'], confidence: { category: 0.9 } }));
    await render();
    await addPhoto();
    expect(isOn('Style: Casual')).toBe(true);
    expect(isOn('Style: Boho')).toBe(true);
    const tagsValue = input({ placeholder: 'Tags (comma separated, e.g., summer, favorite)' }).props.value as string;
    expect(tagsValue).toContain('minimalist');
    expect(tagsValue).not.toContain('casual');
    expect(tagsValue).not.toContain('boho');
  });
});

// ─── How does it feel? ──────────────────────────────────────────────────────

describe('the rating section', () => {
  it('is in the form for an owned item, after Tags and before the Label section', async () => {
    await render();
    expect(hasText('How does it feel?')).toBe(true);
    expect(indexOf('Tags')).toBeLessThan(indexOf('How does it feel?'));
    expect(indexOf('How does it feel?')).toBeLessThan(indexOf('Label & washing instructions'));
    expect(has(scaleStepLabel('Overall rating', 5))).toBe(true);
    expect(has('Hand feel: Soft')).toBe(true);
    expect(has('How it wears: Warm')).toBe(true);
    expect(has('Fit: True to size')).toBe(true);
    expect(has('Would buy again: Yes')).toBe(true);
    expect(loadItem).not.toHaveBeenCalled();
  });

  it('is not on the wishlist form', async () => {
    await render({ isWishlist: true });
    expect(hasText('How does it feel?')).toBe(false);
    act(() => tree.unmount());
    await render({ editItem: editItem({ isWishlist: true }) });
    expect(hasText('How does it feel?')).toBe(false);
    expect(loadItem).not.toHaveBeenCalled();
  });

  it('is not there, and asks nothing, with ratings off', async () => {
    mockFlags.ratings = false;
    await render({ editItem: editItem({ brand: 'Zara' }) });
    expect(hasText('How does it feel?')).toBe(false);
    expect(has('Rate Zara')).toBe(false);
    expect(loadItem).not.toHaveBeenCalled();
    expect(loadBrand).not.toHaveBeenCalled();
    await pressSave('Update Item');
    expect(saveItem).not.toHaveBeenCalled();
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it('gives a guest one short line and no controls', async () => {
    authUserId.mockResolvedValue(null);
    await render();
    expect(hasText('How does it feel?')).toBe(true);
    expect(hasText('Sign in to rate your pieces.')).toBe(true);
    expect(has('Hand feel: Soft')).toBe(false);
    expect(has(scaleStepLabel('Overall rating', 5))).toBe(false);
    await typeName('Silk blouse');
    await pressSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveItem).not.toHaveBeenCalled();
  });

  it('saves a new item first, then its rating against the id the item was given', async () => {
    await render();
    await typeName('Silk blouse');
    await tap(scaleStepLabel('Overall rating', 4));
    await tap('Hand feel: Silky');
    await tap('How it wears: Breathable');
    await tap('Fit: True to size');
    await tap('Would buy again: Yes');
    await pressSave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(recent).toHaveBeenCalledWith({ limit: 5 });
    expect(saveItem).toHaveBeenCalledTimes(1);
    expect(saveItem).toHaveBeenCalledWith(NEW_ID, {
      overall: 4,
      touch: null,
      touchTags: ['silky'],
      comfort: null,
      comfortTags: ['breathable'],
      holdsUp: null,
      holdsUpTags: [],
      fit: 'true_to_size',
      wouldBuyAgain: 'yes',
      note: null,
    });
    // The item exists before its rating is sent.
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(saveItem.mock.invocationCallOrder[0]);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('uses the id the store hands back when it does, without looking for the item', async () => {
    save.mockResolvedValueOnce('handed-back-id');
    await render();
    await typeName('Silk blouse');
    await tap(scaleStepLabel('Overall rating', 5));
    await pressSave();
    expect(recent).not.toHaveBeenCalled();
    expect(saveItem).toHaveBeenCalledWith('handed-back-id', expect.objectContaining({ overall: 5 }));
  });

  it('saves no rating without stars, even when words were chosen', async () => {
    await render();
    await typeName('Silk blouse');
    await tap('Hand feel: Silky');
    await tap('Fit: Runs small');
    expect(hasText('Choose a star rating to save this.')).toBe(true);
    await pressSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveItem).not.toHaveBeenCalled();
    expect(recent).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('sends no rating request when none was drafted', async () => {
    await render();
    await typeName('Silk blouse');
    await pressSave();
    expect(saveItem).not.toHaveBeenCalled();
    expect(saveBrand).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('never blocks or undoes the item when the rating fails: one gentle message after the form closes', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    saveItem.mockRejectedValue(new Error('Couldn’t save your rating. Check your connection and try again.'));
    await render();
    await typeName('Silk blouse');
    await tap(scaleStepLabel('Overall rating', 5));
    await pressSave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Saved', 'We couldn’t save the rating; you can rate it from the item.');
  });

  it('says the same gentle thing when the new item cannot be found to rate', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    recent.mockResolvedValue([]);
    await render();
    await typeName('Silk blouse');
    await tap(scaleStepLabel('Overall rating', 3));
    await pressSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveItem).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not rate when the item itself did not save', async () => {
    save.mockRejectedValueOnce(new Error('offline'));
    await render();
    await typeName('Silk blouse');
    await tap(scaleStepLabel('Overall rating', 4));
    await pressSave();
    expect(saveItem).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to save item. Please try again.');
    expect(errorSpy).toHaveBeenCalledWith('Error saving item:', expect.any(Error));
    errorSpy.mockClear();
  });

  describe('when editing', () => {
    it('starts from the stored rating', async () => {
      loadItem.mockResolvedValue(ok(storedRating()));
      await render({ editItem: editItem() });
      expect(loadItem).toHaveBeenCalledWith('item-1');
      expect(isOn('Hand feel: Soft')).toBe(true);
      expect(isOn('How it wears: Warm')).toBe(true);
      expect(isOn('Fit: True to size')).toBe(true);
      expect(isOn('Would buy again: Yes')).toBe(true);
      expect(chip(scaleStepLabel('Overall rating', 4)).props.accessibilityState.selected).toBe(true);
    });

    it('saves nothing when the rating was not changed', async () => {
      loadItem.mockResolvedValue(ok(storedRating()));
      await render({ editItem: editItem() });
      await pressSave('Update Item');
      expect(update).toHaveBeenCalledTimes(1);
      expect(saveItem).not.toHaveBeenCalled();
      expect(goBack).toHaveBeenCalledTimes(1);
    });

    it('saves the whole rating once something changed, after the item, repeating what the form does not ask', async () => {
      loadItem.mockResolvedValue(ok(storedRating()));
      await render({ editItem: editItem() });
      await tap('Fit: Runs small');
      await pressSave('Update Item');
      expect(saveItem).toHaveBeenCalledTimes(1);
      expect(saveItem).toHaveBeenCalledWith('item-1', {
        overall: 4,
        touch: 3,
        touchTags: ['soft'],
        comfort: 2,
        comfortTags: ['warm'],
        holdsUp: 5,
        holdsUpTags: ['washes_well'],
        fit: 'runs_small',
        wouldBuyAgain: 'yes',
        note: 'Bought in Lisbon',
      });
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(saveItem.mock.invocationCallOrder[0]);
      // An edited item already has its id: it is not looked for.
      expect(recent).not.toHaveBeenCalled();
    });

    it('cannot take the stored stars back from the form', async () => {
      loadItem.mockResolvedValue(ok(storedRating()));
      await render({ editItem: editItem() });
      await tap(scaleStepLabel('Overall rating', 4));
      expect(chip(scaleStepLabel('Overall rating', 4)).props.accessibilityState.selected).toBe(true);
    });

    it('offers no controls, and saves no rating, when the stored one could not be read', async () => {
      loadItem.mockResolvedValue({ state: 'offline' });
      await render({ editItem: editItem() });
      expect(hasText('Couldn’t load your rating. You can rate it from the item.')).toBe(true);
      expect(has('Hand feel: Soft')).toBe(false);
      await pressSave('Update Item');
      expect(update).toHaveBeenCalledTimes(1);
      expect(saveItem).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('says nothing, and rates nothing, for an item that cannot be rated from here', async () => {
      loadItem.mockResolvedValue({ state: 'guest' });
      await render({ editItem: editItem() });
      expect(hasText('How does it feel?')).toBe(false);
    });
  });
});

// ─── The brand rating ───────────────────────────────────────────────────────

describe('the brand rating', () => {
  it('shows "Rate <Brand>" under the Brand field once there is a brand, and not before', async () => {
    await render();
    expect(hasText('Rate Zara')).toBe(false);
    expect(texts().some(t => t.startsWith('Rate '))).toBe(false);
    await typeBrand('Zara');
    expect(hasText('Rate Zara')).toBe(true);
    expect(has(scaleStepLabel('Rate Zara', 5))).toBe(true);
    // Directly under the Brand field, above Retailer.
    const all = tree.root.findAll(() => true);
    const brandAt = all.findIndex(n => n.props.placeholder === 'Brand');
    const rowAt = all.findIndex(n => n.props.accessibilityLabel === scaleStepLabel('Rate Zara', 1));
    const retailerAt = all.findIndex(n => n.props.placeholder === 'Retailer/Store');
    expect(rowAt).toBeGreaterThan(brandAt);
    expect(retailerAt).toBeGreaterThan(rowAt);
    // A new item has no saved piece of the brand yet, so there is no More link.
    expect(has('More about your Zara rating')).toBe(false);
  });

  it('is not offered to a guest, on the wishlist, with ratings off, or for a brand with no usable name', async () => {
    authUserId.mockResolvedValue(null);
    await render({ editItem: editItem({ brand: 'Zara' }) });
    expect(hasText('Rate Zara')).toBe(false);
    act(() => tree.unmount());

    authUserId.mockResolvedValue('user-1');
    await render({ isWishlist: true });
    await typeBrand('Zara');
    expect(hasText('Rate Zara')).toBe(false);
    act(() => tree.unmount());

    await render();
    await typeBrand('!');
    expect(texts().some(t => t.startsWith('Rate '))).toBe(false);
    act(() => tree.unmount());

    mockFlags.ratings = false;
    await render();
    await typeBrand('Zara');
    expect(hasText('Rate Zara')).toBe(false);
  });

  it('saves the stars for a new item after the item, keeping an existing rating\'s detail scores', async () => {
    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 3, quality: 4, fitConsistency: 2, value: 5 })));
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    expect(chip(scaleStepLabel('Rate Zara', 3)).props.accessibilityState.selected).toBe(true);
    await tap(scaleStepLabel('Rate Zara', 5));
    await pressSave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(saveBrand).toHaveBeenCalledTimes(1);
    expect(saveBrand).toHaveBeenCalledWith('Zara', { overall: 5, quality: 4, fitConsistency: 2, value: 5 });
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(saveBrand.mock.invocationCallOrder[0]);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('saves the stars of a brand not rated before, with no detail scores', async () => {
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    await tap(scaleStepLabel('Rate Zara', 4));
    await pressSave();
    expect(saveBrand).toHaveBeenCalledWith('Zara', { overall: 4, quality: null, fitConsistency: null, value: null });
  });

  it('saves nothing when no stars were chosen, or the stored ones were left as they are', async () => {
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    await pressSave();
    expect(saveBrand).not.toHaveBeenCalled();
    act(() => tree.unmount());

    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 3 })));
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    await tap(scaleStepLabel('Rate Zara', 3));
    await pressSave();
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it('never blocks the item when the brand rating fails: the same gentle message', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    saveBrand.mockRejectedValue(new Error('not_a_brand_owner'));
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    await tap(scaleStepLabel('Rate Zara', 4));
    await pressSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Saved', 'We couldn’t save the rating; you can rate it from the item.');
  });

  it('sends one message, not two, when the item rating and the brand rating both fail', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    saveItem.mockRejectedValue(new Error('x'));
    saveBrand.mockRejectedValue(new Error('y'));
    await render();
    await typeName('Silk blouse');
    await typeBrand('Zara');
    await tap(scaleStepLabel('Rate Zara', 4));
    await tap(scaleStepLabel('Overall rating', 4));
    await pressSave();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the stored brand rating when editing, and cannot clear it', async () => {
    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 2 })));
    await render({ editItem: editItem({ brand: 'Zara' }) });
    expect(chip(scaleStepLabel('Rate Zara', 2)).props.accessibilityState.selected).toBe(true);
    await tap(scaleStepLabel('Rate Zara', 2));
    expect(chip(scaleStepLabel('Rate Zara', 2)).props.accessibilityState.selected).toBe(true);
  });

  it('offers More when editing a piece of that brand, and opens the brand sheet on the stored rating', async () => {
    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 2 })));
    await render({ editItem: editItem({ brand: 'Zara' }) });
    expect(has('More about your Zara rating')).toBe(true);
    expect(tree.root.findAllByType(Modal).some(m => m.props.visible)).toBe(false);
    await tap('More about your Zara rating');
    await flush();
    expect(tree.root.findAllByType(Modal).some(m => m.props.visible)).toBe(true);
    expect(texts()).toContain('Rate Zara');
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it('saves stars chosen in the form before More opens the sheet, so the sheet starts on them', async () => {
    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 2 })));
    await render({ editItem: editItem({ brand: 'Zara' }) });
    await tap(scaleStepLabel('Rate Zara', 5));
    loadBrand.mockResolvedValue(summary(brandRatingRow({ overall: 5 })));
    await tap('More about your Zara rating');
    await flush();
    expect(saveBrand).toHaveBeenCalledWith('Zara', { overall: 5, quality: 4, fitConsistency: 2, value: 5 });
    expect(tree.root.findAllByType(Modal).some(m => m.props.visible)).toBe(true);
    // Saved already: Save on the form does not send it again.
    saveBrand.mockClear();
    await pressSave('Update Item');
    expect(saveBrand).not.toHaveBeenCalled();
  });

  it('has no More link when the brand typed is not the one the piece was saved with', async () => {
    await render({ editItem: editItem({ brand: 'Zara' }) });
    await typeBrand('Mango');
    expect(has('More about your Mango rating')).toBe(false);
  });
});

// ─── "Not right?" on the photo reading ──────────────────────────────────────

describe('the hint for the photo reading', () => {
  const HINT = { label: 'Tell us what it is' };

  it('shows a one-line box in the AI result, and reads the photo again with those words', async () => {
    analyze.mockResolvedValue(analysis({ category: 'tops', subtype: 't-shirt', confidence: { category: 0.9 } }));
    await render();
    await addPhoto('file:///photo.jpg');
    expect(analyze).toHaveBeenLastCalledWith('file:///photo.jpg');
    expect(input(HINT).props.placeholder).toBe('Not right? Tell us what it is');
    expect(input(HINT).props.returnKeyType).toBe('done');
    expect(input(HINT).props.maxLength).toBe(120);
    expect(chip('Read the photo again with this description').props.disabled).toBe(true);

    analyze.mockResolvedValue(analysis({ category: 'shoes', type: 'Ankle boots', color: 'black', confidence: { category: 0.95, color: 0.9 } }));
    await typeInto(HINT, '  leather ankle boots ');
    await tap('Read the photo again with this description');
    await flush();

    expect(analyze).toHaveBeenLastCalledWith('file:///photo.jpg', { title: 'leather ankle boots' });
    // Applied through the same path as "Detect category, type and colour from photo".
    expect(isOn('Shoes')).toBe(true);
    expect(isOn('Tops')).toBe(false);
  });

  it('keeps what the person typed in the box after the result comes back', async () => {
    analyze.mockResolvedValue(analysis({ category: 'tops', confidence: { category: 0.9 } }));
    await render();
    await addPhoto();
    await typeInto(HINT, 'wool coat');
    await tap('Read the photo again with this description');
    await flush();
    expect(input(HINT).props.value).toBe('wool coat');
  });

  it('is not offered to a guest, or when the reading is off', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'ai_off' });
    await render();
    await addPhoto();
    expect(tree.root.findAllByType(TextInput).some(i => i.props.accessibilityLabel === 'Tell us what it is')).toBe(false);
  });

  it('is offered when the reading found nothing, so it can be told', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'other' });
    await render();
    await addPhoto();
    expect(tree.root.findAllByType(TextInput).some(i => i.props.accessibilityLabel === 'Tell us what it is')).toBe(true);
  });
});
