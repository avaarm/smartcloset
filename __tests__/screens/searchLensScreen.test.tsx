/**
 * "Search a look" (photo search): shops first with a label on each card;
 * second-hand listings are left out once there are enough shop results unless
 * "Include resale" is on; switching it filters the results on screen without
 * searching again.
 */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));
jest.mock('../../src/platform/imagePicker', () => ({
  pickImageFromLibrary: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Pressable, Switch } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import LensSearchScreen from '../../src/screens/LensSearchScreen';
import { searchByImage, type LensResult } from '../../src/services/lensSearchService';
import { pickImageFromLibrary } from '../../src/platform/imagePicker';

const searchImage = searchByImage as jest.Mock;

const item = (id: string, host: string, title: string): LensResult => ({
  id,
  title,
  source: host,
  url: `https://www.${host}/p/${id}`,
  imageUrl: `https://img.example.com/${id}.jpg`,
  similarity: 0.5,
  isShopping: true,
});

let tree: renderer.ReactTestRenderer;
const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });
const text = () => JSON.stringify(tree.toJSON());

const titles = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && n.props.numberOfLines === 2)
    .map(n => String(n.props.children));
const badges = (): string[] =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text' && ['Retail', 'Resale', 'Marketplace'].includes(n.props.children))
    .map(n => n.props.children);

const pickPhoto = async () => {
  (pickImageFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///look.jpg' });
  const picker = tree.root.findAll(
    n => n.type === Pressable && n.findAll(c => c.props.children === 'Pick a photo').length > 0,
  )[0];
  await act(async () => {
    await picker.props.onPress();
  });
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  act(() => {
    tree = renderer.create(<LensSearchScreen />);
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

describe('LensSearchScreen', () => {
  it('has the Include resale switch off by default', () => {
    expect(tree.root.findByType(Switch).props.value).toBe(false);
  });

  it('labels each card and lists shops before resale while shop results are few', async () => {
    searchImage.mockResolvedValue({
      query: 'tan boots',
      bestGuessLabels: ['tan boots'],
      results: [item('z1', 'zara.com', 'Tan boots Zara'), item('e1', 'ebay.com', 'Tan boots eBay')],
    });
    await pickPhoto();
    expect(titles()).toEqual(['Tan boots Zara', 'Tan boots eBay']);
    expect(badges()).toEqual(['Retail', 'Resale']);
  });

  it('hides resale once there are six shop results, and brings it back with the switch, without a new search', async () => {
    const shops = Array.from({ length: 6 }, (_, i) => item(`s${i}`, 'zara.com', `Tan boots ${i}`));
    searchImage.mockResolvedValue({
      query: 'tan boots',
      bestGuessLabels: ['tan boots'],
      results: [...shops, item('e1', 'ebay.com', 'Tan boots eBay'), item('p1', 'poshmark.com', 'Tan boots Posh')],
    });
    await pickPhoto();
    expect(titles()).toHaveLength(6);
    expect(badges().every(b => b === 'Retail')).toBe(true);

    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(true);
    });
    expect(titles()).toHaveLength(8);
    expect(badges().slice(6)).toEqual(['Resale', 'Resale']);
    expect(searchImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(false);
    });
    expect(titles()).toHaveLength(6);
  });

  it('shows the friendly message, not a developer error, if the search throws', async () => {
    searchImage.mockRejectedValue(new Error('ai-proxy vision 500: boom'));
    await pickPhoto();
    expect(text()).toContain("Couldn't search right now. Check your connection and try again.");
    expect(text()).not.toMatch(/ai-proxy|boom/);
  });

  it('says nothing was found rather than inventing matches', async () => {
    searchImage.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
    await pickPhoto();
    expect(text()).toContain('No matches found');
    expect(titles()).toEqual([]);
  });
});
