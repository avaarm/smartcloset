/**
 * Add / Edit Item: the item type (a "Tote" in Bags, "Ankle boots" in Shoes), the
 * New / Used price fields, the photo re-detect link, and the wishlist form
 * (no purchase date, no value of its own).
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) } },
}));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(async () => undefined),
  updateClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/imageStorage', () => ({
  copyImageToPermanentStorage: jest.fn(async (uri: string) => uri),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: jest.fn(async () => 'user-1'),
}));
jest.mock('../../src/services/productContributions', () => ({
  lookupKnowledgeBase: jest.fn(async () => []),
  recordContribution: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/imageRecognition', () => ({
  ...jest.requireActual('../../src/services/imageRecognition'),
  analyzeClothingImage: jest.fn(),
}));
// This file is about the type, size and condition fields; tag scanning has its own tests.
jest.mock('../../src/config/ratingFlags', () => ({
  TAG_SCAN_ENABLED: false,
  RATINGS_ENABLED: false,
  BRAND_INSIGHTS_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => false,
  tagScanActive: () => false,
  brandInsightsActive: () => false,
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Alert, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import * as itemValue from '../../src/utils/itemValue';
import { saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage } from '../../src/services/lensSearchService';
import { lookupKnowledgeBase } from '../../src/services/productContributions';

const save = saveClothingItem as jest.Mock;
const update = updateClothingItem as jest.Mock;
const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;

const HINT = {
  paid: 'Estimated from the price you paid',
  retail: 'Estimated from the retail price',
  match: 'Estimated from the matched product price',
  brandCategory: 'Estimated from the brand and category',
  category: 'Estimated from the category. Add a brand or price for a better estimate',
  user: 'Your value',
};

let tree: renderer.ReactTestRenderer;
const text = () => JSON.stringify(tree.toJSON());
/** Every Text element's content as one string, as the owner reads it. */
const sentences = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => React.Children.toArray(n.props.children).join(''));
const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const render = async (params: any = {}) => {
  await act(async () => {
    tree = renderer.create(<AddClothingScreen navigation={{ goBack: jest.fn() } as any} route={{ params }} />);
  });
  await flush();
};

const input = (label: string) => tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === label)!;
const typeInto = (label: string, value: string) =>
  act(async () => {
    input(label).props.onChangeText(value);
  });
const shown = () => input('Estimated value').props.value as string;
const typeName = (value: string) =>
  act(async () => {
    tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Item Name')!.props.onChangeText(value);
  });

const textNodes = (label: string) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label);
const pressableWithText = (label: string) => {
  let node: any = textNodes(label)[0];
  if (!node) throw new Error(`no text "${label}"`);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`nothing to press for "${label}"`);
  return node;
};
const press = (label: string) => act(async () => pressableWithText(label).props.onPress());
const pressSave = async (label = 'Save Item') => {
  await press(label);
  await flush();
};
const chip = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];

/** What the form should offer for these inputs, straight from the estimator. */
const estimateFor = (over: Partial<itemValue.ValueInputs> = {}, matchedPrice?: number) =>
  itemValue.estimateItemValue(
    { name: '', category: 'tops', brand: '', materials: [], tags: [], ...over },
    { matchedPrice },
  );

