/**
 * "Add from the web": words refine a photo's answer, and a second text search starts afresh.
 *
 *  - Photo tab: once the photo has an answer (even none, or an error) a box under it adds words to the
 *    photo's best guess; those results replace the photo's, with a way back that does not search again.
 *  - Include resale repeats a refined search with the new setting, a late answer never replaces a newer
 *    one, and an empty box does nothing.
 *  - Search tab: the typed words survive flipping tabs, and editing them and searching again searches
 *    the new words, from the key or the button.
 */
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchProductsByText: jest.fn(),
  searchByImage: jest.fn(),
}));
// Nor does adding an item read the shop's page for more pictures: no network from a unit test.
jest.mock('../../src/services/productUrlService', () => ({ fetchProductImages: jest.fn(async () => []) }));
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

import 'react-native';
import React from 'react';
import { Keyboard, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import WishlistSearchModal, {
  EMPTY_PHOTO_RESULTS_MESSAGE,
  EMPTY_TEXT_RESULTS_MESSAGE,
} from '../../src/screens/WishlistSearchModal';
import {
  searchByImage,
  searchProductsByText,
  type LensResult,
  type LensSearchResponse,
} from '../../src/services/lensSearchService';
import { pickImageFromLibrary } from '../../src/platform/imagePicker';

const searchText = searchProductsByText as jest.Mock;
const searchImage = searchByImage as jest.Mock;

const REFINE_LABEL = 'Add words to refine the photo results';

const item = (id: string, host: string, title: string): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://imgs.search.brave.com/${id}`,
  similarity: 0.5,
  isShopping: true,
});

const answer = (results: LensResult[], over: Partial<LensSearchResponse> = {}): LensSearchResponse => ({
  query: 'tan ankle boots',
  bestGuessLabels: ['tan ankle boots'],
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

const render = (visible = true) =>
  act(async () => {
    const el = <WishlistSearchModal visible={visible} onClose={onClose} />;
    if (tree) tree.update(el);
    else tree = renderer.create(el);
  });

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const text = () => JSON.stringify(tree.toJSON());

const pressable = (match: (n: renderer.ReactTestInstance) => boolean) =>
  tree.root.find(n => typeof n.props.onPress === 'function' && match(n));
const byLabel = (label: string) => pressable(n => n.props.accessibilityLabel === label);
const hasLabel = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;

const openTab = async (label: 'Search' | 'Photo') => {
  await act(async () => {
    tree.root
      .findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === label).length > 0)[0]
      .props.onPress();
  });
};

const pickPhoto = async () => {
  await openTab('Photo');
  const picker = pressable(n => /inspiration photo$/.test(n.props.accessibilityLabel ?? ''));
  await act(async () => {
    await picker.props.onPress();
  });
  await flush();
};

const box = (label: string) => tree.root.find(n => n.type === TextInput && n.props.accessibilityLabel === label);
const refineBox = () => box(REFINE_LABEL);
const hasRefineBox = () => tree.root.findAll(n => n.type === TextInput && n.props.accessibilityLabel === REFINE_LABEL).length > 0;
const textBox = () => box('Search for a product');

const typeInto = async (input: renderer.ReactTestInstance, value: string) => {
  await act(async () => {
    input.props.onChangeText(value);
  });
};

const refine = async (words: string) => {
  await typeInto(refineBox(), words);
  await act(async () => {
    refineBox().props.onSubmitEditing();
  });
  await flush();
};

