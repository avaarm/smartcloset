import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSource = jest.fn();
const mockSign = jest.fn();
jest.mock('../../src/services/proPhotoUrls', () => ({
  proPhotoSource: (...a: any[]) => mockSource(...a),
}));
jest.mock('../../src/services/imageUrls', () => ({
  signStoragePaths: (...a: any[]) => mockSign(...a),
}));

import ProPhoto from '../../src/components/ProPhoto';

const CONN = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

type Props = React.ComponentProps<typeof ProPhoto>;

const source = (n = 1) => ({
  uri: `https://example.supabase.co/functions/v1/pro-photo?c=${CONN}&i=${ITEM}`,
  headers: { Authorization: `Bearer token-${n}`, apikey: 'anon' },
});

const mount = async (props: Props = {}) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<ProPhoto accessibilityLabel="Photo" {...props} />); });
  const update = async (next: Props) => {
    await act(async () => { tree.update(<ProPhoto accessibilityLabel="Photo" {...next} />); });
  };
  return { tree, update };
};
const image = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Image)[0];
const images = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Image);

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
};

beforeEach(() => {
  mockSource.mockReset().mockResolvedValue(source());
  mockSign.mockReset().mockImplementation(async (p: string[]) => new Map(p.map(x => [x, `https://signed/${x}`])));
});