const addPhoto = async (uri = 'file:///photo.jpg') => {
  (ImagePicker.launchImageLibrary as jest.Mock).mockImplementation((_o: any, cb: (r: any) => void) =>
    cb({ assets: [{ uri }] }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const photoArea = tree.root.findAllByType(TouchableOpacity).find(t => (t.props.style as any)?.height === 250);
  await act(async () => {
    photoArea!.props.onPress();
  });
  const buttons: any[] = alert.mock.calls[alert.mock.calls.length - 1][2] as any[];
  await act(async () => {
    buttons.find(b => b.text === 'Choose from Library').onPress();
  });
  await flush();
  alert.mockRestore();
};

const savedItem = (item: any = {}) => ({
  id: 'item-1',
  name: 'Wool coat',
  category: 'outerwear',
  color: 'Grey',
  season: ['fall', 'winter'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...item,
});

let estimateSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (lookupKnowledgeBase as jest.Mock).mockResolvedValue([]);
  search.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
  estimateSpy = jest.spyOn(itemValue, 'estimateItemValue');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

const typeChip = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const hasChip = (label: string) => typeChip(label).length > 0;
const chipOn = (label: string) => {
  const c = typeChip(label)[0];
  return !!(c?.props.accessibilityState?.checked || c?.props.accessibilityState?.selected);
};
const pickCategory = (label: string) => act(async () => chip(label).props.onPress());
const pickType = (label: string) => act(async () => typeChip(label)[0].props.onPress());

const real = (over: any = {}) => ({
  isReal: true,
  category: 'shoes',
  subtype: 'knee-high boots',
  color: 'beige',
  colors: [{ name: 'beige', hex: '#D9C3A0', weight: 0.9 }],
  confidence: { category: 0.95, color: 0.92, brand: 0.2 },
  rawLabels: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (lookupKnowledgeBase as jest.Mock).mockResolvedValue([]);
  search.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

describe('the Type chips', () => {
  it("offer the types of the chosen category and follow it when the category changes", async () => {
    await render();
    expect(hasChip('T-shirt')).toBe(true);
    expect(hasChip('Tote')).toBe(false);
    await pickCategory('Bags');
    expect(hasChip('Tote')).toBe(true);
    expect(hasChip('T-shirt')).toBe(false);
  });

  it('save the picked type with the item', async () => {
    await render();
    await pickCategory('Bags');
    await pickType('Crossbody');
    await typeName('Mini crossbody');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'bags', subcategory: 'Crossbody' }));
  });

  it('save an empty type when none is picked', async () => {
    await render();
    await typeName('Plain tee');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ subcategory: '' }));
  });

  it("drop a menu type that does not belong to the category the owner switches to", async () => {
    await render();
    await pickCategory('Bags');
    await pickType('Tote');
    expect(chipOn('Tote')).toBe(true);
    await pickCategory('Shoes');
    await typeName('Boots');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'shoes', subcategory: '' }));
  });

  it('keep a type the owner typed themselves when the category changes', async () => {
    await render();
    await pickCategory('Bags');
    await pickType('Other');
    await act(async () => {
      tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Type of item')!.props.onChangeText('Doctor bag');
    });
    await pickCategory('Accessories');
    await typeName('Case');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ subcategory: 'Doctor bag' }));
  });
});

describe('photo analysis and the type', () => {
  it("fills the category, the type and the colour from the photo", async () => {
    analyze.mockResolvedValue(real());
    await render();
    await addPhoto();
    expect(chipOn('Shoes')).toBe(true);
    expect(chipOn('Knee-high boots')).toBe(true);
    await pressSave();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'shoes', subcategory: 'Knee-high boots', color: 'Beige' }),
    );
  });

  it('uses the type the analysis names itself when it has one', async () => {
    analyze.mockResolvedValue(real({ category: 'bags', subtype: 'structured shopper', type: 'Crossbody' }));
    await render();
    await addPhoto();
    expect(chipOn('Crossbody')).toBe(true);
  });

  it('leaves the type empty when nothing on the menu fits', async () => {
    analyze.mockResolvedValue(real({ category: 'bags', subtype: 'Andiamo' }));
    await render();
    await addPhoto();
    expect(chipOn('Bags')).toBe(true);
    for (const label of ['Handbag', 'Tote', 'Crossbody', 'Clutch', 'Backpack']) expect(chipOn(label)).toBe(false);
  });

  it("does not put a type the owner picked aside for the photo's", async () => {
    analyze.mockImplementation(async () => {
      await pickCategory('Shoes');
      await pickType('Sandals');
      return real();
    });
    await render();
    await addPhoto();
    expect(chipOn('Sandals')).toBe(true);
    expect(chipOn('Knee-high boots')).toBe(false);
  });

  it("does not give a type for a category the owner chose instead of the photo's", async () => {
    analyze.mockImplementation(async () => {
      await pickCategory('Accessories');
      return real();
    });
    await render();
    await addPhoto();
    expect(chipOn('Accessories')).toBe(true);
    expect(chipOn('Knee-high boots')).toBe(false);
  });

  it("names the type of a picked community match (when nothing else gave one)", async () => {
    analyze.mockResolvedValue({ isReal: true, confidence: {}, category: 'bags' });
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([
      { name: 'Andiamo crossbody bag', category: 'bags', confirmationCount: 3, confidence: 0.9 },
    ]);
    await render();
    await addPhoto();
    await press('Andiamo crossbody bag');
    expect(chipOn('Crossbody')).toBe(true);
  });
});

