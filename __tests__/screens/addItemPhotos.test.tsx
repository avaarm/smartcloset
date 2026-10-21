/**
 * Add / Edit Item: several photos per piece. A strip under the cover photo lists them all (cover first), adds more
 * from the library or the camera, makes any of them the cover and removes them. Pictures of a picked shop match
 * join the list as optional photos. The AI reads the cover only; adding or moving photos never starts a reading.
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
  deleteImageFromStorage: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/productUrlService', () => ({
  fetchProductMetadata: jest.fn(),
  fetchProductImages: jest.fn(async () => []),
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
import { Alert, Image, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import MatchPickerSheet, { type PickedMatch } from '../../src/screens/MatchPickerSheet';
import PhotoStrip from '../../src/components/PhotoStrip';
import { saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { copyImageToPermanentStorage, deleteImageFromStorage } from '../../src/services/imageStorage';
import { fetchProductImages } from '../../src/services/productUrlService';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage } from '../../src/services/lensSearchService';
import { MAX_ITEM_IMAGES } from '../../src/utils/itemImages';

const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;
const save = saveClothingItem as jest.Mock;
const update = updateClothingItem as jest.Mock;
const store = copyImageToPermanentStorage as jest.Mock;
const unstore = deleteImageFromStorage as jest.Mock;
const productImages = fetchProductImages as jest.Mock;
const library = ImagePicker.launchImageLibrary as unknown as jest.Mock;
const camera = ImagePicker.launchCamera as unknown as jest.Mock;

let tree: renderer.ReactTestRenderer;
let alertSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

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

const button = (label: string) => {
  const found = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`no button "${label}"`);
  return found[0];
};
const hasButton = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;
const press = (label: string) =>
  act(async () => {
    button(label).props.onPress();
  });

const pressableWithText = (label: string) => {
  const t = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === label)[0];
  let node: any = t;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`nothing to press for "${label}"`);
  return node;
};
const pressSave = async (label = 'Save Item') => {
  await act(async () => {
    pressableWithText(label).props.onPress();
  });
  await flush();
};
const typeName = (value: string) =>
  act(async () => {
    tree.root.findAllByType(TextInput).find(i => i.props.placeholder === 'Item Name')!.props.onChangeText(value);
  });

/** The cover, through the big photo area and its "Choose from Library" option (replaces the cover, and is read by the AI). */
const addCover = async (uri = 'file:///cover.jpg') => {
  library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ assets: [{ uri }] }));
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

/** More photos, through the strip's Add photos tile. */
const addMore = async (uris: string[]) => {
  library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ assets: uris.map(uri => ({ uri })) }));
  await press('Add photos');
  await flush();
};

const photos = (): string[] => tree.root.findByType(PhotoStrip).props.photos;
const shopPhotos = (): string[] => tree.root.findByType(PhotoStrip).props.shopPhotos;
const visibleTexts = () =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const count = (label: string) => visibleTexts().filter(t => t === label).length;
const bigPhoto = (): string | undefined => {
  const area = tree.root.findAllByType(TouchableOpacity).find(t => (t.props.style as any)?.height === 250)!;
  return area.findAllByType(Image)[0]?.props.source.uri;
};
const savedItem = () => (save.mock.calls[save.mock.calls.length - 1] ?? update.mock.calls[update.mock.calls.length - 1])[0];

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

const match = (over: Partial<PickedMatch> = {}): PickedMatch => ({
  name: 'Tan knee-high boots',
  brand: 'Zara',
  retailer: 'zara.com',
  retailCost: 120,
  sourceUrl: 'https://www.zara.com/boots-1',
  imageUrl: 'https://static.zara.net/card.jpg',
  images: ['https://static.zara.net/card.jpg'],
  source: 'lens_match',
  ...over,
});

const pickMatch = async (m: PickedMatch) => {
  await act(async () => {
    tree.root.findByType(MatchPickerSheet).props.onPick(m);
  });
  await flush();
};

const own = (n: number) => Array.from({ length: n }, (_, i) => `file:///own${i + 1}.jpg`);

