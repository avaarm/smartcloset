/**
 * Wishlist "Add from the web" modal: shops first with a Retail / Resale label
 * on each card, an "Include resale" switch (off by default, remembered while
 * the modal stays mounted), an honest empty state, and an item saved with the
 * right category and brand.
 */
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchProductsByText: jest.fn(),
  searchByImage: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/platform/imagePicker', () => ({
  pickImageFromLibrary: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Alert, Image, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WishlistSearchModal, {
  EMPTY_PHOTO_RESULTS_MESSAGE,
  EMPTY_TEXT_RESULTS_MESSAGE,
  guessBrand,
  guessCategory,
} from '../../src/screens/WishlistSearchModal';
import {
  searchByImage,
  searchProductsByText,
  type LensResult,
  type LensSearchResponse,
} from '../../src/services/lensSearchService';
import { saveClothingItem } from '../../src/services/storage';
import { pickImageFromLibrary } from '../../src/platform/imagePicker';

const searchText = searchProductsByText as jest.Mock;
const searchImage = searchByImage as jest.Mock;
const save = saveClothingItem as jest.Mock;

const item = (id: string, host: string, title: string, over: Partial<LensResult> = {}): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://imgs.search.brave.com/${id}`,
  similarity: 0.5,
  isShopping: true,
  ...over,
});

const response = (results: LensResult[], over: Partial<LensSearchResponse> = {}): LensSearchResponse => ({
  query: 'tan boots',
  bestGuessLabels: ['tan boots'],
  results,
  ...over,
});

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const defer = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

let tree: renderer.ReactTestRenderer;
const onClose = jest.fn();
const onAdded = jest.fn();

const render = (visible = true) =>
  act(async () => {
    const el = <WishlistSearchModal visible={visible} onClose={onClose} onAdded={onAdded} />;
    if (tree) tree.update(el);
    else tree = renderer.create(el);
  });

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const text = () => JSON.stringify(tree.toJSON());

const type = async (value: string) => {
  const input = tree.root.findByType(TextInput);
  await act(async () => {
    input.props.onChangeText(value);
  });
  await act(async () => {
    input.props.onSubmitEditing();
  });
  await flush();
};

const toggle = async (on: boolean) => {
  await act(async () => {
    tree.root.findByType(Switch).props.onValueChange(on);
  });
  await flush();
};

/** The titles of the result cards, in the order they are shown. */
const shownTitles = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && typeof n.props.numberOfLines === 'number' && n.props.numberOfLines === 2)
    .map(n => String(n.props.children));

const badges = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && ['Retail', 'Resale', 'Marketplace'].includes(n.props.children))
    .map(n => n.props.children);

