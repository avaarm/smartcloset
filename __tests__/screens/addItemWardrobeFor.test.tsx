/**
 * Add / Edit Item and who the wardrobe is for: a new item is handed to noteAddedItem (category, type, name and what
 * the photo analysis said it is for) once it is saved; an edit never is, and noteAddedItem can never get in the way
 * of saving or of going back.
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
jest.mock('../../src/utils/askWardrobeFor', () => ({
  noteAddedItem: jest.fn(async () => undefined),
}));

import 'react-native';
import React from 'react';
import { Alert, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import { saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage } from '../../src/services/lensSearchService';
import { lookupKnowledgeBase } from '../../src/services/productContributions';
import { noteAddedItem } from '../../src/utils/askWardrobeFor';

const save = saveClothingItem as jest.Mock;
const update = updateClothingItem as jest.Mock;
const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;
const note = noteAddedItem as jest.Mock;

let tree: renderer.ReactTestRenderer;
let goBack: jest.Mock;

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const render = async (params: any = {}) => {
  goBack = jest.fn();
  await act(async () => {
    tree = renderer.create(<AddClothingScreen navigation={{ goBack } as any} route={{ params }} />);
  });
  await flush();
};

const typeName = (value: string) =>
  act(async () => {
    tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Item Name')!.props.onChangeText(value);
  });
const typeOwnType = (value: string) =>
  act(async () => {
    tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Type of item')!.props.onChangeText(value);
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
const labelled = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const pickCategory = (label: string) => act(async () => labelled(label)[0].props.onPress());
const pickType = (label: string) => act(async () => labelled(label)[0].props.onPress());

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

const real = (over: any = {}) => ({
  isReal: true,
  category: 'dresses',
  subtype: 'cocktail dress',
  color: 'black',
  colors: [{ name: 'black', hex: '#000000', weight: 0.9 }],
  confidence: { category: 0.95, color: 0.92, brand: 0.2 },
  rawLabels: [],
  ...over,
});

const savedItem = (over: any = {}) => ({
  id: 'item-1',
  name: 'Wool coat',
  category: 'outerwear',
  color: 'Grey',
  season: ['fall', 'winter'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...over,
});

/** What noteAddedItem was handed by the first (only) call. */
const noted = () => note.mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  note.mockImplementation(async () => undefined);
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

