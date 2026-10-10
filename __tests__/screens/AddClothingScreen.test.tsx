/**
 * The Add / Edit Item form: the eleven category chips, season and occasion
 * choices that save and reload faithfully, and an "AI Suggestions" box that
 * says what the form says.
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
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import MatchPickerSheet from '../../src/screens/MatchPickerSheet';
import MaterialsEditor from '../../src/components/MaterialsEditor';
import { saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage } from '../../src/services/lensSearchService';
import { lookupKnowledgeBase } from '../../src/services/productContributions';

const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;
const save = saveClothingItem as jest.Mock;
const update = updateClothingItem as jest.Mock;

const ALL_CATEGORY_LABELS = [
  'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes',
  'Bags', 'Jewelry', 'Hats', 'Activewear', 'Swimwear', 'Accessories',
];

let tree: renderer.ReactTestRenderer;
const text = () => JSON.stringify(tree.toJSON());
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

/** A chip (radio or checkbox) by its label. */
const chip = (label: string) => {
  const found = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no chip "${label}"`);
  return found[0];
};
const isOn = (label: string): boolean => {
  const state = chip(label).props.accessibilityState || {};
  return !!(state.selected ?? state.checked);
};
const tap = (label: string) => act(async () => chip(label).props.onPress());

/** Whatever shows `label`, found by its text and walked up to the pressable around it. */
const pressableWithText = (label: string) => {
  const t = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label)[0];
  let node: any = t;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`nothing to press for "${label}"`);
  return node;
};

const typeName = (value: string) =>
  act(async () => {
    tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Item Name')!.props.onChangeText(value);
  });
const field = (placeholder: string) =>
  tree.root.findAllByType(TextInput).find(i => i.props.placeholder === placeholder)!;
const pressSave = async (label = 'Save Item') => {
  await act(async () => {
    pressableWithText(label).props.onPress();
  });
  await flush();
};

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
};

const analysis = (over: any = {}) => ({
  isReal: true,
  confidence: {},
  category: 'shoes',
  subtype: 'knee-high boots',
  color: 'tan',
  ...over,
});

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

describe('category chips', () => {
  it('shows all eleven categories, with no "All" (an item has exactly one)', async () => {
    await render();
    for (const label of ALL_CATEGORY_LABELS) expect(chip(label)).toBeDefined();
    expect(() => chip('All')).toThrow();
    expect(() => chip('All categories')).toThrow();
    const group = tree.root.findAll(n => n.props.accessibilityLabel === 'Category' && n.props.accessibilityRole === 'radiogroup')[0];
    expect(group.props.children).toHaveLength(11);
  });

  it('starts on Tops and changes when another is tapped, saving the new id', async () => {
    await render();
    expect(isOn('Tops')).toBe(true);
    await tap('Bags');
    expect(isOn('Bags')).toBe(true);
    expect(isOn('Tops')).toBe(false);

    await typeName('Andiamo shopper');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'bags', name: 'Andiamo shopper' }));
  });

  it('preselects the category the AI suggests, unless the user already chose one', async () => {
    analyze.mockResolvedValue(analysis({ category: 'shoes', confidence: { category: 0.92 } }));
    await render();
    await addPhoto();
    expect(isOn('Shoes')).toBe(true);
    expect(isOn('Tops')).toBe(false);
  });

  it('keeps the category the user picked when the analysis finishes after', async () => {
    analyze.mockResolvedValue(analysis({ category: 'shoes', confidence: { category: 0.92 } }));
    await render();
    await tap('Hats');
    await addPhoto();
    expect(isOn('Hats')).toBe(true);
    expect(isOn('Shoes')).toBe(false);
  });

  it('keeps the category of an item being edited when a photo is analysed', async () => {
    analyze.mockResolvedValue(analysis({ category: 'shoes', confidence: { category: 0.92 } }));
    await render({ editItem: editItem() });
    await addPhoto();
    expect(isOn('Outerwear')).toBe(true);
  });

  it('applies the category of a picked community match, but not over the one the user chose', async () => {
    const kb = {
      name: 'Andiamo large shopper',
      category: 'bags',
      confirmationCount: 3,
      confidence: 0.9,
    };
    analyze.mockResolvedValue(analysis({ category: 'accessories', confidence: { category: 0.6 } }));
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([kb]);
    await render();
    await addPhoto();
    expect(isOn('Accessories')).toBe(true); // the AI's guess, nothing chosen yet
    await act(async () => pressableWithText('Andiamo large shopper').props.onPress());
    expect(isOn('Bags')).toBe(true);

    tree.unmount();
    await render();
    await tap('Hats');
    await addPhoto();
    await act(async () => pressableWithText('Andiamo large shopper').props.onPress());
    expect(isOn('Hats')).toBe(true);
    expect(isOn('Bags')).toBe(false);
  });

  it('ignores a match whose category is not one of ours', async () => {
    analyze.mockResolvedValue(analysis({ category: 'tops', confidence: { category: 0.9 } }));
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([
      { name: 'Mystery thing', category: 'banana', confirmationCount: 1, confidence: 0.5 },
    ]);
    await render();
    await addPhoto();
    await act(async () => pressableWithText('Mystery thing').props.onPress());
    expect(isOn('Tops')).toBe(true);
  });
});

describe('season', () => {
  it('has an "All seasons" chip that lights all four, and shows only that chip when everything is on', async () => {
    await render();
    expect(isOn('All seasons')).toBe(false);
    await tap('All seasons');
    expect(isOn('All seasons')).toBe(true);
    expect(isOn('Spring')).toBe(false); // "All seasons" stands for them
    await typeName('Linen shirt');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ season: ['spring', 'summer', 'fall', 'winter'] }));
  });

  it('lets several seasons be picked and saves them all', async () => {
    await render();
    await tap('Winter');
    await tap('Fall');
    expect(isOn('Fall')).toBe(true);
    expect(isOn('Winter')).toBe(true);
    await typeName('Scarf');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ season: ['fall', 'winter'] }));
  });

  it('round-trips an item with several seasons on edit (regression: only the first survived)', async () => {
    await render({ editItem: editItem({ season: ['fall', 'winter'] }) });
    expect(isOn('Fall')).toBe(true);
    expect(isOn('Winter')).toBe(true);
    expect(isOn('Spring')).toBe(false);
    expect(isOn('All seasons')).toBe(false);
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1', season: ['fall', 'winter'] }));
  });

  it('round-trips an all-seasons item on edit', async () => {
    await render({ editItem: editItem({ season: ['winter', 'spring', 'summer', 'fall'] }) });
    expect(isOn('All seasons')).toBe(true);
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ season: ['spring', 'summer', 'fall', 'winter'] }));
  });

  it('reads an item saved with the single value "all" as all seasons', async () => {
    await render({ editItem: editItem({ season: ['all'] }) });
    expect(isOn('All seasons')).toBe(true);
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ season: ['spring', 'summer', 'fall', 'winter'] }));
  });

  it('clears the seasons on edit when the user unticks them all (regression: the old value stayed)', async () => {
    await render({ editItem: editItem({ season: ['fall', 'winter'] }) });
    await tap('Fall');
    await tap('Winter');
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ season: [] }));
  });

  it('narrows to one season when one is tapped while "All seasons" is on', async () => {
    await render({ editItem: editItem({ season: ['spring', 'summer', 'fall', 'winter'] }) });
    await tap('Summer');
    expect(isOn('All seasons')).toBe(false);
    expect(isOn('Summer')).toBe(true);
    expect(isOn('Spring')).toBe(false);
  });

  it('fills every season the AI names, not just the first', async () => {
    analyze.mockResolvedValue(analysis({ season: ['Autumn', 'winter'] }));
    await render();
    await addPhoto();
    expect(isOn('Fall')).toBe(true);
    expect(isOn('Winter')).toBe(true);
    expect(isOn('Spring')).toBe(false);
  });

  it('does not replace seasons the user already picked', async () => {
    analyze.mockResolvedValue(analysis({ season: ['summer'] }));
    await render();
    await tap('Winter');
    await addPhoto();
    expect(isOn('Winter')).toBe(true);
    expect(isOn('Summer')).toBe(false);
  });
});

describe('occasion', () => {
  it('starts on "Any occasion" and saves no occasion', async () => {
    await render();
    expect(isOn('Any occasion')).toBe(true);
    expect(isOn('Casual')).toBe(false);
    await typeName('Tee');
    await pressSave();
    expect(save.mock.calls[0][0].occasion).toBeUndefined();
  });

  it('picks one occasion, and goes back to "Any occasion" to clear it', async () => {
    await render({ editItem: editItem({ occasion: 'formal' }) });
    expect(isOn('Formal')).toBe(true);
    expect(isOn('Any occasion')).toBe(false);

    await tap('Business');
    expect(isOn('Business')).toBe(true);
    expect(isOn('Formal')).toBe(false);

    await tap('Any occasion');
    expect(isOn('Any occasion')).toBe(true);
    await pressSave('Update Item');
    expect(update.mock.calls[0][0].occasion).toBeUndefined();
  });

  it('offers every occasion the app has', async () => {
    await render();
    for (const label of ['Casual', 'Formal', 'Business', 'Sports', 'Party', 'Everyday']) expect(chip(label)).toBeDefined();
  });

  it('fills an occasion the AI is confident about, and ignores one the form has no chip for', async () => {
    analyze.mockResolvedValue(analysis({ occasion: 'party', confidence: { occasion: 0.8 } }));
    await render();
    await addPhoto();
    expect(isOn('Party')).toBe(true);

    tree.unmount();
    analyze.mockResolvedValue(analysis({ occasion: 'date night', confidence: { occasion: 0.9 } }));
    await render();
    await addPhoto();
    expect(isOn('Any occasion')).toBe(true);
  });
});

describe('AI Suggestions box', () => {
  it('words each row with a space before the bracket and the category as a label', async () => {
    analyze.mockResolvedValue(
      analysis({
        category: 'shoes',
        color: 'brown',
        material: 'leather',
        occasion: 'casual',
        confidence: { category: 0.97, color: 0.88, material: 0.84, occasion: 0.76 },
      }),
    );
    await render();
    await addPhoto();

    const t = text();
    expect(t).toContain('AI Suggestions');
    expect(t).toContain('Category: Shoes (97% confidence)');
    expect(t).toContain('Color: Brown (88% confidence)');
    expect(t).toContain('Material: Leather (84% confidence)');
    expect(t).toContain('Occasion: Casual (76% confidence)');
    expect(t).not.toMatch(/[a-z]\(\d+% confidence\)/); // the old "accessories(97% confidence)"
  });

  it('shows the category the form uses, by its label, for the new categories too', async () => {
    analyze.mockResolvedValue(analysis({ category: 'bags', confidence: { category: 0.9 } }));
    await render();
    await addPhoto();
    expect(isOn('Bags')).toBe(true);
    expect(text()).toContain('Category: Bags (90% confidence)');
  });

  it('hides rows with low confidence or no value', async () => {
    analyze.mockResolvedValue(
      analysis({
        category: 'shoes',
        color: 'tan',
        material: 'suede',
        confidence: { category: 0.9, color: 0.3, material: 0.49 },
      }),
    );
    await render();
    await addPhoto();
    expect(text()).toContain('Category: Shoes (90% confidence)');
    expect(text()).not.toContain('Color: Tan');
    expect(text()).not.toContain('Material: Suede');
    expect(text()).not.toContain('Brand:');
  });

  it('does not appear when nothing is confident enough', async () => {
    analyze.mockResolvedValue(analysis({ confidence: { category: 0.2, color: 0.1 } }));
    await render();
    await addPhoto();
    expect(text()).not.toContain('AI Suggestions');
  });

  it('does not appear when the analysis was not real', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: { category: 0.99 }, category: 'tops', unavailableReason: 'other' });
    await render();
    await addPhoto();
    expect(text()).not.toContain('AI Suggestions');
  });

  it('does not contradict the form once the user changes a value', async () => {
    analyze.mockResolvedValue(
      analysis({ category: 'accessories', color: 'brown', confidence: { category: 0.97, color: 0.88 } }),
    );
    await render();
    await addPhoto();
    await tap('Shoes');
    expect(text()).toContain('Category: Accessories (97% confidence) · set to Shoes');
  });
});

describe('colour from the photo', () => {
  it('fills the Color field when the AI is sure of the colour', async () => {
    analyze.mockResolvedValue(analysis({ color: 'tan', confidence: { color: 0.8 } }));
    await render();
    await addPhoto();
    expect(field('Color').props.value).toBe('Tan');
    expect(field('Item Name').props.value).toBe('Tan Knee-High Boots');
  });

  it('leaves Color empty when the AI is only guessing (regression: always filled)', async () => {
    analyze.mockResolvedValue(analysis({ color: 'ivory', confidence: { color: 0.35 } }));
    await render();
    await addPhoto();
    expect(field('Color').props.value).toBe('');
    // The name does not carry the weak colour either.
    expect(field('Item Name').props.value).toBe('Knee-High Boots');
  });

  it('holds back a colour the AI Suggestions box would not offer, so the two agree', async () => {
    analyze.mockResolvedValue(analysis({ color: 'ivory', confidence: { color: 0.45 } }));
    await render();
    await addPhoto();
    expect(field('Color').props.value).toBe('');
    expect(text()).not.toContain('Color: Ivory');
  });

  it('keeps the swatches so a weak colour can still be picked by hand', async () => {
    analyze.mockResolvedValue(
      analysis({
        color: 'ivory',
        colors: [{ name: 'ivory', hex: '#fffff0' }, { name: 'tan', hex: '#d2b48c' }],
        confidence: { color: 0.35 },
      }),
    );
    await render();
    await addPhoto();
    expect(field('Color').props.value).toBe('');
    await act(async () => pressableWithText('tan').props.onPress());
    expect(field('Color').props.value).toBe('Tan');
  });

  it('does not replace a colour the user already typed', async () => {
    analyze.mockResolvedValue(analysis({ color: 'tan', confidence: { color: 0.9 } }));
    await render();
    await act(async () => {
      field('Color').props.onChangeText('Cognac');
    });
    await addPhoto();
    expect(field('Color').props.value).toBe('Cognac');
  });
});

describe('searching the web for matches', () => {
  it('passes the detected brand, colour, type and category as hints', async () => {
    analyze.mockResolvedValue(
      analysis({
        brand: 'Stuart Weitzman',
        color: 'tan',
        subtype: 'knee-high boots',
        category: 'shoes',
        confidence: { brand: 0.9, color: 0.8, category: 0.95 },
      }),
    );
    await render();
    await addPhoto('file:///boot.jpg');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('file:///boot.jpg', {
      brand: 'Stuart Weitzman',
      color: 'tan',
      subtype: 'knee-high boots',
      category: 'shoes',
    });
  });
});

describe('spacing around the match sheet and the materials editor', () => {
  // Both children carry their own outer margin; the screen cancels it with a
  // negative margin on a wrapper. If a child's margin changes and the screen's
  // offset does not, one of these fails.
  const hostAncestor = (node: renderer.ReactTestInstance) => {
    let n: renderer.ReactTestInstance | null = node.parent;
    while (n && (n.type as unknown) !== 'View') n = n.parent;
    return n!;
  };
  const styleOf = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) ?? {};
  const rootOf = (component: React.ComponentType<any>) =>
    tree.root.findByType(component).findAll(n => (n.type as unknown) === 'View')[0];

  it('cancels the match sheet\'s side margin and sits one field-gap below the photo callouts', async () => {
    analyze.mockResolvedValue(analysis());
    await render();
    await addPhoto();

    const sheet = styleOf(rootOf(MatchPickerSheet));
    const wrap = styleOf(hostAncestor(tree.root.findByType(MatchPickerSheet)));
    expect((wrap.marginHorizontal ?? 0) + (sheet.marginHorizontal ?? 0)).toBe(0);

    const banner = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === '🔍 AI Detected')[0];
    const calloutGap = styleOf(hostAncestor(banner)).marginTop;
    expect(calloutGap).toBeGreaterThan(0);
    expect((wrap.marginTop ?? 0) + (sheet.marginTop ?? 0)).toBe(calloutGap);
  });

  it('cancels the materials editor\'s top margin so the form\'s section gap is the only gap', async () => {
    await render();
    const editor = styleOf(rootOf(MaterialsEditor));
    const wrap = styleOf(hostAncestor(tree.root.findByType(MaterialsEditor)));
    expect((wrap.marginTop ?? 0) + (editor.marginTop ?? 0)).toBe(0);
  });
});

describe('wishlist', () => {
  it('says it is adding to the wishlist and saves the item as one', async () => {
    await render({ isWishlist: true });
    expect(text()).toContain('Add to Wishlist');
    await typeName('Dream bag');
    await pressSave('Save to Wishlist');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ isWishlist: true }));
  });

  it('is a plain "Add Item" otherwise', async () => {
    await render();
    expect(text()).toContain('Add Item');
    expect(text()).not.toContain('Add to Wishlist');
  });
});