beforeEach(() => {
  jest.clearAllMocks();
  tree = undefined as any;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('Include resale switch', () => {
  it('is off by default and says what it covers', async () => {
    await render();
    expect(tree.root.findByType(Switch).props.value).toBe(false);
    expect(text()).toContain('Include resale');
    expect(text()).toContain('Poshmark');
  });

  it('repeats the shown text search with resale included, and back', async () => {
    searchText.mockResolvedValue(response([item('z1', 'zara.com', 'Tan suede boots')]));
    await render();
    await type('tan boots');
    expect(searchText).toHaveBeenLastCalledWith('tan boots', { includeResale: false });

    searchText.mockResolvedValue(
      response([item('z1', 'zara.com', 'Tan suede boots'), item('e1', 'ebay.com', 'Tan boots size 8')]),
    );
    await toggle(true);
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(searchText).toHaveBeenLastCalledWith('tan boots', { includeResale: true });
    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(shownTitles()).toEqual(['Tan suede boots', 'Tan boots size 8']);

    searchText.mockResolvedValue(response([item('z1', 'zara.com', 'Tan suede boots')]));
    await toggle(false);
    expect(searchText).toHaveBeenLastCalledWith('tan boots', { includeResale: false });
  });

  it('does not search when nothing has been searched yet', async () => {
    await render();
    await toggle(true);
    expect(searchText).not.toHaveBeenCalled();
    expect(searchImage).not.toHaveBeenCalled();
  });

  it('is remembered when the modal is closed and opened again', async () => {
    await render();
    await toggle(true);
    await render(false);
    await render(true);
    expect(tree.root.findByType(Switch).props.value).toBe(true);
  });

  it('filters a photo search on screen without searching again', async () => {
    const shops = Array.from({ length: 6 }, (_, i) => item(`s${i}`, 'zara.com', `Tan suede boots ${i}`));
    const resale = [item('e1', 'ebay.com', 'Tan boots eBay'), item('p1', 'poshmark.com', 'Tan boots Posh')];
    (pickImageFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///boots.jpg' });
    searchImage.mockResolvedValue(response([...shops, ...resale]));
    await render();

    await act(async () => {
      tree.root.findAll(n => n.props.accessibilityLabel === undefined && typeof n.props.onPress === 'function')
        .find(n => n.findAll(c => c.props.children === 'Photo').length > 0)!.props.onPress();
    });
    await act(async () => {
      tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'Pick an inspiration photo').length > 0)[0].props.onPress();
    });
    await flush();

    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(shownTitles()).toHaveLength(6);
    expect(badges().every(b => b === 'Retail')).toBe(true);

    await toggle(true);
    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(shownTitles()).toHaveLength(8);
    expect(badges().slice(6)).toEqual(['Resale', 'Resale']);
  });
});

describe('results', () => {
  it('shows what kind of site each result is on', async () => {
    searchText.mockResolvedValue(
      response([
        item('z1', 'zara.com', 'Tan suede boots'),
        item('b1', 'smallboutique.example', 'Boutique tan boots'),
        item('a1', 'aliexpress.com', 'Cheap tan boots'),
        item('e1', 'ebay.com', 'Used tan boots'),
      ]),
    );
    await render();
    await type('tan boots');

    expect(shownTitles()).toEqual(['Tan suede boots', 'Boutique tan boots', 'Cheap tan boots', 'Used tan boots']);
    // No label for a site we know nothing about.
    expect(badges()).toEqual(['Retail', 'Marketplace', 'Resale']);
  });

  it('loads https pictures only, and swaps in a placeholder when one fails', async () => {
    searchText.mockResolvedValue(
      response([
        item('z1', 'zara.com', 'Tan suede boots', { imageUrl: 'http://static.zara.net/1.jpg' }),
        item('z2', 'hm.com', 'No picture', { imageUrl: 'data:image/png;base64,AAAA' }),
      ]),
    );
    await render();
    await type('tan boots');

    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect((images[0].props.source as any).uri).toBe('https://static.zara.net/1.jpg');
    act(() => {
      images[0].props.onError({ nativeEvent: { error: 'boom' } });
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(shownTitles()).toContain('Tan suede boots');
  });

  it('says so, honestly, when a text search finds nothing, without sending the person to "include resale"', async () => {
    searchText.mockResolvedValue(response([]));
    await render();
    await type('qwertyuiop');
    expect(text()).toContain(EMPTY_TEXT_RESULTS_MESSAGE);
    expect(EMPTY_TEXT_RESULTS_MESSAGE).toBe('No results for that. Try different or fewer words.');
    expect(text()).not.toContain('include resale listings');
    // Resale is kept whenever shops are scarce, so flipping the switch cannot help: same advice either way.
    await toggle(true);
    expect(text()).toContain(EMPTY_TEXT_RESULTS_MESSAGE);
    expect(text()).not.toContain('include resale listings');
  });

  describe('when a photo search finds nothing', () => {
    const photoSearch = async () => {
      (pickImageFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///boots.jpg' });
      searchImage.mockResolvedValue(response([], { query: '', bestGuessLabels: [] }));
      await render();
      await act(async () => {
        tree.root.findAll(n => typeof n.props.onPress === 'function')
          .find(n => n.findAll(c => c.props.children === 'Photo').length > 0)!.props.onPress();
      });
      await act(async () => {
        tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'Pick an inspiration photo').length > 0)[0].props.onPress();
      });
      await flush();
    };

    it('talks about the photo, not about words or resale', async () => {
      await photoSearch();
      expect(text()).toContain(EMPTY_PHOTO_RESULTS_MESSAGE);
      expect(EMPTY_PHOTO_RESULTS_MESSAGE).toBe('No matches found. Try a clearer photo or a different angle.');
      expect(text()).not.toContain('fewer words');
      expect(text()).not.toContain('include resale listings');
    });

    it('keeps saying so about the photo if the person flips back to the Search tab', async () => {
      await photoSearch();
      await act(async () => {
        tree.root.findAll(n => typeof n.props.onPress === 'function')
          .find(n => n.findAll(c => c.props.children === 'Search').length > 0)!.props.onPress();
      });
      expect(text()).toContain(EMPTY_PHOTO_RESULTS_MESSAGE);
      expect(text()).not.toContain(EMPTY_TEXT_RESULTS_MESSAGE);
    });
  });

  it('shows the search error, not "no results", when the search fails', async () => {
    searchText.mockResolvedValue(response([], { error: "Couldn't search right now. Check your connection and try again." }));
    await render();
    await type('tan boots');
    expect(text()).toContain("Couldn't search right now.");
    expect(text()).not.toContain(EMPTY_TEXT_RESULTS_MESSAGE);
  });

  it('shows a friendly error if the search throws', async () => {
    searchText.mockRejectedValue(new Error('ai-proxy brave 500'));
    await render();
    await type('tan boots');
    expect(text()).toContain("Couldn't search right now.");
    expect(text()).not.toMatch(/ai-proxy|brave/i);
  });

  it('ignores the answer to an earlier search once a newer one was started', async () => {
    const first = defer<LensSearchResponse>();
    const second = defer<LensSearchResponse>();
    searchText.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render();
    await type('tan boots'); // first search is still running
    await toggle(true); // starts the second

    await act(async () => {
      second.resolve(response([item('z2', 'zara.com', 'Second search result')]));
    });
    await flush();
    await act(async () => {
      first.resolve(response([item('z1', 'zara.com', 'Late first result')]));
    });
    await flush();

    expect(shownTitles()).toEqual(['Second search result']);
  });
});

describe('saving a result to the wishlist', () => {
  const pressCard = async (title: string) => {
    const card = tree.root.findAll(
      n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === title).length > 0,
    )[0];
    await act(async () => {
      await card.props.onPress();
    });
  };

  it('files a bag under bags, with the brand only when the site is the brand', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    searchText.mockResolvedValue(
      response([
        item('e1', 'ebay.com', 'Bottega Veneta - Women - Andiamo Large shopper bag - Brown'),
        item('z1', 'zara.com', 'Suede knee high boots'),
        item('n1', 'nordstrom.com', 'Gold hoop earrings'),
      ]),
    );
    await render();
    await type('bag');

    await pressCard('Bottega Veneta - Women - Andiamo Large shopper bag - Brown');
    await pressCard('Suede knee high boots');
    await pressCard('Gold hoop earrings');

    const saved = save.mock.calls.map(c => c[0]);
    expect(saved.map(s => s.category)).toEqual(['bags', 'shoes', 'jewelry']);
    // eBay and Nordstrom sell every brand, so neither is guessed as the brand.
    expect(saved.map(s => s.brand)).toEqual(['', 'Zara', '']);
    expect(saved.every(s => s.isWishlist === true)).toBe(true);
    expect(saved[0].retailer).toBe('ebay.com');
    expect(onAdded).toHaveBeenCalledTimes(3);
  });
});

