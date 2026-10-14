import 'react-native';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSign = jest.fn();
const mockForget = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: (...a: any[]) => mockSign(...a),
  forgetSwapPhoto: (...a: any[]) => mockForget(...a),
}));

import SwapPhoto from '../../src/components/SwapPhoto';

const mount = async (path?: string | null) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SwapPhoto path={path} accessibilityLabel="Photo" />); });
  return tree;
};
const image = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Image)[0];

beforeEach(() => {
  mockSign.mockReset().mockImplementation(async (p: string[]) => new Map(p.map(x => [x, `https://signed/${x}`])));
  mockForget.mockReset();
});

describe('SwapPhoto', () => {
  it('shows the photo once its link is ready', async () => {
    const tree = await mount('a.jpg');
    expect(image(tree).props.source).toEqual({ uri: 'https://signed/a.jpg' });
  });

  it('shows a placeholder and asks for nothing when there is no photo', async () => {
    const tree = await mount(null);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('asks for a fresh link once if the first one fails, then gives up quietly', async () => {
    const tree = await mount('a.jpg');
    mockSign.mockImplementation(async (p: string[]) => new Map(p.map(x => [x, `https://signed2/${x}`])));
    await act(async () => { image(tree).props.onError(); });
    expect(mockForget).toHaveBeenCalledWith('a.jpg');
    expect(image(tree).props.source).toEqual({ uri: 'https://signed2/a.jpg' });
    await act(async () => { image(tree).props.onError(); });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('shows the placeholder when a photo cannot be signed', async () => {
    mockSign.mockResolvedValue(new Map());
    const tree = await mount('gone.jpg');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });
});