describe('a new item', () => {
  it('is handed to noteAddedItem with its category, type and name, once', async () => {
    await render();
    await pickCategory('Bags');
    await pickType('Crossbody');
    await typeName('Mini crossbody');
    await pressSave();

    expect(note).toHaveBeenCalledTimes(1);
    expect(noted()).toEqual({ category: 'bags', subcategory: 'Crossbody', name: 'Mini crossbody', aiGender: undefined });
  });

  it('hands over only those four things, and leaves asking to the default', async () => {
    await render();
    await typeName('Plain tee');
    await pressSave();

    expect(Object.keys(noted()).sort()).toEqual(['aiGender', 'category', 'name', 'subcategory']);
    expect(note.mock.calls[0]).toHaveLength(1);
  });

  it('hands over the category the form has, from the default to a dress', async () => {
    await render();
    await typeName('Plain tee');
    await pressSave();
    expect(noted()).toEqual(expect.objectContaining({ category: 'tops', subcategory: '' }));

    jest.clearAllMocks();
    act(() => tree.unmount());
    await render();
    await pickCategory('Dresses');
    await pickType('Cocktail dress');
    await typeName('Satin dress');
    await pressSave();
    expect(noted()).toEqual({ category: 'dresses', subcategory: 'Cocktail dress', name: 'Satin dress', aiGender: undefined });
  });

  it('hands over the name and the type trimmed', async () => {
    await render();
    await pickCategory('Bags');
    await pickType('Other');
    await typeOwnType('  Doctor bag \n');
    await typeName("   Women's leather doctor bag  ");
    await pressSave();

    expect(noted()).toEqual({
      category: 'bags',
      subcategory: 'Doctor bag',
      name: "Women's leather doctor bag",
      aiGender: undefined,
    });
  });

  it('hands over what was saved: the same name, category and type as the saved item', async () => {
    await render();
    await pickCategory('Shoes');
    await pickType('Heels');
    await typeName('Red pumps');
    await pressSave();

    const saved = save.mock.calls[0][0];
    expect(noted()).toEqual({
      category: saved.category,
      subcategory: saved.subcategory,
      name: saved.name,
      aiGender: undefined,
    });
  });

  it('is handed over after the item is saved, and before going back', async () => {
    await render();
    await typeName('Plain tee');
    await pressSave();

    expect(save.mock.invocationCallOrder[0]).toBeLessThan(note.mock.invocationCallOrder[0]);
    expect(note.mock.invocationCallOrder[0]).toBeLessThan(goBack.mock.invocationCallOrder[0]);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('waits for the save to finish, and the Save button is out of reach meanwhile, so it is handed over once', async () => {
    let finish!: () => void;
    save.mockReturnValueOnce(new Promise<void>(res => (finish = res)));
    await render();
    await typeName('Plain tee');
    await act(async () => {
      pressableWithText('Save Item').props.onPress(); // not awaited: the save is still going
    });

    expect(note).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(textNodes('Save Item')).toHaveLength(0); // a spinner has taken its place
    await act(async () => finish());
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('is not handed over when the form is not valid', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render();
    await pressSave(); // no name
    expect(alert).toHaveBeenCalledWith('Validation Error', expect.any(String));
    expect(save).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('is not handed over when saving fails, and the owner is told', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    save.mockRejectedValueOnce(new Error('disk full'));
    await render();
    await typeName('Plain tee');
    await pressSave();

    expect(note).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Error', 'Failed to save item. Please try again.');
  });

  it('is handed over after a second try, when the first save failed', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    save.mockRejectedValueOnce(new Error('disk full'));
    await render();
    await typeName('Plain tee');
    await pressSave();
    expect(note).not.toHaveBeenCalled();
    await pressSave();
    expect(note).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});

describe('an item being edited', () => {
  it('is never handed over', async () => {
    await render({ editItem: savedItem() });
    await pressSave('Update Item');

    expect(update).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('is not handed over after changing its category or type, either', async () => {
    await render({ editItem: savedItem({ category: 'bags', subcategory: 'Tote', name: "Women's tote" }) });
    await pickCategory('Dresses');
    await pickType('Cocktail dress');
    await pressSave('Update Item');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ category: 'dresses', subcategory: 'Cocktail dress' }));
    expect(note).not.toHaveBeenCalled();
  });

  it('is not handed over after detecting again from its photo', async () => {
    analyze.mockResolvedValue(real({ gender: 'women' }));
    await render({ editItem: savedItem({ userImage: 'https://example.com/coat.jpg', category: 'tops' }) });
    await act(async () => pressableWithText('Detect category, type and colour from photo').props.onPress());
    await flush();
    expect(analyze).toHaveBeenCalled();
    await pressSave('Update Item');

    expect(update).toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
  });
});

describe('what the photo analysis said it is for', () => {
  it.each(['women', 'men', 'unisex'])('hands over %s', async gender => {
    analyze.mockResolvedValue(real({ gender }));
    await render();
    await addPhoto();
    await typeName('Satin dress');
    await pressSave();

    expect(note).toHaveBeenCalledTimes(1);
    expect(noted()).toEqual({ category: 'dresses', subcategory: 'Cocktail dress', name: 'Satin dress', aiGender: gender });
  });

  it('hands over nothing when the analysis did not say', async () => {
    analyze.mockResolvedValue(real());
    await render();
    await addPhoto();
    await typeName('Satin dress');
    await pressSave();
    expect(noted().aiGender).toBeUndefined();
  });

  it('hands over nothing when there was no photo', async () => {
    await render();
    await typeName('Satin dress');
    await pressSave();
    expect(noted().aiGender).toBeUndefined();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('hands over nothing when the analysis was not real (unavailable), whatever it carries', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, gender: 'men', unavailableReason: 'signed_out' });
    await render();
    await addPhoto();
    await typeName('Satin dress');
    await pressSave();
    expect(noted().aiGender).toBeUndefined();
  });

  it('follows the latest photo: a new one replaces what the first said', async () => {
    analyze.mockResolvedValueOnce(real({ gender: 'women' }));
    analyze.mockResolvedValueOnce(real({ category: 'tops', subtype: 'shirt', gender: 'men' }));
    await render();
    await addPhoto('file:///one.jpg');
    await addPhoto('file:///two.jpg');
    expect(analyze).toHaveBeenCalledTimes(2);
    await typeName('Shirt');
    await pressSave();
    expect(noted().aiGender).toBe('men');
  });

  it('forgets what the first photo said when the second analysis is unavailable', async () => {
    analyze.mockResolvedValueOnce(real({ gender: 'women' }));
    analyze.mockResolvedValueOnce({ isReal: false, confidence: {}, unavailableReason: 'offline' });
    await render();
    await addPhoto('file:///one.jpg');
    await addPhoto('file:///two.jpg');
    await typeName('Shirt');
    await pressSave();
    expect(noted().aiGender).toBeUndefined();
  });

  it('is handed over with what the owner chose, not what the photo said', async () => {
    analyze.mockResolvedValue(real({ gender: 'women' }));
    await render();
    await addPhoto();
    await pickCategory('Accessories');
    await pickType('Tie');
    await typeName('Silk tie');
    await pressSave();
    expect(noted()).toEqual({ category: 'accessories', subcategory: 'Tie', name: 'Silk tie', aiGender: 'women' });
  });
});

describe('when noteAddedItem goes wrong', () => {
  it('a rejection does not stop the screen going back, or raise an error', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    note.mockImplementation(() => {
      const failed = Promise.reject(new Error('storage down'));
      failed.catch(() => {}); // the screen does not look at the answer; keep the test runner from calling it unhandled
      return failed;
    });
    await render();
    await typeName('Plain tee');
    await pressSave();

    expect(save).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('a slow answer does not hold the screen up', async () => {
    note.mockReturnValue(new Promise(() => {})); // never answers
    await render();
    await typeName('Plain tee');
    await pressSave();

    expect(note).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
