/**
 * Match sheet: result cards load https images only, fall back to a
 * placeholder when an image fails, tolerate missing price/title, and the sheet
 * has no catalog "Browse" option. A picked card hands its listed price to the
 * form as a New price (retailCost) when it comes from a shop or a brand, and as
 * a Used price (cost) when it comes from a resale site.
 */
jest.mock('../../src/services/productUrlService', () => ({
  fetchProductMetadata: jest.fn(async () => null),
}));

import 'react-native';
import React from 'react';
import { Image, Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import MatchPickerSheet from '../../src/screens/MatchPickerSheet';
import type { LensResult } from '../../src/services/lensSearchService';

const item = (over: Partial<LensResult> = {}): LensResult => ({
  id: 'r1',
  title: 'Blue linen shirt',
  source: 'zara.com',
  url: 'https://www.zara.com/p1',
  imageUrl: 'https://static.zara.net/1.jpg',
  similarity: 0.9,
  isShopping: true,
  ...over,
});

const mount = (props: Partial<React.ComponentProps<typeof MatchPickerSheet>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MatchPickerSheet
        loading={false}
        kbMatches={[]}
        lensResults={[]}
        onPick={jest.fn()}
        onSkip={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
};

const text = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());
const cardFor = (tree: renderer.ReactTestRenderer, title: string) =>
  tree.root.findAllByType(Pressable).find(p => p.findAll(n => n.props.children === title).length > 0);

describe('MatchPickerSheet', () => {
  it('says there are no matches and offers text/URL search only (no catalog Browse)', () => {
    const tree = mount();
    expect(text(tree)).toContain('No matches found');
    expect(text(tree)).toContain('You can still fill in the details yourself.');
    expect(text(tree)).toContain('Text');
    expect(text(tree)).toContain('URL');
    expect(text(tree)).not.toContain('Browse');
    expect(text(tree)).not.toContain('Be the first');
  });

  it('shows the friendly reason when the search failed', () => {
    const tree = mount({ searchError: 'Sign in to search for matches.' });
    expect(text(tree)).toContain("Couldn't search for matches");
    expect(text(tree)).toContain('Sign in to search for matches.');
    expect(text(tree)).not.toContain('No matches found');
  });

  it('shows a spinner, not the empty state, while loading', () => {
    const tree = mount({ loading: true });
    expect(text(tree)).toContain('Finding matches');
    expect(text(tree)).not.toContain('No matches found');
  });

  it('loads card images over https only', () => {
    const tree = mount({ lensResults: [item({ imageUrl: 'http://static.zara.net/1.jpg' })] });
    const images = tree.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect((images[0].props.source as any).uri).toBe('https://static.zara.net/1.jpg');
  });

  it('shows a placeholder instead of an image for a non-http image URL', () => {
    const tree = mount({ lensResults: [item({ imageUrl: 'javascript:alert(1)' })] });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(text(tree)).toContain('Blue linen shirt');
  });

  it('swaps in the placeholder when an image fails to load, without crashing', () => {
    const tree = mount({ lensResults: [item()] });
    const [img] = tree.root.findAllByType(Image);
    act(() => {
      img.props.onError({ nativeEvent: { error: 'boom' } });
    });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(text(tree)).toContain('Blue linen shirt');
  });

  it('renders results with no price, an empty price, and an empty title', () => {
    const tree = mount({
      lensResults: [
        item({ id: 'a', price: undefined }),
        item({ id: 'b', price: '', url: 'https://www.zara.com/p2' }),
        item({ id: 'c', title: '', url: 'https://www.zara.com/p3', price: '$40' }),
      ],
    });
    expect(text(tree)).toContain('$40');
  });

  it('hands the picked card to the form with an https image, its shop price as the New price', () => {
    const onPick = jest.fn();
    const tree = mount({
      onPick,
      lensResults: [item({ imageUrl: 'http://static.zara.net/1.jpg', price: '$1,200.50' })],
    });
    act(() => {
      cardFor(tree, 'Blue linen shirt')!.props.onPress();
    });
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Blue linen shirt',
        brand: 'Zara',
        retailer: 'zara.com',
        retailCost: 1200.5,
        sourceUrl: 'https://www.zara.com/p1',
        imageUrl: 'https://static.zara.net/1.jpg',
        source: 'lens_match',
      }),
    );
    expect(onPick.mock.calls[0][0].cost).toBeUndefined();
  });
});

