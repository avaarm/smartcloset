/**
 * "Search a look": works with words, with a photo, or both.
 *
 *  - A box for describing the look, before any photo.
 *  - After a photo, a Refine box under its best guess adds words to it; those results replace the
 *    photo's, with a way back that does not search again.
 *  - Include resale repeats a words search with the new setting; a late answer never replaces a newer one.
 */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
  searchProductsByText: jest.fn(),
}));
jest.mock('../../src/platform/imagePicker', () => ({
  pickImageFromLibrary: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Linking, Pressable, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import LensSearchScreen from '../../src/screens/LensSearchScreen';
import {
  searchByImage,
  searchProductsByText,
  type LensResult,
  type LensSearchResponse,
} from '../../src/services/lensSearchService';
import { pickImageFromLibrary } from '../../src/platform/imagePicker';

const searchImage = searchByImage as jest.Mock;
const searchText = searchProductsByText as jest.Mock;

const DESCRIBE_LABEL = 'Describe what you are looking for';
const REFINE_LABEL = 'Add words to refine the photo results';

const item = (id: string, host: string, title: string): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://img.example.com/${id}.jpg`,
  similarity: 0.5,
  isShopping: true,
});

const answer = (results: LensResult[], over: Partial<LensSearchResponse> = {}): LensSearchResponse => ({
  query: 'tan ankle boots',
  bestGuessLabels: ['tan ankle boots', 'boot'],
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
const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });
const text = () => JSON.stringify(tree.toJSON());
const flat = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flat).join('');
  return flat(node.children);
};

const titles = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 2)
    .map(n => String(n.props.children));

const pressable = (match: (n: renderer.ReactTestInstance) => boolean) =>
  tree.root.find(n => typeof n.props.onPress === 'function' && match(n));
const byLabel = (label: string) => pressable(n => n.props.accessibilityLabel === label);
const hasLabel = (label: string) =>
  tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;

const boxes = (label: string) => tree.root.findAll(n => n.type === TextInput && n.props.accessibilityLabel === label);
const box = (label: string) => tree.root.find(n => n.type === TextInput && n.props.accessibilityLabel === label);