beforeEach(() => {
  jest.clearAllMocks();
  library.mockReset();
  camera.mockReset();
  store.mockReset().mockImplementation(async (uri: string) => uri);
  unstore.mockReset().mockResolvedValue(undefined);
  productImages.mockReset().mockResolvedValue([]);
  analyze.mockReset().mockResolvedValue(analysis());
  search.mockReset().mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  // A late state update or a bad prop would show up here.
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the photo strip in the form', () => {
  it('is under the cover photo and starts with just the add tiles when there is no photo', async () => {
    await render();
    expect(photos()).toEqual([]);
    expect(hasButton('Add photos')).toBe(true);
    expect(hasButton('Take a photo with the camera')).toBe(true);
  });

  it('adds photos from the library with multi-select, as many as there is room for', async () => {
    await render();
    await addCover();
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    expect(library).toHaveBeenLastCalledWith(
      expect.objectContaining({ mediaType: 'photo', selectionLimit: MAX_ITEM_IMAGES - 1, maxWidth: 1600, maxHeight: 1600 }),
      expect.any(Function),
    );
    expect(photos()).toEqual(['file:///cover.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    expect(bigPhoto()).toBe('file:///cover.jpg');
  });

  it('stores each picked photo like the cover photo, one after another', async () => {
    await render();
    const order: string[] = [];
    store.mockImplementation(async (uri: string) => {
      order.push(`start ${uri}`);
      await new Promise(r => setImmediate(r));
      order.push(`end ${uri}`);
      return `https://cloud.example/${uri.split('/').pop()}`;
    });
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    expect(order).toEqual(['start file:///a.jpg', 'end file:///a.jpg', 'start file:///b.jpg', 'end file:///b.jpg', 'start file:///c.jpg', 'end file:///c.jpg']);
    expect(photos()).toEqual(['https://cloud.example/a.jpg', 'https://cloud.example/b.jpg', 'https://cloud.example/c.jpg']);
  });

  it('saves the whole gallery, with the cover in both single-photo fields', async () => {
    await render();
    await addCover('file:///cover.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    await typeName('Tan boots');
    await pressSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(savedItem()).toEqual(
      expect.objectContaining({
        images: ['file:///cover.jpg', 'file:///b.jpg', 'file:///c.jpg'],
        userImage: 'file:///cover.jpg',
        retailerImage: 'file:///cover.jpg',
      }),
    );
  });

  it('saves an item with no photo as it did before: an empty list and empty cover fields', async () => {
    await render();
    await typeName('Tan boots');
    await pressSave();
    expect(savedItem()).toEqual(expect.objectContaining({ images: [], userImage: '', retailerImage: '' }));
  });

  it('starts from every photo of the item being edited, cover first', async () => {
    await render({ editItem: editItem({ images: ['https://c.example/1.jpg', 'https://c.example/2.jpg'], userImage: 'https://c.example/1.jpg' }) });
    expect(photos()).toEqual(['https://c.example/1.jpg', 'https://c.example/2.jpg']);
    expect(bigPhoto()).toBe('https://c.example/1.jpg');
    await pressSave('Update Item');
    expect(savedItem()).toEqual(
      expect.objectContaining({
        id: 'item-1',
        images: ['https://c.example/1.jpg', 'https://c.example/2.jpg'],
        userImage: 'https://c.example/1.jpg',
        retailerImage: 'https://c.example/1.jpg',
      }),
    );
  });

  it('builds the list from the one photo an older item has', async () => {
    await render({ editItem: editItem({ userImage: 'https://c.example/old.jpg' }) });
    expect(photos()).toEqual(['https://c.example/old.jpg']);
    await pressSave('Update Item');
    expect(savedItem()).toEqual(
      expect.objectContaining({ images: ['https://c.example/old.jpg'], userImage: 'https://c.example/old.jpg' }),
    );
  });

  it('adds a photo from the camera too, as one more photo', async () => {
    await render();
    await addCover();
    camera.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ assets: [{ uri: 'file:///shot.jpg' }] }));
    await press('Take a photo with the camera');
    await flush();
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'photo', saveToPhotos: false }), expect.any(Function));
    expect(photos()).toEqual(['file:///cover.jpg', 'file:///shot.jpg']);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('shows the library or camera problem and adds nothing when the person cancels', async () => {
    await render();
    library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ didCancel: true }));
    await press('Add photos');
    expect(photos()).toEqual([]);
    expect(alertSpy).not.toHaveBeenCalled();
    library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ errorCode: 'permission' }));
    await press('Add photos');
    expect(alertSpy).toHaveBeenCalledWith('Photo access is off', expect.any(String), expect.any(Array));
  });
});

