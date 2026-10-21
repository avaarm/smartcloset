/**
 * The photo list of the Add / Edit form as plain functions: cover moves, removals, the person's own photos and the
 * pictures a picked shop match brings.
 */
import {
  EMPTY_GALLERY,
  addOwnPhotos,
  appendShopPhotos,
  makeCover,
  removePhoto,
  replaceCover,
  replaceShopPhotos,
  type Gallery,
} from '../../src/utils/photoGallery';
import { MAX_ITEM_IMAGES } from '../../src/utils/itemImages';

const g = (photos: string[], shop: string[] = []): Gallery => ({ photos, shop });
const urls = (n: number, prefix = 'https://shop.example/p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}.jpg`);

describe('makeCover', () => {
  it('moves the photo to the front and keeps the order of the rest', () => {
    expect(makeCover(g(['a', 'b', 'c', 'd']), 'c').photos).toEqual(['c', 'a', 'b', 'd']);
  });

  it('changes nothing for the cover itself or a photo that is not there', () => {
    const start = g(['a', 'b']);
    expect(makeCover(start, 'a')).toBe(start);
    expect(makeCover(start, 'z')).toBe(start);
  });

  it('keeps which photos are the shop\'s', () => {
    expect(makeCover(g(['a', 'b', 's'], ['s']), 's')).toEqual({ photos: ['s', 'a', 'b'], shop: ['s'] });
  });
});

describe('removePhoto', () => {
  it('takes the photo out; removing the cover makes the next photo the cover', () => {
    expect(removePhoto(g(['a', 'b', 'c']), 'b').photos).toEqual(['a', 'c']);
    expect(removePhoto(g(['a', 'b', 'c']), 'a').photos).toEqual(['b', 'c']);
  });

  it('can empty the list, and forgets a removed shop photo', () => {
    expect(removePhoto(g(['a']), 'a')).toEqual(EMPTY_GALLERY);
    expect(removePhoto(g(['a', 's'], ['s']), 's')).toEqual({ photos: ['a'], shop: [] });
  });

  it('ignores a photo that is not there', () => {
    const start = g(['a']);
    expect(removePhoto(start, 'z')).toBe(start);
  });
});

describe('replaceCover', () => {
  it('puts the new photo where the cover was and leaves the others', () => {
    expect(replaceCover(g(['a', 'b', 'c']), 'x').photos).toEqual(['x', 'b', 'c']);
  });

  it('starts the list when there is no cover yet', () => {
    expect(replaceCover(EMPTY_GALLERY, 'x').photos).toEqual(['x']);
  });

  it('drops a replaced shop cover from the shop photos, and never repeats a photo', () => {
    expect(replaceCover(g(['s', 'b'], ['s']), 'b')).toEqual({ photos: ['b'], shop: [] });
  });
});

describe('addOwnPhotos', () => {
  it('adds after the photos already there, once each, up to the limit', () => {
    expect(addOwnPhotos(g(['a']), ['b', 'a', 'c']).photos).toEqual(['a', 'b', 'c']);
    const full = addOwnPhotos(g(urls(7, 'own')), ['x', 'y', 'z']);
    expect(full.photos).toHaveLength(MAX_ITEM_IMAGES);
    expect(full.photos[7]).toBe('x');
  });
});

describe('replaceShopPhotos', () => {
  it('makes the first shop picture the cover when there are no photos, with the rest after it', () => {
    expect(replaceShopPhotos(EMPTY_GALLERY, ['c1', 'e1', 'e2'])).toEqual({ photos: ['c1', 'e1', 'e2'], shop: ['c1', 'e1', 'e2'] });
  });

  it('puts the shop pictures after the person\'s photos, which stay the cover', () => {
    expect(replaceShopPhotos(g(['mine']), ['c1', 'e1'])).toEqual({ photos: ['mine', 'c1', 'e1'], shop: ['c1', 'e1'] });
  });

  it('replaces what the previous match brought and keeps everything else', () => {
    const before = g(['mine', 'extra', 'c1', 'e1'], ['c1', 'e1']);
    expect(replaceShopPhotos(before, ['c2', 'e2'])).toEqual({ photos: ['mine', 'extra', 'c2', 'e2'], shop: ['c2', 'e2'] });
  });

  it('does not repeat a photo the person already has, or bring back one they removed', () => {
    const out = replaceShopPhotos(g(['https://shop.example/a.jpg']), ['https://shop.example/a.jpg', 'b', 'c'], new Set(['b']));
    expect(out.photos).toEqual(['https://shop.example/a.jpg', 'c']);
    expect(out.shop).toEqual(['c']);
  });

  it('never goes past the limit and never pushes the person\'s photos out', () => {
    const own = urls(6, 'own');
    const out = replaceShopPhotos(g(own), ['c', 'e1', 'e2', 'e3']);
    expect(out.photos).toEqual([...own, 'c', 'e1']);
    expect(out.shop).toEqual(['c', 'e1']);
    expect(replaceShopPhotos(g(urls(MAX_ITEM_IMAGES, 'own')), ['c']).shop).toEqual([]);
  });
});

describe('appendShopPhotos', () => {
  it('adds more pictures on the end and marks them as the shop\'s', () => {
    expect(appendShopPhotos(g(['mine', 'c1'], ['c1']), ['c1', 'e1', 'e2'])).toEqual({
      photos: ['mine', 'c1', 'e1', 'e2'],
      shop: ['c1', 'e1', 'e2'],
    });
  });

  it('leaves the order alone, including a shop picture the person made the cover', () => {
    expect(appendShopPhotos(g(['c1', 'mine'], ['c1']), ['e1']).photos).toEqual(['c1', 'mine', 'e1']);
  });

  it('adds only what fits, skips removed pictures, and returns the same list when nothing is added', () => {
    const six = g(urls(6, 'own'));
    expect(appendShopPhotos(six, ['a', 'b', 'c']).photos).toHaveLength(MAX_ITEM_IMAGES);
    expect(appendShopPhotos(six, ['a', 'b'], new Set(['a'])).photos.slice(6)).toEqual(['b']);
    const start = g(['mine']);
    expect(appendShopPhotos(start, ['mine'])).toBe(start);
    expect(appendShopPhotos(start, [])).toBe(start);
  });
});