describe('category and brand guesses', () => {
  it.each([
    ['Tan suede knee-high boots', 'shoes'],
    ['Leather tote bag', 'bags'],
    ['Bottega Veneta - Women - Andiamo Large shopper bag - Brown', 'bags'],
    ['Burgundy velvet clutch', 'bags'],
    ['Canvas backpack', 'bags'],
    ['Pearl necklace', 'jewelry'],
    ['Gold hoop earrings', 'jewelry'],
    ['Silver chain bracelet', 'jewelry'],
    ['Wool beanie', 'hats'],
    ['Straw sun hat', 'hats'],
    ['Black baseball cap', 'hats'],
    ['Chelsea boots', 'shoes'],
    ['Suede ankle booties', 'shoes'],
    ['Silk scarf', 'accessories'],
    ['Leather belt', 'accessories'],
    ['Mystery thing', 'accessories'],
    ['Andiamo Large', 'accessories'],
  ])('files %j under %s', (title, category) => {
    expect(guessCategory(title)).toBe(category);
  });

  it('does not read a word inside another word as a product', () => {
    expect(guessCategory('Ringer tee')).toBe('tops');
    expect(guessCategory('Bootcut jeans')).toBe('bottoms');
  });

  it('names a brand only from the brand\'s own site', () => {
    expect(guessBrand('us.gucci.com')).toBe('Gucci');
    expect(guessBrand('www.goldengoose.com')).toBe('Golden Goose');
    expect(guessBrand('ebay.com')).toBeUndefined();
    expect(guessBrand('poshmark.com')).toBeUndefined();
    expect(guessBrand('macys.com')).toBeUndefined();
    // A shop we know nothing about is the retailer, not a brand.
    expect(guessBrand('bootbarn.com')).toBeUndefined();
    expect(guessBrand('smallboutique.example')).toBeUndefined();
  });
});
