/**
 * Match sheet: result cards load https images only, fall back to a
 * placeholder when an image fails, tolerate missing price/title, and the sheet
 * has no catalog "Browse" option.
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

  it('hands the picked card to the form with an https image', () => {
    const onPick = jest.fn();
    const tree = mount({
      onPick,
      lensResults: [item({ imageUrl: 'http://static.zara.net/1.jpg', price: '$1,200.50' })],
    });
    const card = tree.root
      .findAllByType(Pressable)
      .find(p => p.findAll(n => n.props.children === 'Blue linen shirt').length > 0);
    act(() => {
      card!.props.onPress();
    });
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Blue linen shirt',
        brand: 'Zara',
        retailer: 'zara.com',
        cost: 1200.5,
        sourceUrl: 'https://www.zara.com/p1',
        imageUrl: 'https://static.zara.net/1.jpg',
        source: 'lens_match',
      }),
    );
  });
});