describe('what the AI reads', () => {
  it('reads the cover once, and never because an extra photo was added', async () => {
    await render();
    await addCover('file:///cover.jpg');
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith('file:///cover.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('reads the first photo of an item that had none, since that photo is its cover', async () => {
    await render();
    await addMore(['file:///first.jpg', 'file:///second.jpg']);
    expect(photos()).toEqual(['file:///first.jpg', 'file:///second.jpg']);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith('file:///first.jpg');
  });

  it('does not read again when another photo becomes the cover, and the Detect button then reads the new cover', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    await press('Make photo 3 of 3 the cover');
    expect(photos()).toEqual(['file:///c.jpg', 'file:///a.jpg', 'file:///b.jpg']);
    expect(analyze).toHaveBeenCalledTimes(1);

    await press('Detect category, type and colour from the photo');
    await flush();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenLastCalledWith('file:///c.jpg');
    // Only a re-detect: no new match search.
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('keeps reading the photo in the big area as before: a new one there replaces the cover, and is read', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg']);
    await addCover('file:///new.jpg');
    expect(photos()).toEqual(['file:///new.jpg', 'file:///b.jpg']);
    expect(bigPhoto()).toBe('file:///new.jpg');
    expect(analyze).toHaveBeenLastCalledWith('file:///new.jpg');
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it('locks the strip while the cover is being read', async () => {
    let finish: (v: unknown) => void = () => {};
    analyze.mockReturnValue(new Promise(r => (finish = r)));
    await render();
    await addCover();
    expect(tree.root.findByType(PhotoStrip).props.disabled).toBe(true);
    await act(async () => {
      finish(analysis());
    });
    await flush();
    expect(tree.root.findByType(PhotoStrip).props.disabled).toBe(false);
  });
});

describe('make cover and remove', () => {
  it('moves a photo to the front: it is the big photo, the one marked Cover, and the one saved as the cover', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    await press('Make photo 2 of 3 the cover');
    expect(photos()).toEqual(['file:///b.jpg', 'file:///a.jpg', 'file:///c.jpg']);
    expect(bigPhoto()).toBe('file:///b.jpg');
    expect(count('Cover')).toBe(1);
    expect(count('Make cover')).toBe(2);
    await typeName('Boots');
    await pressSave();
    expect(savedItem()).toEqual(
      expect.objectContaining({
        images: ['file:///b.jpg', 'file:///a.jpg', 'file:///c.jpg'],
        userImage: 'file:///b.jpg',
        retailerImage: 'file:///b.jpg',
      }),
    );
  });

  it('removes a photo from the list and from what is saved', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg', 'file:///c.jpg']);
    await press('Remove photo 2 of 3');
    expect(photos()).toEqual(['file:///a.jpg', 'file:///c.jpg']);
    await typeName('Boots');
    await pressSave();
    expect(savedItem().images).toEqual(['file:///a.jpg', 'file:///c.jpg']);
  });

  it('makes the next photo the cover when the cover is removed', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg']);
    await press('Remove photo 1 of 2');
    expect(photos()).toEqual(['file:///b.jpg']);
    expect(bigPhoto()).toBe('file:///b.jpg');
    await typeName('Boots');
    await pressSave();
    expect(savedItem()).toEqual(expect.objectContaining({ images: ['file:///b.jpg'], userImage: 'file:///b.jpg' }));
  });

  it('removes the last photo too: the item is saved with none, and the big area asks for a photo again', async () => {
    await render({ editItem: editItem({ images: ['https://c.example/1.jpg'], userImage: 'https://c.example/1.jpg' }) });
    await press('Remove photo 1 of 1');
    expect(photos()).toEqual([]);
    expect(bigPhoto()).toBeUndefined();
    expect(text()).toContain('Add Photo');
    expect(hasButton('Detect category, type and colour from the photo')).toBe(false);
    await pressSave('Update Item');
    expect(savedItem()).toEqual(expect.objectContaining({ images: [], userImage: '', retailerImage: '' }));
  });

  it('deletes a photo stored in this session when it is removed, and leaves photos already saved to the data layer', async () => {
    store.mockImplementation(async (uri: string) => `https://cloud.example/${uri.split('/').pop()}`);
    await render({ editItem: editItem({ images: ['https://c.example/saved.jpg'], userImage: 'https://c.example/saved.jpg' }) });
    await addMore(['file:///new.jpg']);
    expect(photos()).toEqual(['https://c.example/saved.jpg', 'https://cloud.example/new.jpg']);

    await press('Remove photo 1 of 2');
    expect(unstore).not.toHaveBeenCalled();
    await press('Remove photo 1 of 1');
    expect(unstore).toHaveBeenCalledTimes(1);
    expect(unstore).toHaveBeenCalledWith('https://cloud.example/new.jpg');
  });

  it('deletes the stored copy of a cover that a new cover replaced, but not a shop picture', async () => {
    store.mockImplementation(async (uri: string) => `https://cloud.example/${uri.split('/').pop()}`);
    await render();
    await addCover('file:///a.jpg');
    await addCover('file:///b.jpg');
    expect(photos()).toEqual(['https://cloud.example/b.jpg']);
    expect(unstore).toHaveBeenCalledWith('https://cloud.example/a.jpg');
    await pickMatch(match());
    await press('Remove photo 2 of 2');
    expect(unstore).toHaveBeenCalledTimes(1);
  });

  it('keeps going when deleting the stored copy fails', async () => {
    store.mockImplementation(async (uri: string) => `https://cloud.example/${uri.split('/').pop()}`);
    unstore.mockRejectedValue(new Error('offline'));
    await render();
    await addMore(['file:///a.jpg', 'file:///b.jpg']);
    await press('Remove photo 2 of 2');
    await flush();
    expect(photos()).toEqual(['https://cloud.example/a.jpg']);
  });
});

