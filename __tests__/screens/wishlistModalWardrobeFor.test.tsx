/**
 * Wishlist "Add from the web": a result that is saved counts toward who the wardrobe is for (noteAddedItem with
 * ask: false, so one tap never turns into a question), after it is saved, and never gets in the way of it.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      updateUser: jest.fn(),
    },
  },
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchProductsByText: jest.fn(),
  searchByImage: jest.fn(),
}));
// The photo analysis is its own suite (wishlistItemBuilder.test.ts); here it is unavailable, as for a guest.
jest.mock('../../src/services/imageRecognition', () => ({
  ...jest.requireActual('../../src/services/imageRecognition'),
  analyzeClothingImage: jest.fn(async () => ({ confidence: {}, isReal: false, unavailableReason: 'signed_out' })),
}));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/platform/imagePicker', () => ({
  pickImageFromLibrary: jest.fn(),
}));
const mockNote = jest.fn();
jest.mock('../../src/utils/askWardrobeFor', () => ({
  noteAddedItem: (...args: unknown[]) => mockNote(...args),
}));

import 'react-native';
import React from 'react';
import { Alert, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WishlistSearchModal from '../../src/screens/WishlistSearchModal';
import { searchProductsByText, type LensResult, type LensSearchResponse } from '../../src/services/lensSearchService';
import { saveClothingItem } from '../../src/services/storage';
import { getAudienceSuggestion, wasAsked } from '../../src/services/wardrobeAudience';

const searchText = searchProductsByText as jest.Mock;
const save = saveClothingItem as jest.Mock;

const result = (id: string, host: string, title: string): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://imgs.search.brave.com/${id}`,
  similarity: 0.5,
  isShopping: true,
});

const response = (results: LensResult[]): LensSearchResponse => ({ query: 'q', bestGuessLabels: [], results });

let tree: renderer.ReactTestRenderer;
const onClose = jest.fn();
const onAdded = jest.fn();
let alert: jest.SpyInstance;

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const render = async () => {
  await act(async () => {
    tree = renderer.create(<WishlistSearchModal visible onClose={onClose} onAdded={onAdded} />);
  });
};

const search = async (results: LensResult[]) => {
  searchText.mockResolvedValue(response(results));
  await render();
  const input = tree.root.findByType(TextInput);
  await act(async () => {
    input.props.onChangeText('q');
  });
  await act(async () => {
    input.props.onSubmitEditing();
  });
  await flush();
};

const pressCard = async (title: string) => {
  const card = tree.root.findAll(
    n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === title).length > 0,
  )[0];
  await act(async () => {
    await card.props.onPress();
  });
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockNote.mockReset().mockResolvedValue(undefined);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('saving a result to the wishlist', () => {
  it('counts it toward who the wardrobe is for, without asking', async () => {
    await search([result('d1', 'nordstrom.com', 'Satin cocktail dress')]);
    await pressCard('Satin cocktail dress');

    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0];
    expect(mockNote).toHaveBeenCalledTimes(1);
    expect(mockNote).toHaveBeenCalledWith(
      { category: saved.category, subcategory: saved.subcategory, name: 'Satin cocktail dress' },
      { ask: false },
    );
    expect(saved.category).toBe('dresses');
  });

  it('hands over the category, the type and the listing title as the item is saved, and nothing else', async () => {
    await search([result('e1', 'nordstrom.com', 'Gold hoop earrings')]);
    await pressCard('Gold hoop earrings');

    const [note, options] = mockNote.mock.calls[0];
    expect(note).toEqual({ category: 'jewelry', subcategory: 'Earrings', name: 'Gold hoop earrings' });
    expect(Object.keys(note).sort()).toEqual(['category', 'name', 'subcategory']);
    expect(options).toEqual({ ask: false });
  });

  it('does it once for each result saved', async () => {
    await search([
      result('a', 'zara.com', 'Suede knee high boots'),
      result('b', 'nordstrom.com', 'Gold hoop earrings'),
    ]);
    await pressCard('Suede knee high boots');
    await pressCard('Gold hoop earrings');

    expect(mockNote).toHaveBeenCalledTimes(2);
    expect(mockNote.mock.calls.map(c => c[0].category)).toEqual(['shoes', 'jewelry']);
    expect(mockNote.mock.calls.every(c => c[1].ask === false)).toBe(true);
  });

  it('does it after the item is saved, and before it is announced', async () => {
    await search([result('a', 'zara.com', 'Suede knee high boots')]);
    await pressCard('Suede knee high boots');

    expect(save.mock.invocationCallOrder[0]).toBeLessThan(mockNote.mock.invocationCallOrder[0]);
    expect(mockNote.mock.invocationCallOrder[0]).toBeLessThan(onAdded.mock.invocationCallOrder[0]);
  });

  it('does not do it when the item could not be saved, and says so', async () => {
    save.mockRejectedValueOnce(new Error('disk full'));
    await search([result('a', 'zara.com', 'Suede knee high boots')]);
    await pressCard('Suede knee high boots');

    expect(mockNote).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Error', 'Failed to add item. Please try again.');
  });

  it('is not held up by it: the item is announced even when it fails', async () => {
    mockNote.mockImplementation(() => {
      const failed = Promise.reject(new Error('storage down'));
      failed.catch(() => {}); // the modal does not look at the answer; keep the test runner from calling it unhandled
      return failed;
    });
    await search([result('a', 'zara.com', 'Suede knee high boots')]);
    await pressCard('Suede knee high boots');

    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Added to Wishlist', expect.stringContaining('Suede knee high boots'), expect.any(Array));
    expect(alert).not.toHaveBeenCalledWith('Error', expect.anything());
  });
});

describe('with the real noteAddedItem', () => {
  beforeEach(() => {
    mockNote.mockImplementation((...args: unknown[]) =>
      (jest.requireActual('../../src/utils/askWardrobeFor') as typeof import('../../src/utils/askWardrobeFor')).noteAddedItem(
        ...(args as Parameters<typeof import('../../src/utils/askWardrobeFor').noteAddedItem>),
      ),
    );
  });

  it("builds up the signal without ever asking: three dresses never raise the question", async () => {
    await search([
      result('a', 'nordstrom.com', 'Satin cocktail dress'),
      result('b', 'zara.com', 'Floral maxi dress'),
      result('c', 'hm.com', 'Linen midi dress'),
    ]);
    await pressCard('Satin cocktail dress');
    await pressCard('Floral maxi dress');
    await pressCard('Linen midi dress');
    await flush();

    // the only alerts are the confirmations
    expect(alert.mock.calls.map(c => c[0])).toEqual(['Added to Wishlist', 'Added to Wishlist', 'Added to Wishlist']);
    expect(await wasAsked()).toBe(false);
    // ...but what they point to is kept, for the next item that can ask
    expect(await getAudienceSuggestion()).toBe('women');
  });
});
