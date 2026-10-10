/**
 * Add / Edit Item: the editable estimated dollar value. It starts as an
 * estimate worked out from the form (price paid, retail price, a picked
 * match's price, brand and category), follows those until the owner types a
 * value of their own, and then stays theirs. A wishlist item has no value of
 * its own (it is worth its price).
 *
 * The numbers come from estimateItemValue itself, so these tests check that the
 * form wires the right inputs and shows/saves the result, whatever the formula.
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

describe('estimate from the form', () => {
  it('starts from the category alone when there is no price and no brand, and says so', async () => {
    await render();
    expect(shown()).toBe(String(estimateFor().value));
    expect(text()).toContain(HINT.category);
    expect(text()).not.toContain('from the brand and category');
    expect(text()).not.toContain('Reset to estimate');
  });

  it('says it used the brand once a known brand is typed', async () => {
    await render();
    await act(async () => {
      tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Brand')!.props.onChangeText('Gucci');
    });
    expect(text()).toContain(HINT.brandCategory);
  });

  it('follows the price paid as it is typed', async () => {
    await render();
    await typeInto('Used price', '80');
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 80 }), { matchedPrice: undefined });
    expect(shown()).toBe(String(estimateFor({ cost: 80 }).value));
    expect(text()).toContain(HINT.paid);

    await typeInto('Used price', '120');
    expect(shown()).toBe(String(estimateFor({ cost: 120 }).value));
  });

  it('falls back to the new price when nothing was paid, and the paid price wins when both are there', async () => {
    await render();
    await typeInto('New price', '300');
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ retailCost: 300 }), expect.anything());
    expect(shown()).toBe(String(estimateFor({ retailCost: 300 }).value));
    expect(text()).toContain(HINT.retail);

    await typeInto('Used price', '90');
    expect(shown()).toBe(String(estimateFor({ cost: 90, retailCost: 300 }).value));
    expect(text()).toContain(HINT.paid);
    expect(text()).not.toContain(HINT.retail);

    await typeInto('Used price', '');
    expect(text()).toContain(HINT.retail);
  });

  it('reads thousands separators in a price', async () => {
    await render();
    await typeInto('Used price', '1,299');
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 1299 }), expect.anything());
  });

  it('passes the brand and the category it is for', async () => {
    await render();
    await act(async () => {
      tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Brand')!.props.onChangeText(' Gucci ');
    });
    await act(async () => chip('Shoes').props.onPress());
    expect(estimateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ brand: 'Gucci', category: 'shoes' }),
      expect.anything(),
    );
    expect(shown()).toBe(String(estimateFor({ brand: 'Gucci', category: 'shoes' }).value));
  });

  it('is saved with the item, marked as an estimate', async () => {
    await render();
    await typeInto('Used price', '80');
    await typeName('Linen shirt');
    await pressSave();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: 80,
        estimatedValue: estimateFor({ cost: 80, name: 'Linen shirt' }).value,
        valueSource: 'estimate',
      }),
    );
  });
});

describe('a picked match', () => {
  const kb = (over: any = {}) => ({
    name: 'Andiamo large shopper',
    category: 'bags',
    confirmationCount: 3,
    confidence: 0.9,
    ...over,
  });
  const pickMatch = async (match: any) => {
    analyze.mockResolvedValue({ isReal: true, confidence: {}, category: 'bags', subtype: 'shopper' });
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([match]);
    await addPhoto();
    await press(match.name);
  };

  it('values the item from the matched product price, not as if the listing price was paid', async () => {
    await render();
    await pickMatch(kb({ cost: 100 }));
    // The listing price still fills the price field, as before ...
    expect(input('Used price').props.value).toBe('100');
    // ... but the estimate treats it as the product's price.
    expect(estimateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ cost: undefined }),
      { matchedPrice: 100 },
    );
    expect(shown()).toBe(String(estimateFor({ category: 'bags' }, 100).value));
    expect(text()).toContain(HINT.match);
  });

  it('prefers the match\'s new price over what contributors paid', async () => {
    await render();
    await pickMatch(kb({ cost: 60, retailCost: 150 }));
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.anything(), { matchedPrice: 150 });
  });

  it('switches to the price paid as soon as the owner types their own', async () => {
    await render();
    await pickMatch(kb({ cost: 100 }));
    await typeInto('Used price', '65');
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 65 }), { matchedPrice: 100 });
    expect(shown()).toBe(String(estimateFor({ category: 'bags', cost: 65 }, 100).value));
    expect(text()).toContain(HINT.paid);
  });

  it('does not touch a value the owner already typed', async () => {
    await render();
    await typeInto('Estimated value', '500');
    await pickMatch(kb({ cost: 100 }));
    expect(shown()).toBe('500');
  });

  it("retaking the photo drops the listing price with the match, so it never turns into a 'paid' price", async () => {
    await render();
    await pickMatch(kb({ cost: 100 }));
    expect(input('Used price').props.value).toBe('100');

    // A second photo: the old match (and the price it filled in) is gone.
    analyze.mockResolvedValue({ isReal: true, confidence: {}, category: 'bags', subtype: 'shopper' });
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([]);
    await addPhoto();
    expect(input('Used price').props.value).toBe('');
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ cost: undefined }), { matchedPrice: undefined });
    expect(text()).not.toContain(HINT.paid);
  });

  it('keeps a price the owner typed themselves when the photo is retaken', async () => {
    await render();
    await pickMatch(kb({ cost: 100 }));
    await typeInto('Used price', '65');
    analyze.mockResolvedValue({ isReal: true, confidence: {}, category: 'bags', subtype: 'shopper' });
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([]);
    await addPhoto();
    expect(input('Used price').props.value).toBe('65');
  });
});

describe('a value the owner types', () => {
  it('sticks: later changes to the price no longer move it', async () => {
    await render();
    await typeInto('Estimated value', '123');
    expect(shown()).toBe('123');
    expect(text()).toContain(HINT.user);
    expect(text()).toContain('Reset to estimate');

    await typeInto('Used price', '80');
    await typeInto('New price', '400');
    expect(shown()).toBe('123');
    expect(text()).not.toContain(HINT.paid);

    await typeName('Silk scarf');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 123, valueSource: 'user' }));
  });

  it('keeps what was typed while typing, even if it equals the estimate', async () => {
    await render();
    const same = String(estimateFor().value);
    await typeInto('Estimated value', same);
    await typeInto('Used price', '999');
    expect(shown()).toBe(same);
    expect(text()).toContain(HINT.user);
  });

  it('reads commas and decimals, and keeps cents', async () => {
    await render();
    await typeName('Watch');
    await typeInto('Estimated value', '$1,299.50');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 1299.5, valueSource: 'user' }));
  });

  it('accepts zero', async () => {
    await render();
    await typeName('Gift sock');
    await typeInto('Estimated value', '0');
    await pressSave();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 0, valueSource: 'user' }));
  });

  describe('invalid input', () => {
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    it.each([
      ['letters', 'abc', 'Enter an amount, like 120.'],
      ['a lone separator', ',', 'Enter an amount, like 120.'],
      ['a negative number', '-5', "A value can't be negative."],
      ['an absurd amount', '2000000', 'Enter a value under $1,000,000.'],
      ['exactly one million', '1000000', 'Enter a value under $1,000,000.'],
      ['nothing', '', 'Enter a value, or reset to the estimate.'],
    ])('%s: says so inline and does not save', async (_label, typed, message) => {
      await render();
      await typeName('Hat');
      await typeInto('Estimated value', typed);
      expect(text()).toContain(message);
      await pressSave();
      expect(save).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalled();
    });

    it('lets go of the message once the value is fixed', async () => {
      await render();
      await typeName('Hat');
      await typeInto('Estimated value', 'abc');
      await typeInto('Estimated value', '45');
      expect(text()).not.toContain('Enter an amount');
      await pressSave();
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 45 }));
    });
  });
});

describe('Reset to estimate', () => {
  it('goes back to the estimate for what is in the form now, and follows it again', async () => {
    await render();
    await typeInto('Used price', '80');
    await typeInto('Estimated value', '999');
    await press('Reset to estimate');

    expect(shown()).toBe(String(estimateFor({ cost: 80 }).value));
    expect(text()).toContain(HINT.paid);
    expect(text()).not.toContain('Reset to estimate');

    await typeInto('Used price', '200');
    expect(shown()).toBe(String(estimateFor({ cost: 200 }).value));

    await typeName('Jeans');
    await pressSave();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: estimateFor({ cost: 200, name: 'Jeans' }).value, valueSource: 'estimate' }),
    );
  });

  it('also clears the message about an invalid value', async () => {
    await render();
    await typeInto('Estimated value', 'abc');
    expect(text()).toContain('Enter an amount');
    await press('Reset to estimate');
    expect(text()).not.toContain('Enter an amount');
  });
});

describe('wishlist', () => {
  it('has no estimated value: it is worth its price', async () => {
    await render({ isWishlist: true });
    expect(tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Estimated value')).toBeUndefined();
    expect(text()).not.toContain('Estimated Value');
    expect(text()).not.toContain('Estimated from');
  });

  it('labels the first price field "Price" and drops the Used / New wording', async () => {
    await render({ isWishlist: true });
    expect(textNodes('Price').length).toBeGreaterThan(0);
    expect(textNodes('Original price')).toHaveLength(1);
    expect(textNodes('Used')).toHaveLength(0);
    expect(textNodes('New')).toHaveLength(0);
    expect(input('Price')).toBeDefined();
    expect(input('Original price')).toBeDefined();
  });

  it('keeps the owned form\'s Used / New labels', async () => {
    await render();
    expect(textNodes('Used')).toHaveLength(1);
    expect(textNodes('New')).toHaveLength(1);
  });

  it('saves the price as cost, with no value of its own', async () => {
    await render({ isWishlist: true });
    await typeName('Dream bag');
    await typeInto('Price', '862');
    await pressSave('Save to Wishlist');
    const item = save.mock.calls[0][0];
    expect(item).toEqual(expect.objectContaining({ isWishlist: true, cost: 862 }));
    expect(item.estimatedValue).toBeUndefined();
    expect(item.valueSource).toBeUndefined();
  });

  it('words the community average as prices too', async () => {
    analyze.mockResolvedValue({ isReal: true, confidence: {}, category: 'bags', subtype: 'shopper' });
    (lookupKnowledgeBase as jest.Mock).mockResolvedValue([
      { name: 'Andiamo large shopper', category: 'bags', confirmationCount: 3, confidence: 0.9, cost: 120, retailCost: 300 },
    ]);
    await render({ isWishlist: true });
    await addPhoto();
    expect(text()).toContain('Community average');
    expect(textNodes('Used')).toHaveLength(0);
    expect(textNodes('New')).toHaveLength(0);
    expect(textNodes('Original price').length).toBeGreaterThan(0);
  });

  it('says "Save" rather than "Saved" for a sale on something not bought yet', async () => {
    await render({ isWishlist: true });
    await typeInto('Price', '80');
    await typeInto('Original price', '100');
    expect(sentences()).toContain('Save $20 (20% off)');
    expect(sentences()).not.toContain('Saved $20 (20% off)');

    act(() => tree.unmount());
    await render();
    await typeInto('Used price', '80');
    await typeInto('New price', '100');
    expect(sentences()).toContain('Saved $20 (20% off)');
  });
});

describe('editing an item', () => {
  it('round-trips a value the owner set', async () => {
    await render({ editItem: savedItem({ cost: 80, estimatedValue: 250, valueSource: 'user' }) });
    expect(shown()).toBe('250');
    expect(text()).toContain(HINT.user);
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', estimatedValue: 250, valueSource: 'user' }),
    );
  });

  it('keeps a saved estimate as it was while the things it came from are unchanged', async () => {
    // 55 is not what the estimator would say for a cost of 80 (e.g. an older formula).
    await render({ editItem: savedItem({ cost: 80, estimatedValue: 55, valueSource: 'estimate' }) });
    expect(shown()).toBe('55');
    expect(text()).not.toContain('Reset to estimate');
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: 55, valueSource: 'estimate' }));
  });

  it('recomputes a saved estimate once its price is edited', async () => {
    await render({ editItem: savedItem({ cost: 80, estimatedValue: 55, valueSource: 'estimate' }) });
    await typeInto('Used price', '200');
    expect(shown()).toBe(String(estimateFor({ category: 'outerwear', name: 'Wool coat', cost: 200 }).value));
    // Typing the original price back puts the saved estimate back with it.
    await typeInto('Used price', '80');
    expect(shown()).toBe('55');
  });

  it('shows a fresh estimate for an item saved before values existed, and writes nothing until saved', async () => {
    await render({ editItem: savedItem({ cost: 80 }) });
    const expected = estimateFor({ category: 'outerwear', name: 'Wool coat', cost: 80 }).value;
    expect(shown()).toBe(String(expected));
    expect(text()).toContain(HINT.paid);
    expect(text()).not.toContain('Reset to estimate');
    expect(update).not.toHaveBeenCalled();

    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: expected, valueSource: 'estimate' }));
  });

  it.each([
    ['negative', -5],
    ['not a number', NaN],
    ['not a number at all', 'lots'],
  ])('treats a stored value that is %s as missing', async (_label, bad) => {
    await render({ editItem: savedItem({ cost: 80, estimatedValue: bad, valueSource: 'user' }) });
    expect(shown()).toBe(String(estimateFor({ category: 'outerwear', name: 'Wool coat', cost: 80 }).value));
    expect(text()).not.toContain(HINT.user);
  });

  it('lets the owner reset a value they set earlier', async () => {
    await render({ editItem: savedItem({ cost: 80, estimatedValue: 250, valueSource: 'user' }) });
    await press('Reset to estimate');
    const expected = estimateFor({ category: 'outerwear', name: 'Wool coat', cost: 80 }).value;
    expect(shown()).toBe(String(expected));
    await pressSave('Update Item');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: expected, valueSource: 'estimate' }));
  });

  it('gives an edited wishlist item no value either', async () => {
    await render({ editItem: savedItem({ isWishlist: true, cost: 862, retailer: '' }) });
    expect(text()).not.toContain('Estimated Value');
    await pressSave('Update Item');
    const item = update.mock.calls[0][0];
    expect(item).toEqual(expect.objectContaining({ isWishlist: true, cost: 862 }));
    expect(item.estimatedValue).toBeUndefined();
  });
});