describe('the limit', () => {
  it('asks the library for only the room that is left, and hides the add tiles when full', async () => {
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES - 1), userImage: own(1)[0] }) });
    expect(hasButton('Add photos')).toBe(true);
    await addMore(['file:///last.jpg']);
    expect(library).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 1 }), expect.any(Function));
    expect(photos()).toHaveLength(MAX_ITEM_IMAGES);
    expect(hasButton('Add photos')).toBe(false);
    expect(hasButton('Take a photo with the camera')).toBe(false);
    expect(text()).toContain('Remove one to add another.');
  });

  it('takes a photo out to make room again', async () => {
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES), userImage: own(1)[0] }) });
    expect(hasButton('Add photos')).toBe(false);
    await press(`Remove photo ${MAX_ITEM_IMAGES} of ${MAX_ITEM_IMAGES}`);
    expect(hasButton('Add photos')).toBe(true);
    await addMore(['file:///again.jpg']);
    expect(library).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 1 }), expect.any(Function));
    expect(photos()).toHaveLength(MAX_ITEM_IMAGES);
  });

  it('never keeps more than the limit even if the library hands back more, and drops the stored extras', async () => {
    store.mockImplementation(async (uri: string) => `https://cloud.example/${uri.split('/').pop()}`);
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES - 2), userImage: own(1)[0] }) });
    await addMore(['file:///x.jpg', 'file:///y.jpg', 'file:///z.jpg']);
    expect(photos()).toHaveLength(MAX_ITEM_IMAGES);
    expect(photos().slice(-2)).toEqual(['https://cloud.example/x.jpg', 'https://cloud.example/y.jpg']);
    expect(unstore).toHaveBeenCalledWith('https://cloud.example/z.jpg');
  });

  it('does not open the library when full', async () => {
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES), userImage: own(1)[0] }) });
    expect(hasButton('Add photos')).toBe(false);
    expect(library).not.toHaveBeenCalled();
  });

  it('keeps one copy of a photo that is picked twice', async () => {
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///a.jpg', 'file:///b.jpg']);
    expect(photos()).toEqual(['file:///a.jpg', 'file:///b.jpg']);
  });
});