const searchFor = async (words: string) => {
  await typeInto(textBox(), words);
  await act(async () => {
    textBox().props.onSubmitEditing();
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
    .findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 2)
    .map(n => String(n.props.children));

const photoResults = [item('p1', 'zara.com', 'Tan suede ankle boots'), item('p2', 'hm.com', 'Camel ankle boots')];
const refinedResults = [item('r1', 'nordstrom.com', 'Black leather ankle boots')];

beforeEach(() => {
  jest.clearAllMocks();
  tree = undefined as any;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (pickImageFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///boots.jpg' });
  searchImage.mockResolvedValue(answer(photoResults));
  searchText.mockResolvedValue(answer(refinedResults, { query: 'black leather ankle boots' }));
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('refining a photo result with words', () => {
  it('has no refine box until the photo has been answered, and none on the Search tab', async () => {
    await render();
    expect(hasRefineBox()).toBe(false);
    await openTab('Photo');
    expect(hasRefineBox()).toBe(false);

    await pickPhoto();
    expect(hasRefineBox()).toBe(true);
    expect(refineBox().props.placeholder).toBe('Add words: black leather, ankle, Coach...');

    await openTab('Search');
    expect(hasRefineBox()).toBe(false);
  });

  it('searches the photo\'s best guess plus the words, and shows those results in place of the photo\'s', async () => {
    await render();
    await pickPhoto();
    expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);

    await refine('black leather');

    expect(searchText).toHaveBeenCalledTimes(1);
    expect(searchText).toHaveBeenCalledWith('black leather ankle boots', { category: 'shoes', includeResale: false });
    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(shownTitles()).toEqual(['Black leather ankle boots']);
    expect(text()).toContain('black leather ankle boots');
  });

  it('passes a brand typed in the words along as the brand to look for', async () => {
    await render();
    await pickPhoto();
    await refine('Coach');
    expect(searchText).toHaveBeenCalledWith('Coach tan ankle boots', {
      category: 'shoes',
      brand: 'Coach',
      includeResale: false,
    });
  });

  it('searches from the Search button too', async () => {
    await render();
    await pickPhoto();
    await typeInto(refineBox(), 'black');
    await act(async () => {
      byLabel('Search').props.onPress();
    });
    await flush();
    expect(searchText).toHaveBeenCalledWith('black ankle boots', { category: 'shoes', includeResale: false });
  });

  it('shows the way back only while refined results are on screen', async () => {
    await render();
    await pickPhoto();
    expect(hasLabel('Back to photo results')).toBe(false);
    await refine('black');
    expect(hasLabel('Back to photo results')).toBe(true);
  });

  it('goes back to the photo results without searching again', async () => {
    await render();
    await pickPhoto();
    await refine('black leather');
    await act(async () => {
      byLabel('Back to photo results').props.onPress();
    });
    expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
    expect(hasLabel('Back to photo results')).toBe(false);
    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(searchText).toHaveBeenCalledTimes(1);
    // The words stay in the box to be changed.
    expect(refineBox().props.value).toBe('black leather');
  });

  it('refines the photo\'s answer again, not the refined one', async () => {
    await render();
    await pickPhoto();
    await refine('black leather');
    await refine('brown');
    expect(searchText).toHaveBeenLastCalledWith('brown ankle boots', { category: 'shoes', includeResale: false });
  });

  it('does nothing for an empty box, or one with only spaces or operators', async () => {
    await render();
    await pickPhoto();
    await refine('');
    await refine('   ');
    await act(async () => {
      byLabel('Search').props.onPress();
    });
    expect(searchText).not.toHaveBeenCalled();
    expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);

    await refine('"" ()');
    expect(searchText).not.toHaveBeenCalled();
    expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
  });

  it('offers the box when the photo found nothing, and searches the words alone if it named nothing', async () => {
    searchImage.mockResolvedValue(answer([], { query: '', bestGuessLabels: [] }));
    await render();
    await pickPhoto();
    expect(text()).toContain(EMPTY_PHOTO_RESULTS_MESSAGE);
    expect(hasRefineBox()).toBe(true);

    await refine('burgundy clutch');
    expect(searchText).toHaveBeenCalledWith('burgundy clutch', { category: 'bags', includeResale: false });
    expect(shownTitles()).toEqual(['Black leather ankle boots']);
  });

  it('offers the box when the photo search failed or is unavailable, since the words still work', async () => {
    searchImage.mockResolvedValue({ query: '', bestGuessLabels: [], results: [], notConfigured: true });
    await render();
    await pickPhoto();
    expect(text()).toContain("Photo search isn't available right now");
    expect(hasRefineBox()).toBe(true);
    await refine('white sneakers');
    expect(searchText).toHaveBeenCalledWith('white sneakers', { category: 'shoes', includeResale: false });
    expect(shownTitles()).toEqual(['Black leather ankle boots']);
  });

  it('talks about words, not the photo, when the refined search finds nothing, and keeps the way back', async () => {
    searchText.mockResolvedValue(answer([], { query: 'purple ankle boots' }));
    await render();
    await pickPhoto();
    await refine('purple');
    expect(text()).toContain(EMPTY_TEXT_RESULTS_MESSAGE);
    expect(text()).not.toContain(EMPTY_PHOTO_RESULTS_MESSAGE);
    expect(hasLabel('Back to photo results')).toBe(true);
  });

  it('shows a friendly error if the refined search throws, and keeps the way back', async () => {
    searchText.mockRejectedValue(new Error('ai-proxy brave 500'));
    await render();
    await pickPhoto();
    await refine('black');
    expect(text()).toContain("Couldn't search right now.");
    expect(text()).not.toMatch(/ai-proxy|brave/i);
    expect(hasLabel('Back to photo results')).toBe(true);
    await act(async () => {
      byLabel('Back to photo results').props.onPress();
    });
    expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
  });

  it('clears the words and the refined results when another photo is picked', async () => {
    await render();
    await pickPhoto();
    await refine('black leather');
    searchImage.mockResolvedValue(answer([item('n1', 'zara.com', 'New photo boots')], { query: 'new boots' }));
    await pickPhoto();
    expect(shownTitles()).toEqual(['New photo boots']);
    expect(refineBox().props.value).toBe('');
    expect(hasLabel('Back to photo results')).toBe(false);
  });

  it('starts over when the modal is closed', async () => {
    await render();
    await pickPhoto();
    await refine('black leather');
    await act(async () => {
      byLabel('Close').props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await openTab('Photo');
    expect(hasRefineBox()).toBe(false);
    expect(shownTitles()).toEqual([]);
  });

  describe('Include resale', () => {
    it('repeats the refined search with the new setting, and the photo results only filter', async () => {
      await render();
      await pickPhoto();
      await toggle(true);
      expect(searchText).not.toHaveBeenCalled();
      await toggle(false);

      await refine('black leather');
      expect(searchText).toHaveBeenLastCalledWith('black leather ankle boots', { category: 'shoes', includeResale: false });

      searchText.mockResolvedValue(
        answer([item('r1', 'nordstrom.com', 'Black leather ankle boots'), item('e1', 'ebay.com', 'Black boots eBay')]),
      );
      await toggle(true);
      expect(searchText).toHaveBeenCalledTimes(2);
      expect(searchText).toHaveBeenLastCalledWith('black leather ankle boots', { category: 'shoes', includeResale: true });
      expect(shownTitles()).toEqual(['Black leather ankle boots', 'Black boots eBay']);

      await toggle(false);
      expect(searchText).toHaveBeenLastCalledWith('black leather ankle boots', { category: 'shoes', includeResale: false });
      expect(searchImage).toHaveBeenCalledTimes(1);
    });

    it('refines with resale already on when it was switched on first', async () => {
      await render();
      await pickPhoto();
      await toggle(true);
      await refine('black');
      expect(searchText).toHaveBeenLastCalledWith('black ankle boots', { category: 'shoes', includeResale: true });
    });

    it('does not repeat a search once the person is back on the photo results', async () => {
      await render();
      await pickPhoto();
      await refine('black');
      await act(async () => {
        byLabel('Back to photo results').props.onPress();
      });
      await toggle(true);
      expect(searchText).toHaveBeenCalledTimes(1);
    });
  });

  describe('late answers', () => {
    it('ignores the answer to an earlier refine once a newer one was started', async () => {
      const first = defer<LensSearchResponse>();
      const second = defer<LensSearchResponse>();
      searchText.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      await render();
      await pickPhoto();
      await refine('black'); // still running
      await refine('brown');

      await act(async () => {
        second.resolve(answer([item('s2', 'zara.com', 'Second refine result')]));
      });
      await flush();
      await act(async () => {
        first.resolve(answer([item('s1', 'zara.com', 'Late first refine result')]));
      });
      await flush();

      expect(shownTitles()).toEqual(['Second refine result']);
    });

    it('ignores a refined answer that arrives after going back to the photo results', async () => {
      const slow = defer<LensSearchResponse>();
      searchText.mockReset().mockReturnValueOnce(slow.promise);
      await render();
      await pickPhoto();
      await refine('black');
      expect(text()).toContain('Searching the web');

      await act(async () => {
        byLabel('Back to photo results').props.onPress();
      });
      expect(text()).not.toContain('Searching the web');
      await act(async () => {
        slow.resolve(answer([item('s1', 'zara.com', 'Too late')]));
      });
      await flush();

      expect(shownTitles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
      expect(hasLabel('Back to photo results')).toBe(false);
    });

    it('ignores a refined answer that arrives after another photo was picked', async () => {
      const slow = defer<LensSearchResponse>();
      searchText.mockReset().mockReturnValueOnce(slow.promise);
      await render();
      await pickPhoto();
      await refine('black');

      searchImage.mockResolvedValue(answer([item('n1', 'zara.com', 'New photo boots')]));
      await pickPhoto();
      await act(async () => {
        slow.resolve(answer([item('s1', 'zara.com', 'Too late')]));
      });
      await flush();

      expect(shownTitles()).toEqual(['New photo boots']);
    });
  });
});

describe('searching by words', () => {
  it('keeps the typed words when the person flips to the Photo tab and back', async () => {
    await render();
    await typeInto(textBox(), 'burgundy clutch');
    await openTab('Photo');
    expect(tree.root.findAll(n => n.type === TextInput && n.props.accessibilityLabel === 'Search for a product')).toHaveLength(0);
    await openTab('Search');
    expect(textBox().props.value).toBe('burgundy clutch');
  });

  it('keeps the words and their results when flipping to the Photo tab and back after a search', async () => {
    searchText.mockResolvedValue(answer([item('b1', 'zara.com', 'Burgundy clutch')], { query: 'burgundy clutch' }));
    await render();
    await searchFor('burgundy clutch');
    await openTab('Photo');
    await openTab('Search');
    expect(textBox().props.value).toBe('burgundy clutch');
    expect(shownTitles()).toEqual(['Burgundy clutch']);
  });

  it('starts a fresh search for the new words when the box is edited while results are showing', async () => {
    searchText.mockResolvedValueOnce(answer([item('t1', 'zara.com', 'Tan boots')], { query: 'tan boots' }));
    searchText.mockResolvedValueOnce(answer([item('b1', 'zara.com', 'Black boots')], { query: 'black boots' }));
    await render();
    await searchFor('tan boots');
    expect(shownTitles()).toEqual(['Tan boots']);

    await searchFor('black boots');
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(searchText).toHaveBeenLastCalledWith('black boots', { includeResale: false });
    expect(shownTitles()).toEqual(['Black boots']);
  });

  it('searches again for the same words, such as after a failure', async () => {
    searchText.mockResolvedValueOnce(answer([], { query: 'tan boots', error: "Couldn't search right now. Check your connection and try again." }));
    searchText.mockResolvedValueOnce(answer([item('t1', 'zara.com', 'Tan boots')], { query: 'tan boots' }));
    await render();
    await searchFor('tan boots');
    expect(text()).toContain("Couldn't search right now.");

    await act(async () => {
      textBox().props.onSubmitEditing();
    });
    await flush();
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(shownTitles()).toEqual(['Tan boots']);
  });

  it('searches the text the keyboard reports, even if the last keystroke has not reached the box yet', async () => {
    await render();
    await typeInto(textBox(), 'black');
    await act(async () => {
      textBox().props.onSubmitEditing({ nativeEvent: { text: 'black jacket' } });
    });
    await flush();
    expect(searchText).toHaveBeenCalledWith('black jacket', { includeResale: false });
    expect(textBox().props.value).toBe('black jacket');
  });

  it('searches from the Search button, closing the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await render();
    await typeInto(textBox(), 'white sneakers');
    await act(async () => {
      byLabel('Search').props.onPress();
    });
    await flush();
    expect(dismiss).toHaveBeenCalled();
    expect(searchText).toHaveBeenCalledWith('white sneakers', { includeResale: false });
  });

  it('has a Search button that is disabled until something is typed', async () => {
    await render();
    expect(byLabel('Search').props.disabled).toBe(true);
    await typeInto(textBox(), 'x');
    expect(byLabel('Search').props.disabled).toBe(false);
    await typeInto(textBox(), '   ');
    expect(byLabel('Search').props.disabled).toBe(true);
  });

  it('does nothing for an empty box, and keeps the results already on screen', async () => {
    searchText.mockResolvedValue(answer([item('t1', 'zara.com', 'Tan boots')], { query: 'tan boots' }));
    await render();
    await searchFor('tan boots');
    await searchFor('   ');
    expect(searchText).toHaveBeenCalledTimes(1);
    expect(shownTitles()).toEqual(['Tan boots']);
  });

  it('clears the words with the clear button, and names it for screen readers', async () => {
    await render();
    await typeInto(textBox(), 'tan boots');
    await act(async () => {
      byLabel('Clear text').props.onPress();
    });
    expect(textBox().props.value).toBe('');
    expect(hasLabel('Clear text')).toBe(false);
  });

  it('gives the field a Return key that searches', async () => {
    await render();
    expect(textBox().props.returnKeyType).toBe('search');
    expect(textBox().props.autoCorrect).toBe(false);
  });
});

describe('keyboard', () => {
  it('gives the refine box a Return key that searches and closes the keyboard', async () => {
    await render();
    await pickPhoto();
    expect(refineBox().props.returnKeyType).toBe('search');
    expect(refineBox().props.blurOnSubmit).toBe(true);
    expect(refineBox().props.autoCorrect).toBe(false);
  });

  it('keeps the results in a scroll view that stays tappable with the keyboard open', async () => {
    await render();
    await pickPhoto();
    const scroller = tree.root.findAll(n => n.props.keyboardShouldPersistTaps === 'handled' && n.props.automaticallyAdjustKeyboardInsets === true);
    expect(scroller.length).toBeGreaterThan(0);
  });
});

describe('quick-refine chips', () => {
  const boots = (query: string) =>
    answer(
      [
        item('c1', 'zara.com', 'Black leather boots'),
        item('c2', 'hm.com', 'Black suede boots'),
        item('c3', 'nordstrom.com', 'Brown leather boots'),
        item('c4', 'asos.com', 'Plain boots'),
      ],
      { query },
    );
  const chips = () =>
    tree.root
      .findAll(n => typeof n.props.onPress === 'function' && /^Narrow down to /.test(n.props.accessibilityLabel ?? ''), {
        deep: false,
      })
      .map(n => String(n.props.accessibilityLabel).replace('Narrow down to ', ''));
  const tap = async (word: string) => {
    await act(async () => {
      byLabel(`Narrow down to ${word}`).props.onPress();
    });
    await flush();
  };

  it('offers the words the results share, under the results header', async () => {
    searchText.mockResolvedValue(boots('boots'));
    await render();
    await searchFor('boots');
    expect(chips()).toEqual(['black', 'leather']);
  });

  it('offers none when the results share nothing, or there are none', async () => {
    searchText.mockResolvedValue(answer([], { query: 'boots' }));
    await render();
    await searchFor('boots');
    expect(chips()).toEqual([]);
  });

  it('searches again with the word added, and shows it in the box', async () => {
    searchText.mockResolvedValue(boots('boots'));
    await render();
    await searchFor('boots');
    await tap('leather');
    expect(searchText).toHaveBeenLastCalledWith('leather boots', { includeResale: false });
    expect(textBox().props.value).toBe('leather boots');
  });

  it('swaps the colour searched for with the one tapped', async () => {
    searchText.mockResolvedValue(
      answer(
        [
          item('c1', 'zara.com', 'Black leather boots'),
          item('c2', 'hm.com', 'Black suede boots'),
          item('c3', 'nordstrom.com', 'Brown leather boots'),
          item('c4', 'asos.com', 'Brown suede boots'),
          item('c5', 'gap.com', 'Plain boots'),
        ],
        { query: 'tan boots' },
      ),
    );
    await render();
    await searchFor('tan boots');
    expect(chips()).toEqual(['black', 'brown', 'leather', 'suede']);
    await tap('black');
    expect(searchText).toHaveBeenLastCalledWith('black boots', { includeResale: false });
    expect(textBox().props.value).toBe('black boots');
  });

  it('refines the photo results when one is tapped on the Photo tab, and adds to the words typed', async () => {
    searchImage.mockResolvedValue(boots('boots'));
    await render();
    await pickPhoto();
    expect(chips()).toEqual(['black', 'leather']);

    searchText.mockResolvedValue(boots('black boots'));
    await tap('black');
    expect(searchText).toHaveBeenLastCalledWith('black boots', { category: 'shoes', includeResale: false });
    expect(refineBox().props.value).toBe('black');
    expect(hasLabel('Back to photo results')).toBe(true);

    await tap('leather');
    expect(searchText).toHaveBeenLastCalledWith('leather black boots', { category: 'shoes', includeResale: false });
    expect(refineBox().props.value).toBe('leather black');
  });
});
