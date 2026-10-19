/**
 * "Is it one of these?": web matches are listed shops first and second-hand
 * last, each card says what kind of site it is, the brand is only guessed from
 * a brand's own site, and a pasted link stays first. The refine box adds the
 * person's words to what the photo was taken for, shows those results in place
 * of the photo's, and offers the way back.
 */
jest.mock('../../src/services/productUrlService', () => ({
  fetchProductMetadata: jest.fn(),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchProductsByText: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import MatchPickerSheet from '../../src/screens/MatchPickerSheet';
import { searchProductsByText, type LensResult } from '../../src/services/lensSearchService';
import { fetchProductMetadata } from '../../src/services/productUrlService';

const searchText = searchProductsByText as jest.Mock;
const fetchMeta = fetchProductMetadata as jest.Mock;

const item = (id: string, host: string, title: string, over: Partial<LensResult> = {}): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://img.example.com/${id}.jpg`,
  similarity: 0.9,
  isShopping: true,
  ...over,
});

let tree: renderer.ReactTestRenderer;
const onPick = jest.fn();

const mount = (lensResults: LensResult[], searchHint?: string) => {
  act(() => {
    tree = renderer.create(
      <MatchPickerSheet
        loading={false}
        kbMatches={[]}
        lensResults={lensResults}
        searchHint={searchHint}
        onPick={onPick}
        onSkip={jest.fn()}
      />,
    );
  });
};

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const text = () => JSON.stringify(tree.toJSON());

/** Card titles in display order (cards show their title on two lines at most). */
const cardTitles = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 2)
    .map(n => String(n.props.children));

const badgeTexts = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && ['Retail', 'Resale', 'Marketplace'].includes(n.props.children))
    .map(n => n.props.children);

const pressByText = async (label: string) => {
  const target = tree.root.findAll(
    n => n.type === Pressable && n.findAll(c => c.props.children === label).length > 0,
  )[0];
  await act(async () => {
    await target.props.onPress();
  });
};