describe('a photo that fails to store', () => {
  it('shows one message and still adds the others', async () => {
    store.mockImplementation(async (uri: string) => {
      if (uri.includes('bad')) throw new Error("Couldn't upload the photo. Check your connection and try again.");
      return uri;
    });
    await render();
    await addCover('file:///a.jpg');
    await addMore(['file:///b.jpg', 'file:///bad1.jpg', 'file:///c.jpg', 'file:///bad2.jpg']);
    expect(photos()).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    expect(alertSpy).toHaveBeenCalledTimes(2); // the cover's own picker option sheet, then this one message
    expect(alertSpy).toHaveBeenLastCalledWith(
      "Some photos weren't added",
      "2 photos could not be added. Couldn't upload the photo. Check your connection and try again.",
    );
  });

  it('says so plainly when the only photo fails, and when none of several work', async () => {
    store.mockRejectedValue(new Error('Could not read the selected image. Try picking it again.'));
    await render();
    await addMore(['file:///bad.jpg']);
    expect(alertSpy).toHaveBeenLastCalledWith("Couldn't add that photo", 'Could not read the selected image. Try picking it again.');
    await addMore(['file:///bad1.jpg', 'file:///bad2.jpg']);
    expect(alertSpy).toHaveBeenLastCalledWith(
      "Couldn't add those photos",
      'None of the 2 photos could be added. Could not read the selected image. Try picking it again.',
    );
    expect(photos()).toEqual([]);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('does not start a reading when the first photo of an empty item failed but the second worked', async () => {
    store.mockImplementation(async (uri: string) => {
      if (uri.includes('bad')) throw new Error('nope');
      return uri;
    });
    await render();
    await addMore(['file:///bad.jpg', 'file:///ok.jpg']);
    expect(photos()).toEqual(['file:///ok.jpg']);
    expect(analyze).toHaveBeenCalledWith('file:///ok.jpg');
  });
});

describe('while photos are being stored', () => {
  it('waits on the add tiles and holds back Save until they are in', async () => {
    let release: (uri: string) => void = () => {};
    store.mockImplementation(() => new Promise<string>(r => (release = r)));
    await render();
    await typeName('Boots');
    library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ assets: [{ uri: 'file:///slow.jpg' }] }));
    await press('Add photos');
    expect(tree.root.findByType(PhotoStrip).props.adding).toBe(true);

    await pressSave();
    expect(save).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenLastCalledWith('Still adding photos', expect.any(String));

    // A second pick is ignored while the first is in progress.
    await press('Add photos');
    expect(library).toHaveBeenCalledTimes(1);

    await act(async () => {
      release('file:///slow.jpg');
    });
    await flush();
    expect(tree.root.findByType(PhotoStrip).props.adding).toBe(false);
    expect(photos()).toEqual(['file:///slow.jpg']);
    await pressSave();
    expect(savedItem()).toEqual(expect.objectContaining({ images: ['file:///slow.jpg'] }));
  });

  it('drops photos that finish storing after the screen was closed, and deletes them', async () => {
    let release: (uri: string) => void = () => {};
    store.mockImplementation(() => new Promise<string>(r => (release = r)));
    await render();
    library.mockImplementationOnce((_o: any, cb: (r: any) => void) => cb({ assets: [{ uri: 'file:///late.jpg' }] }));
    await press('Add photos');
    act(() => tree.unmount());
    await act(async () => {
      release('https://cloud.example/late.jpg');
    });
    await flush();
    expect(unstore).toHaveBeenCalledWith('https://cloud.example/late.jpg');
  });
});