const typeInto = async (input: renderer.ReactTestInstance, value: string) => {
  await act(async () => {
    input.props.onChangeText(value);
  });
};
const searchFor = async (words: string) => {
  await typeInto(box(DESCRIBE_LABEL), words);
  await act(async () => {
    box(DESCRIBE_LABEL).props.onSubmitEditing();
  });
  await flush();
};
const refine = async (words: string) => {
  await typeInto(box(REFINE_LABEL), words);
  await act(async () => {
    box(REFINE_LABEL).props.onSubmitEditing();
  });
  await flush();
};
const pickPhoto = async () => {
  (pickImageFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///look.jpg' });
  const picker = pressable(n => n.type === Pressable && /^(Pick a photo|Photo to search)/.test(n.props.accessibilityLabel ?? ''));
  await act(async () => {
    await picker.props.onPress();
  });
  await flush();
};
const toggle = async (on: boolean) => {
  await act(async () => {
    tree.root.findByType(Switch).props.onValueChange(on);
  });
  await flush();
};

const photoResults = [item('z1', 'zara.com', 'Tan suede ankle boots'), item('h1', 'hm.com', 'Camel ankle boots')];
const wordResults = [item('n1', 'nordstrom.com', 'Black leather ankle boots')];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  searchImage.mockResolvedValue(answer(photoResults));
  searchText.mockResolvedValue(answer(wordResults, { query: 'black leather ankle boots', bestGuessLabels: ['black leather ankle boots'] }));
  act(() => {
    tree = renderer.create(<LensSearchScreen />);
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('describing a look in words', () => {
  it('has a box for it, with an example, and no refine box yet', () => {
    expect(box(DESCRIBE_LABEL).props.placeholder).toBe('Describe it, e.g. burgundy clutch');
    expect(boxes(REFINE_LABEL)).toHaveLength(0);
    expect(text()).toContain('Describe a clothing item');
  });

  it('searches the web for the words and lists what it finds, saying what it searched for', async () => {
    searchText.mockResolvedValue(answer([item('b1', 'zara.com', 'Burgundy clutch')], { query: 'burgundy clutch' }));
    await searchFor('burgundy clutch');
    expect(searchText).toHaveBeenCalledWith('burgundy clutch', { includeResale: false });
    expect(searchImage).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Burgundy clutch']);
    expect(flat(tree.toJSON())).toContain('1 result for "burgundy clutch"');
    // Words are not a "best guess".
    expect(text()).not.toContain('BEST GUESS');
  });

  it('searches from the Search button', async () => {
    await typeInto(box(DESCRIBE_LABEL), 'white sneakers');
    await act(async () => {
      byLabel('Search').props.onPress();
    });
    await flush();
    expect(searchText).toHaveBeenCalledWith('white sneakers', { includeResale: false });
  });

  it('does nothing for an empty box', async () => {
    await searchFor('   ');
    expect(searchText).not.toHaveBeenCalled();
    expect(text()).toContain('How it works');
  });

  it('starts a fresh search when the words are edited and searched again', async () => {
    await searchFor('tan boots');
    await searchFor('black boots');
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(searchText).toHaveBeenLastCalledWith('black boots', { includeResale: false });
  });

  it('says so, with advice about words, when nothing is found', async () => {
    searchText.mockResolvedValue(answer([], { query: 'qwerty' }));
    await searchFor('qwerty');
    expect(text()).toContain('No matches found');
    expect(text()).toContain('Try different or fewer words.');
    expect(text()).not.toContain('clearer photo');
  });

  it('shows the friendly message, not a developer error, if the search throws', async () => {
    searchText.mockRejectedValue(new Error('ai-proxy brave 500: boom'));
    await searchFor('tan boots');
    expect(text()).toContain("Couldn't search right now. Check your connection and try again.");
    expect(text()).not.toMatch(/ai-proxy|boom/);
  });

  it('repeats the search when Include resale is flipped, since resale is left out at the source', async () => {
    await searchFor('tan boots');
    searchText.mockResolvedValue(
      answer([item('n1', 'nordstrom.com', 'Tan boots'), item('e1', 'ebay.com', 'Tan boots eBay')], { query: 'tan boots' }),
    );
    await toggle(true);
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(searchText).toHaveBeenLastCalledWith('tan boots', { includeResale: true });
    expect(titles()).toEqual(['Tan boots', 'Tan boots eBay']);
    await toggle(false);
    expect(searchText).toHaveBeenLastCalledWith('tan boots', { includeResale: false });
  });

  it('does not search when Include resale is flipped before anything was searched', async () => {
    await toggle(true);
    expect(searchText).not.toHaveBeenCalled();
    expect(searchImage).not.toHaveBeenCalled();
  });

  it('ignores the answer to an earlier search once a newer one was started', async () => {
    const first = defer<LensSearchResponse>();
    const second = defer<LensSearchResponse>();
    searchText.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await searchFor('tan boots');
    await searchFor('black boots');
    await act(async () => {
      second.resolve(answer([item('s2', 'zara.com', 'Second result')], { query: 'black boots' }));
    });
    await flush();
    await act(async () => {
      first.resolve(answer([item('s1', 'zara.com', 'Late first result')], { query: 'tan boots' }));
    });
    await flush();
    expect(titles()).toEqual(['Second result']);
  });

  it('opens a result in the browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await searchFor('tan boots');
    const card = pressable(n => n.type === Pressable && n.findAll(c => c.props.children === 'Black leather ankle boots').length > 0);
    await act(async () => {
      card.props.onPress();
    });
    expect(open).toHaveBeenCalledWith('https://www.nordstrom.com/p/n1');
  });
});

describe('refining a photo with words', () => {
  it('swaps the describe box for a Refine box under the best guess once the photo is answered', async () => {
    await pickPhoto();
    expect(boxes(DESCRIBE_LABEL)).toHaveLength(0);
    expect(text()).toContain('BEST GUESS');
    expect(text()).toContain('tan ankle boots');
    expect(text()).toContain('REFINE');
    expect(box(REFINE_LABEL).props.placeholder).toBe('Add words: black leather, ankle, Coach...');
  });

  it('puts the Refine box under the best guess, above the results', async () => {
    await pickPhoto();
    const order = JSON.stringify(tree.toJSON());
    expect(order.indexOf('BEST GUESS')).toBeLessThan(order.indexOf('REFINE'));
    expect(order.indexOf('REFINE')).toBeLessThan(order.indexOf('Tan suede ankle boots'));
  });

  it('searches the best guess plus the words and shows those results in place of the photo\'s', async () => {
    await pickPhoto();
    await refine('black leather');
    expect(searchText).toHaveBeenCalledWith('black leather ankle boots', { category: 'shoes', includeResale: false });
    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(titles()).toEqual(['Black leather ankle boots']);
    // The best guess stays on screen as the thing being refined.
    expect(text()).toContain('BEST GUESS');
  });

  it('searches from the Search button', async () => {
    await pickPhoto();
    await typeInto(box(REFINE_LABEL), 'Coach');
    await act(async () => {
      byLabel('Search').props.onPress();
    });
    await flush();
    expect(searchText).toHaveBeenCalledWith('Coach tan ankle boots', { category: 'shoes', brand: 'Coach', includeResale: false });
  });

  it('goes back to the photo results without searching again', async () => {
    await pickPhoto();
    await refine('black leather');
    expect(hasLabel('Back to photo results')).toBe(true);
    await act(async () => {
      byLabel('Back to photo results').props.onPress();
    });
    expect(titles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
    expect(hasLabel('Back to photo results')).toBe(false);
    expect(searchImage).toHaveBeenCalledTimes(1);
    expect(searchText).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty Refine box', async () => {
    await pickPhoto();
    await refine('   ');
    expect(searchText).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
  });

  it('shows the box when the photo found nothing, with advice about the photo, and refines from the words alone', async () => {
    searchImage.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
    await pickPhoto();
    expect(text()).toContain('No matches found');
    expect(text()).toContain('clearer photo');
    expect(boxes(REFINE_LABEL)).toHaveLength(1);
    await refine('burgundy clutch');
    expect(searchText).toHaveBeenCalledWith('burgundy clutch', { category: 'bags', includeResale: false });
    expect(titles()).toEqual(['Black leather ankle boots']);
  });

  it('shows the box when the photo search failed, since the words still work', async () => {
    searchImage.mockRejectedValue(new Error('ai-proxy vision 500: boom'));
    await pickPhoto();
    expect(text()).toContain("Couldn't search right now.");
    expect(boxes(REFINE_LABEL)).toHaveLength(1);
  });

  it('talks about words when the refined search finds nothing, and keeps the way back', async () => {
    searchText.mockResolvedValue(answer([], { query: 'purple ankle boots' }));
    await pickPhoto();
    await refine('purple');
    expect(text()).toContain('Try different or fewer words.');
    expect(hasLabel('Back to photo results')).toBe(true);
  });

  it('repeats the refined search when Include resale is flipped, but only filters the photo results', async () => {
    await pickPhoto();
    await toggle(true);
    expect(searchText).not.toHaveBeenCalled();
    await refine('black');
    expect(searchText).toHaveBeenLastCalledWith('black ankle boots', { category: 'shoes', includeResale: true });
    await toggle(false);
    expect(searchText).toHaveBeenCalledTimes(2);
    expect(searchText).toHaveBeenLastCalledWith('black ankle boots', { category: 'shoes', includeResale: false });
  });

  it('ignores the answer to an earlier refine once a newer one was started, or after going back', async () => {
    const first = defer<LensSearchResponse>();
    const second = defer<LensSearchResponse>();
    searchText.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await pickPhoto();
    await refine('black');
    await refine('brown');
    await act(async () => {
      second.resolve(answer([item('s2', 'zara.com', 'Second refine result')]));
    });
    await flush();
    await act(async () => {
      first.resolve(answer([item('s1', 'zara.com', 'Late first refine result')]));
    });
    await flush();
    expect(titles()).toEqual(['Second refine result']);

    const slow = defer<LensSearchResponse>();
    searchText.mockReturnValueOnce(slow.promise);
    await refine('red');
    await act(async () => {
      byLabel('Back to photo results').props.onPress();
    });
    await act(async () => {
      slow.resolve(answer([item('s3', 'zara.com', 'Too late')]));
    });
    await flush();
    expect(titles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
  });

  it('starts from the photo\'s own answer when a new photo is picked, with the words cleared', async () => {
    await pickPhoto();
    await refine('black leather');
    searchImage.mockResolvedValue(answer([item('n2', 'zara.com', 'New photo result')], { query: 'new boots' }));
    await pickPhoto();
    expect(titles()).toEqual(['New photo result']);
    expect(box(REFINE_LABEL).props.value).toBe('');
    expect(hasLabel('Back to photo results')).toBe(false);
  });

  it('brings the describe box back when the photo is cleared', async () => {
    await searchFor('burgundy clutch');
    await pickPhoto();
    await refine('black');
    await act(async () => {
      byLabel('Clear').props.onPress();
    });
    expect(boxes(REFINE_LABEL)).toHaveLength(0);
    expect(box(DESCRIBE_LABEL).props.value).toBe('');
    expect(titles()).toEqual([]);
    expect(text()).toContain('How it works');
  });

  it('replaces words results with the photo\'s when a photo is picked after searching in words', async () => {
    await searchFor('burgundy clutch');
    expect(titles()).toEqual(['Black leather ankle boots']);
    await pickPhoto();
    expect(titles()).toEqual(['Tan suede ankle boots', 'Camel ankle boots']);
  });
});

describe('keyboard', () => {
  it('gives both boxes a Return key that searches, and no autocorrect', async () => {
    const describe = box(DESCRIBE_LABEL);
    expect(describe.props.returnKeyType).toBe('search');
    expect(describe.props.autoCorrect).toBe(false);
    await pickPhoto();
    expect(box(REFINE_LABEL).props.returnKeyType).toBe('search');
  });

  it('scrolls in a keyboard-safe scroll view, so the boxes and the results stay reachable', () => {
    const scroller = tree.root.findAll(
      n =>
        n.props.keyboardShouldPersistTaps === 'handled' &&
        n.props.automaticallyAdjustKeyboardInsets === true &&
        n.props.keyboardDismissMode === 'interactive',
    );
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

  it('narrows a words search by one tap, and puts the new words in the box', async () => {
    searchText.mockResolvedValue(boots('boots'));
    await searchFor('boots');
    expect(chips()).toEqual(['black', 'leather']);
    await tap('leather');
    expect(searchText).toHaveBeenLastCalledWith('leather boots', { includeResale: false });
    expect(box(DESCRIBE_LABEL).props.value).toBe('leather boots');
  });

  it('refines a photo\'s results by one tap', async () => {
    searchImage.mockResolvedValue(boots('boots'));
    await pickPhoto();
    searchText.mockResolvedValue(boots('black boots'));
    await tap('black');
    expect(searchText).toHaveBeenLastCalledWith('black boots', { category: 'shoes', includeResale: false });
    expect(box(REFINE_LABEL).props.value).toBe('black');
    expect(hasLabel('Back to photo results')).toBe(true);
  });
});