describe('ProPhoto, a stylist looking at a shared piece', () => {
  it('draws the image the pro-photo function serves, with the request headers', async () => {
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM, hasPhoto: true });
    expect(mockSource).toHaveBeenCalledWith(CONN, ITEM);
    expect(image(tree).props.source).toEqual(source());
    expect(image(tree).props.source.headers.Authorization).toBe('Bearer token-1');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('treats an unknown hasPhoto as "try it"', async () => {
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    expect(images(tree)).toHaveLength(1);
  });

  it('shows a placeholder and asks for nothing when the piece has no photo', async () => {
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM, hasPhoto: false });
    expect(images(tree)).toHaveLength(0);
    expect(mockSource).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('shows the placeholder while the request is being made', async () => {
    const pending = deferred<ReturnType<typeof source> | null>();
    mockSource.mockReturnValue(pending.promise);
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    expect(images(tree)).toHaveLength(0);
    await act(async () => { pending.resolve(source()); });
    expect(images(tree)).toHaveLength(1);
  });

  it('shows the placeholder for a guest or a piece it cannot build a request for', async () => {
    mockSource.mockResolvedValue(null);
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    expect(images(tree)).toHaveLength(0);
  });

  it('shows the placeholder, and logs nothing, when the request helper throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSource.mockRejectedValue(new Error('boom'));
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    expect(images(tree)).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks once more after an image error (a 404 included), then gives up quietly', async () => {
    mockSource.mockResolvedValueOnce(source(1)).mockResolvedValueOnce(source(2));
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    expect(image(tree).props.source.headers.Authorization).toBe('Bearer token-1');

    await act(async () => { image(tree).props.onError(); });
    expect(mockSource).toHaveBeenCalledTimes(2);
    expect(image(tree).props.source.headers.Authorization).toBe('Bearer token-2');

    await act(async () => { image(tree).props.onError(); });
    expect(mockSource).toHaveBeenCalledTimes(2);
    expect(images(tree)).toHaveLength(0);
  });

  it('remounts the image on the retry, even when the request is the same', async () => {
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    const first = image(tree);
    const firstSource = first.props.source;
    await act(async () => { first.props.onError(); });
    expect(image(tree).props.source).toEqual(firstSource);
    // A new instance: React remounted the view (the old one is gone), so the picture is requested again.
    expect(() => first.props).toThrow();
    expect(images(tree)).toHaveLength(1);
  });

  it('gives up at once if the retry cannot build a request', async () => {
    mockSource.mockResolvedValueOnce(source()).mockResolvedValueOnce(null);
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    await act(async () => { image(tree).props.onError(); });
    expect(images(tree)).toHaveLength(0);
  });

  it('starts again for another piece, with a fresh retry', async () => {
    const OTHER = '33333333-3333-4333-8333-333333333333';
    const { tree, update } = await mount({ connectionId: CONN, itemId: ITEM });
    await act(async () => { image(tree).props.onError(); });
    await act(async () => { image(tree).props.onError(); });
    expect(images(tree)).toHaveLength(0);

    await update({ connectionId: CONN, itemId: OTHER });
    expect(mockSource).toHaveBeenLastCalledWith(CONN, OTHER);
    expect(images(tree)).toHaveLength(1);
    await act(async () => { image(tree).props.onError(); });
    expect(images(tree)).toHaveLength(1);
  });

  it('drops an answer for the piece it was pointed at before', async () => {
    const OTHER = '33333333-3333-4333-8333-333333333333';
    const slow = deferred<ReturnType<typeof source> | null>();
    mockSource.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ ...source(), uri: 'https://example.supabase.co/other' });
    const { tree, update } = await mount({ connectionId: CONN, itemId: ITEM });
    await update({ connectionId: CONN, itemId: OTHER });
    await act(async () => { slow.resolve(source()); });
    expect(image(tree).props.source.uri).toBe('https://example.supabase.co/other');
  });

  it('ignores an answer that arrives after it unmounted', async () => {
    const slow = deferred<ReturnType<typeof source> | null>();
    mockSource.mockReturnValue(slow.promise);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { tree } = await mount({ connectionId: CONN, itemId: ITEM });
    await act(async () => { tree.unmount(); });
    await act(async () => { slow.resolve(source()); });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ProPhoto, a person looking at their own piece', () => {
  it('uses the normal own-photo signing and asks the stylist function for nothing', async () => {
    const { tree } = await mount({ ownPath: 'user-1/a.jpg', hasPhoto: true });
    expect(mockSign).toHaveBeenCalledWith(['user-1/a.jpg']);
    expect(mockSource).not.toHaveBeenCalled();
    expect(image(tree).props.source).toEqual({ uri: 'https://signed/user-1/a.jpg' });
  });

  it('shows the placeholder when there is no path, or no photo, or it cannot be signed', async () => {
    expect(images((await mount({ ownPath: null })).tree)).toHaveLength(0);
    expect(images((await mount({ ownPath: '' })).tree)).toHaveLength(0);
    expect(images((await mount({ ownPath: 'user-1/a.jpg', hasPhoto: false })).tree)).toHaveLength(0);
    expect(mockSign).not.toHaveBeenCalled();

    mockSign.mockResolvedValue(new Map());
    expect(images((await mount({ ownPath: 'user-1/gone.jpg' })).tree)).toHaveLength(0);
  });

  it('asks once more after an image error, then gives up quietly', async () => {
    const { tree } = await mount({ ownPath: 'user-1/a.jpg' });
    await act(async () => { image(tree).props.onError(); });
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(images(tree)).toHaveLength(1);
    await act(async () => { image(tree).props.onError(); });
    expect(images(tree)).toHaveLength(0);
  });
});

describe('ProPhoto never shows or keeps a path', () => {
  it('puts neither the path nor the ids into anything it renders', async () => {
    // The link the app signs is the image address itself; everything else on screen is checked here.
    mockSign.mockResolvedValue(new Map([['user-1/secret-file.jpg', 'https://signed/opaque']]));
    const own = await mount({ ownPath: 'user-1/secret-file.jpg' });
    const flat = JSON.stringify(own.tree.toJSON());
    expect(flat).not.toContain('secret-file');
    expect(flat).not.toContain('user-1');

    mockSource.mockResolvedValue(null);
    const stylist = await mount({ connectionId: CONN, itemId: ITEM });
    const placeholder = JSON.stringify(stylist.tree.toJSON());
    expect(placeholder).not.toContain(CONN);
    expect(placeholder).not.toContain(ITEM);
  });

  it('labels the picture with what the caller said and nothing else', async () => {
    const { tree } = await mount({ ownPath: 'user-1/a.jpg', accessibilityLabel: 'Blue jacket' });
    expect(image(tree).props.accessibilityLabel).toBe('Blue jacket');
  });

  it('writes nothing to storage and has no module-scope work', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/ProPhoto.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/AsyncStorage|console\.(error|warn|log)|navigate\(/);
  });
});