describe('pictures of a picked match', () => {
  it('with no photo yet, the card picture becomes the cover and the product page pictures follow, all marked as the shop\'s', async () => {
    productImages.mockResolvedValue(['https://static.zara.net/2.jpg', 'https://static.zara.net/3.jpg']);
    await render();
    await addCover('file:///mine.jpg');
    await press('Remove photo 1 of 1'); // the person drops their own photo; the match sheet is still there
    expect(photos()).toEqual([]);

    await pickMatch(match());
    expect(productImages).toHaveBeenCalledWith('https://www.zara.com/boots-1');
    expect(photos()).toEqual([
      'https://static.zara.net/card.jpg',
      'https://static.zara.net/2.jpg',
      'https://static.zara.net/3.jpg',
    ]);
    expect(shopPhotos()).toEqual(photos());
    expect(bigPhoto()).toBe('https://static.zara.net/card.jpg');
    expect(count('From the shop')).toBe(3);
    expect(count('Cover')).toBe(1);
    // A shop picture is used as it is: not uploaded again.
    expect(store).toHaveBeenCalledTimes(1);
    // The AI was not asked to read it.
    expect(analyze).toHaveBeenCalledTimes(1);

    await typeName('Tan boots');
    await pressSave();
    expect(savedItem()).toEqual(
      expect.objectContaining({
        images: ['https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg', 'https://static.zara.net/3.jpg'],
        userImage: 'https://static.zara.net/card.jpg',
        retailerImage: 'https://static.zara.net/card.jpg',
      }),
    );
  });

  it('with an uploaded photo, that photo stays the cover and the shop pictures come after it as removable extras', async () => {
    productImages.mockResolvedValue(['https://static.zara.net/2.jpg']);
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
    expect(shopPhotos()).toEqual(['https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
    expect(bigPhoto()).toBe('file:///mine.jpg');
    expect(count('From the shop')).toBe(2);

    await press('Remove photo 2 of 3');
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/2.jpg']);
    expect(unstore).not.toHaveBeenCalled();

    await typeName('Tan boots');
    await pressSave();
    expect(savedItem()).toEqual(
      expect.objectContaining({
        images: ['file:///mine.jpg', 'https://static.zara.net/2.jpg'],
        userImage: 'file:///mine.jpg',
      }),
    );
  });

  it('fills the form at once with the card picture, without waiting for the product page', async () => {
    let answer: (v: string[]) => void = () => {};
    productImages.mockReturnValue(new Promise<string[]>(r => (answer = r)));
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg']);
    expect(text()).toContain('zara.com'); // the retailer field, filled from the match
    expect(tree.root.findByType(PhotoStrip).props.adding).toBe(false);

    await act(async () => {
      answer(['https://static.zara.net/2.jpg']);
    });
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
  });

  it('adds only the card picture when the product page cannot be read, and says nothing', async () => {
    productImages.mockRejectedValue(new Error('offline'));
    await render();
    await addCover('file:///mine.jpg');
    alertSpy.mockClear();
    await pickMatch(match());
    await flush();
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg']);
    expect(alertSpy).not.toHaveBeenCalled();

    // The same when it simply finds nothing (the real function gives [] on any failure).
    act(() => tree.unmount());
    productImages.mockReset().mockResolvedValue([]);
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg']);
  });

  it('does not read a page for a match that has no link, and falls back to imageUrl for a card without images', async () => {
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match({ sourceUrl: undefined, images: undefined, imageUrl: 'https://static.zara.net/only.jpg' }));
    expect(productImages).not.toHaveBeenCalled();
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/only.jpg']);
  });

  it('adds nothing for a card with no picture that loads', async () => {
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match({ images: [], imageUrl: 'https://static.zara.net/broken.jpg', sourceUrl: undefined }));
    expect(photos()).toEqual(['file:///mine.jpg']);
    expect(shopPhotos()).toEqual([]);
  });

  it('replaces the pictures of the previous match with the new match\'s, and leaves the person\'s photos alone', async () => {
    productImages.mockImplementation(async (url: string) =>
      url.includes('boots-1') ? ['https://static.zara.net/1b.jpg'] : ['https://static.other.net/2b.jpg'],
    );
    await render();
    await addCover('file:///mine.jpg');
    await addMore(['file:///extra.jpg']);
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', 'file:///extra.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/1b.jpg']);

    // A new photo in the big area starts the match search over; the new match then replaces the old one's pictures.
    await addCover('file:///mine2.jpg');
    expect(photos()).toEqual(['file:///mine2.jpg', 'file:///extra.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/1b.jpg']);
    await pickMatch(
      match({
        name: 'Other boots',
        sourceUrl: 'https://www.other.com/boots-2',
        imageUrl: 'https://static.other.net/card2.jpg',
        images: ['https://static.other.net/card2.jpg'],
      }),
    );
    expect(photos()).toEqual(['file:///mine2.jpg', 'file:///extra.jpg', 'https://static.other.net/card2.jpg', 'https://static.other.net/2b.jpg']);
    expect(shopPhotos()).toEqual(['https://static.other.net/card2.jpg', 'https://static.other.net/2b.jpg']);
    expect(count('From the shop')).toBe(2);
  });

  it('drops the late pictures of a match that is no longer the picked one', async () => {
    const answers: Record<string, (v: string[]) => void> = {};
    productImages.mockImplementation((url: string) => new Promise<string[]>(r => (answers[url] = r)));
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    await addCover('file:///mine2.jpg');
    await pickMatch(
      match({ sourceUrl: 'https://www.other.com/boots-2', imageUrl: 'https://static.other.net/card2.jpg', images: ['https://static.other.net/card2.jpg'] }),
    );
    await act(async () => {
      answers['https://www.zara.com/boots-1'](['https://static.zara.net/late.jpg']);
    });
    expect(photos()).toEqual(['file:///mine2.jpg', 'https://static.other.net/card2.jpg']);
    await act(async () => {
      answers['https://www.other.com/boots-2'](['https://static.other.net/2b.jpg']);
    });
    expect(photos()).toEqual(['file:///mine2.jpg', 'https://static.other.net/card2.jpg', 'https://static.other.net/2b.jpg']);
  });

  it('drops late pictures when a new photo started the search over, or the screen was closed', async () => {
    let answer: (v: string[]) => void = () => {};
    productImages.mockReturnValue(new Promise<string[]>(r => (answer = r)));
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    await addCover('file:///mine2.jpg');
    await act(async () => {
      answer(['https://static.zara.net/late.jpg']);
    });
    expect(photos()).not.toContain('https://static.zara.net/late.jpg');

    // Closed before the page answered: nothing is set, and nothing is logged as an error (checked after each test).
    await pickMatch(match());
    act(() => tree.unmount());
    await act(async () => {
      answer(['https://static.zara.net/later.jpg']);
    });
  });

  it('does not bring back a shop picture the person removed while the page was being read', async () => {
    let answer: (v: string[]) => void = () => {};
    productImages.mockReturnValue(new Promise<string[]>(r => (answer = r)));
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    await press('Remove photo 2 of 2'); // the card picture
    await act(async () => {
      answer(['https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
    });
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/2.jpg']);
  });

  it('never goes past the limit, never repeats a picture, and keeps the person\'s photos', async () => {
    productImages.mockResolvedValue([
      'https://static.zara.net/card.jpg',
      'https://static.zara.net/2.jpg',
      'https://static.zara.net/3.jpg',
    ]);
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES - 2), userImage: own(1)[0] }) });
    await addCover('file:///mine.jpg'); // replaces the cover: still MAX - 2 photos
    await pickMatch(match());
    expect(photos()).toHaveLength(MAX_ITEM_IMAGES);
    expect(photos().slice(0, MAX_ITEM_IMAGES - 2)).toEqual(['file:///mine.jpg', ...own(MAX_ITEM_IMAGES - 2).slice(1)]);
    expect(photos().slice(-2)).toEqual(['https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
    expect(new Set(photos()).size).toBe(photos().length);
    expect(hasButton('Add photos')).toBe(false);
  });

  it('adds no shop pictures at all when the person already has the most photos', async () => {
    await render({ editItem: editItem({ images: own(MAX_ITEM_IMAGES), userImage: own(1)[0] }) });
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', ...own(MAX_ITEM_IMAGES).slice(1)]);
    expect(shopPhotos()).toEqual([]);
  });

  it('keeps the shop pictures when the match sheet is skipped or dismissed afterwards', async () => {
    productImages.mockResolvedValue(['https://static.zara.net/2.jpg']);
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(tree.root.findAllByType(MatchPickerSheet)).toHaveLength(0);
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
  });

  it('adds nothing when the sheet is skipped without picking', async () => {
    await render();
    await addCover('file:///mine.jpg');
    await act(async () => {
      tree.root.findByType(MatchPickerSheet).props.onSkip();
    });
    expect(photos()).toEqual(['file:///mine.jpg']);
    expect(productImages).not.toHaveBeenCalled();
  });

  it('lets a shop picture be made the cover, and keeps it marked as the shop\'s', async () => {
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match({ sourceUrl: undefined }));
    await press('Make photo 2 of 2 the cover');
    expect(photos()).toEqual(['https://static.zara.net/card.jpg', 'file:///mine.jpg']);
    expect(shopPhotos()).toEqual(['https://static.zara.net/card.jpg']);
    expect(bigPhoto()).toBe('https://static.zara.net/card.jpg');
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('behaves the same for a wishlist item as for an owned one', async () => {
    productImages.mockResolvedValue(['https://static.zara.net/2.jpg']);
    await render({ isWishlist: true });
    await addCover('file:///mine.jpg');
    await pickMatch(match());
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg']);
    await pressSave('Save to Wishlist');
    expect(savedItem()).toEqual(
      expect.objectContaining({
        isWishlist: true,
        images: ['file:///mine.jpg', 'https://static.zara.net/card.jpg', 'https://static.zara.net/2.jpg'],
        userImage: 'file:///mine.jpg',
      }),
    );
  });

  it('a community match with no picture of its own still gets the pictures of its page', async () => {
    productImages.mockResolvedValue(['https://static.zara.net/2.jpg']);
    await render();
    await addCover('file:///mine.jpg');
    await pickMatch(match({ source: 'kb_match', images: undefined, imageUrl: undefined }));
    expect(photos()).toEqual(['file:///mine.jpg', 'https://static.zara.net/2.jpg']);
  });
});