describe('detecting again from the photo of an item that already exists', () => {
  const wrong = savedItem({
    name: 'Bottega bag',
    category: 'tops',
    color: '',
    userImage: 'https://example.com/bag.jpg',
    subcategory: undefined,
  });

  it('replaces a wrong category, adds the type and the colour, and leaves the name and prices alone', async () => {
    analyze.mockResolvedValue(
      real({ category: 'bags', subtype: 'structured tote', color: 'burgundy', brand: 'Bottega Veneta', confidence: { category: 0.95, color: 0.92, brand: 0.9 } }),
    );
    await render({ editItem: { ...wrong, cost: 3000, retailCost: 4000 } });
    expect(chipOn('Tops')).toBe(true);
    await act(async () => pressableWithText('Detect category, type and colour from photo').props.onPress());
    await flush();
    expect(chipOn('Bags')).toBe(true);
    expect(chipOn('Tote')).toBe(true);
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bottega bag',
        category: 'bags',
        subcategory: 'Tote',
        color: 'Burgundy',
        brand: 'Bottega Veneta',
        cost: 3000,
        retailCost: 4000,
      }),
    );
  });

  it("does not start a match search or touch the form when the analysis is not real", async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'other' });
    await render({ editItem: wrong });
    await act(async () => pressableWithText('Detect category, type and colour from photo').props.onPress());
    await flush();
    expect(chipOn('Tops')).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });

  it('does not offer it before there is a photo', async () => {
    await render();
    expect(textNodes('Detect category, type and colour from photo')).toHaveLength(0);
  });

  it('keeps the saved type when the item is opened and saved again', async () => {
    await render({ editItem: savedItem({ category: 'bags', subcategory: 'Tote' }) });
    expect(chipOn('Tote')).toBe(true);
    await pressSave('Update Item');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ subcategory: 'Tote' }));
  });

  it('clears the saved type when the lit chip is tapped', async () => {
    await render({ editItem: savedItem({ category: 'bags', subcategory: 'Tote' }) });
    await pickType('Tote');
    expect(chipOn('Tote')).toBe(false);
    await pressSave('Update Item');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ subcategory: '' }));
  });
});

describe('prices on the form', () => {
  it('are New price on the left and Used price on the right, for the wardrobe and the wishlist', async () => {
    for (const params of [{}, { isWishlist: true }]) {
      await render(params);
      const labels = tree.root
        .findAllByType(TextInput)
        .map(i => i.props.accessibilityLabel)
        .filter(l => l === 'New price' || l === 'Used price');
      expect(labels).toEqual(['New price', 'Used price']);
      act(() => tree.unmount());
    }
  });

  it('save a wishlist item with the new price as retailCost and the used price as cost', async () => {
    await render({ isWishlist: true });
    await typeInto('New price', '4,000');
    await typeInto('Used price', '3000');
    await typeName('Andiamo');
    await pressSave('Save to Wishlist');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ isWishlist: true, retailCost: 4000, cost: 3000, estimatedValue: undefined }),
    );
  });

  it('say what buying used saves on a wishlist', async () => {
    await render({ isWishlist: true });
    await typeInto('New price', '400');
    await typeInto('Used price', '300');
    expect(sentences().some(s => s.includes('Buying used saves $100 (25% off new)'))).toBe(true);
  });
});

describe('the wishlist form', () => {
  it('has no purchase date, since nothing on it has been bought', async () => {
    await render({ isWishlist: true });
    expect(textNodes('Purchase Date')).toHaveLength(0);
    act(() => tree.unmount());
    await render();
    expect(textNodes('Purchase Date')).toHaveLength(1);
  });
});

describe('size and condition', () => {
  it('are saved with a new item, the size cleaned', async () => {
    await render();
    await typeInto('Size', '  eu 38 ');
    await act(async () => chip('Like new').props.onPress());
    await typeName('Silk shirt');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ size: 'eu 38', condition: 'like_new' }));
  });

  it('are empty and unset when nothing is entered', async () => {
    await render();
    await typeName('Plain tee');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ size: '', condition: null }));
  });

  it('come back when an item is edited, and can be cleared', async () => {
    await render({ editItem: savedItem({ size: 'M', condition: 'good' }) });
    expect(input('Size').props.value).toBe('M');
    expect(chip('Good').props.accessibilityState).toEqual({ selected: true });
    await typeInto('Size', '');
    await act(async () => chip('Good').props.onPress()); // tapping the lit chip clears it
    await pressSave('Update Item');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ size: '', condition: null }));
  });

  it('keep the tag fields of an edited item out of the write, so they are left as saved', async () => {
    await render({ editItem: savedItem({ careInstructions: ['Dry clean only'], originCountry: 'Italy', tagText: '100% wool' }) });
    await pressSave('Update Item');
    const written = update.mock.calls[update.mock.calls.length - 1][0];
    expect('careInstructions' in written).toBe(false);
    expect('originCountry' in written).toBe(false);
    expect('tagText' in written).toBe(false);
  });
});