const search = async (q: string) => {
  // The refine box is open from the start.
  const input = tree.root.findByType(TextInput);
  await act(async () => {
    input.props.onChangeText(q);
  });
  await act(async () => {
    input.props.onSubmitEditing();
  });
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('ordering and labels', () => {
  it('lists shops before second-hand listings, each labelled', () => {
    mount([
      item('e1', 'ebay.com', 'Tan boots eBay'),
      item('z1', 'zara.com', 'Tan boots Zara'),
      item('b1', 'smallboutique.example', 'Tan boots boutique'),
      item('p1', 'poshmark.com', 'Tan boots Posh'),
    ]);
    expect(cardTitles()).toEqual(['Tan boots Zara', 'Tan boots boutique', 'Tan boots eBay', 'Tan boots Posh']);
    // The boutique is a site we know nothing about: no label rather than a made-up one.
    expect(badgeTexts()).toEqual(['Retail', 'Resale', 'Resale']);
  });

  it('shows the results of a refine in place of the photo matches, shops first', async () => {
    mount([item('e1', 'ebay.com', 'Tan boots eBay'), item('z1', 'zara.com', 'Tan boots Zara')]);
    searchText.mockResolvedValue({
      query: 'tan boots',
      bestGuessLabels: [],
      results: [item('d1', 'depop.com', 'Black boots Depop'), item('n1', 'nordstrom.com', 'Black boots Nordstrom')],
    });

    await search('black');

    expect(cardTitles()).toEqual(['Black boots Nordstrom', 'Black boots Depop']);
  });

  it('adds the typed words to what the photo was taken for', async () => {
    mount([item('z1', 'zara.com', 'Tan boots Zara')], 'tan ankle boots');
    searchText.mockResolvedValue({ query: 'x', bestGuessLabels: [], results: [item('n1', 'nordstrom.com', 'Black boots')] });

    await search('black leather');

    const [query] = searchText.mock.calls[0];
    expect(query).toContain('ankle boots');
    expect(query).toContain('black');
    expect(query).toContain('leather');
    // a typed colour replaces the one the photo guessed
    expect(query).not.toContain('tan');
  });

  it('goes back to the photo matches', async () => {
    mount([item('z1', 'zara.com', 'Tan boots Zara')]);
    searchText.mockResolvedValue({ query: 'x', bestGuessLabels: [], results: [item('n1', 'nordstrom.com', 'Black boots')] });
    await search('black boots');
    expect(cardTitles()).toEqual(['Black boots']);
    expect(text()).toContain('Back to photo matches');

    await pressByText('Back to photo matches');

    expect(cardTitles()).toEqual(['Tan boots Zara']);
    expect(text()).not.toContain('Back to photo matches');
  });

  it('keeps what is on screen when a refine finds nothing, and says so', async () => {
    mount([item('z1', 'zara.com', 'Tan boots Zara')]);
    searchText.mockResolvedValue({ query: 'x', bestGuessLabels: [], results: [] });
    await search('qwertyuiop');
    expect(cardTitles()).toEqual(['Tan boots Zara']);
    expect(text()).toContain('No shop results for that. Try fewer words.');
  });

  it('does nothing for a blank refine', async () => {
    mount([item('z1', 'zara.com', 'Tan boots Zara')]);
    await search('   ');
    expect(searchText).not.toHaveBeenCalled();
  });

  it('keeps results from sites it does not know, which used to be dropped', async () => {
    mount([]);
    searchText.mockResolvedValue({
      query: 'tan boots',
      bestGuessLabels: [],
      results: [item('b1', 'smallboutique.example', 'Tan boots boutique', { isShopping: false })],
    });
    await search('tan boots');
    expect(cardTitles()).toEqual(['Tan boots boutique']);
  });

  it('does not list the same page twice when a search finds one the photo already found', async () => {
    const same = item('z1', 'zara.com', 'Tan boots Zara');
    mount([same]);
    searchText.mockResolvedValue({
      query: 'tan boots',
      bestGuessLabels: [],
      results: [{ ...same, id: 'brave-9' }],
    });
    await search('tan boots');
    expect(cardTitles()).toEqual(['Tan boots Zara']);
  });

  it('says so when a search finds no shop results', async () => {
    mount([]);
    searchText.mockResolvedValue({ query: 'x', bestGuessLabels: [], results: [] });
    await search('qwertyuiop');
    expect(text()).toContain('No shop results for that. Try fewer words.');
  });

  it('leaves out a result with no picture, which could not be recognised as a match', async () => {
    mount([]);
    searchText.mockResolvedValue({
      query: 'x',
      bestGuessLabels: [],
      results: [item('z1', 'zara.com', 'No picture', { imageUrl: '' })],
    });
    await search('tan boots');
    expect(cardTitles()).toEqual([]);
    expect(text()).toContain('No shop results for that.');
  });
});

describe('pasted link', () => {
  it('stays first, even when the page is on a second-hand site', async () => {
    mount([item('z1', 'zara.com', 'Tan boots Zara')]);
    fetchMeta.mockResolvedValue(item('url-1', 'ebay.com', 'The exact boots', { sourceKind: 'resale' }));

    await pressByText('URL');
    const input = tree.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('https://www.ebay.com/itm/1');
    });
    await act(async () => {
      input.props.onSubmitEditing();
    });
    await flush();

    expect(cardTitles()).toEqual(['The exact boots', 'Tan boots Zara']);
    expect(badgeTexts()).toEqual(['Resale', 'Retail']);
  });
});

describe('picking a match', () => {
  const pick = async (title: string) => {
    const card = tree.root.findAll(
      n => n.type === Pressable && n.findAll(c => c.props.children === title).length > 0,
    )[0];
    await act(async () => {
      card.props.onPress();
    });
  };

  it('names the brand only when the site is the brand\'s own', async () => {
    mount([
      item('e1', 'ebay.com', 'Bottega Veneta - Andiamo Large shopper bag'),
      item('z1', 'zara.com', 'Tan boots Zara'),
      item('n1', 'nordstrom.com', 'Tan boots Nordstrom'),
    ]);
    await pick('Bottega Veneta - Andiamo Large shopper bag');
    await pick('Tan boots Zara');
    await pick('Tan boots Nordstrom');

    const picked = onPick.mock.calls.map(c => c[0]);
    expect(picked.map(p => p.brand)).toEqual([undefined, 'Zara', undefined]);
    expect(picked.map(p => p.retailer)).toEqual(['ebay.com', 'zara.com', 'nordstrom.com']);
    expect(picked.every(p => p.source === 'lens_match')).toBe(true);
  });
});