describe('the price a picked card hands to the form', () => {
  /** Mounts one card and returns what it passes to onPick. */
  const picked = (over: Partial<LensResult>) => {
    const onPick = jest.fn();
    const tree = mount({ onPick, lensResults: [item(over)] });
    act(() => {
      cardFor(tree, over.title ?? 'Blue linen shirt')!.props.onPress();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    return onPick.mock.calls[0][0] as { cost?: number; retailCost?: number };
  };

  it.each([
    ['a brand site', 'zara.com'],
    ['a department store', 'nordstrom.com'],
    ['a site nobody has classified', 'smallboutique.example'],
  ])('%s: the listed price is the New price (retailCost), and there is no Used price', (_label, source) => {
    const p = picked({ source, price: '$89.99' });
    expect(p.retailCost).toBe(89.99);
    expect(p.cost).toBeUndefined();
  });

  it.each([
    ['eBay', 'ebay.com'],
    ['Poshmark', 'poshmark.com'],
    ['Etsy', 'etsy.com'],
    ['a regional eBay', 'ebay.co.uk'],
  ])('%s, a resale site: the listed price is the Used price (cost), and there is no New price', (_label, source) => {
    const p = picked({ source, price: '$89.99' });
    expect(p.cost).toBe(89.99);
    expect(p.retailCost).toBeUndefined();
  });

  it('goes by the kind the search stamped on the result, over what the host says', () => {
    expect(picked({ source: 'smallboutique.example', sourceKind: 'resale', price: '$40' })).toEqual(
      expect.objectContaining({ cost: 40, retailCost: undefined }),
    );
    expect(picked({ source: 'ebay.com', sourceKind: 'retail', price: '$40' })).toEqual(
      expect.objectContaining({ retailCost: 40, cost: undefined }),
    );
  });

  it.each([
    ['no price', undefined],
    ['an empty price', ''],
    ['a price with no digits', 'Price on request'],
    ['a zero price', '$0.00'],
  ])('%s sets neither price, from a shop or a resale site', (_label, price) => {
    for (const source of ['zara.com', 'ebay.com']) {
      const p = picked({ source, price });
      expect(p.cost).toBeUndefined();
      expect(p.retailCost).toBeUndefined();
    }
  });

  it('reads thousands separators and cents on both kinds', () => {
    expect(picked({ source: 'gucci.com', price: '$1,234.56' }).retailCost).toBe(1234.56);
    expect(picked({ source: 'therealreal.com', price: 'US$ 1,234.56' }).cost).toBe(1234.56);
  });

  it('never sets both prices from a single listing', () => {
    for (const source of ['zara.com', 'ebay.com', 'smallboutique.example']) {
      const p = picked({ source, price: '$50' });
      expect([p.cost, p.retailCost].filter(v => v !== undefined)).toEqual([50]);
    }
  });
});

describe('the price a picked community match hands to the form', () => {
  it('passes the average paid as the Used price and the retail price as the New price, as they are', () => {
    const onPick = jest.fn();
    const tree = mount({
      onPick,
      kbMatches: [{ name: 'Andiamo large shopper', category: 'bags', confirmationCount: 3, confidence: 0.9, cost: 120, retailCost: 300 }],
    });
    act(() => {
      cardFor(tree, 'Andiamo large shopper')!.props.onPress();
    });
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Andiamo large shopper', source: 'kb_match', cost: 120, retailCost: 300 }),
    );
  });

  it('passes a single price on its own', () => {
    const onPick = jest.fn();
    const tree = mount({
      onPick,
      kbMatches: [{ name: 'Wool coat', category: 'outerwear', confirmationCount: 2, confidence: 0.8, retailCost: 450 }],
    });
    act(() => {
      cardFor(tree, 'Wool coat')!.props.onPress();
    });
    const p = onPick.mock.calls[0][0];
    expect(p.retailCost).toBe(450);
    expect(p.cost).toBeUndefined();
  });
});
