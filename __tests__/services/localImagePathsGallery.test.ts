/**
 * A guest's photos live under a per-install folder; when the app's container moves, the paths inside the
 * gallery (`images`) are re-anchored with the cover.
 */
import { rehomeItemImages } from '../../src/services/localImagePaths';

// jest.setup.js mocks react-native-fs with DocumentDirectoryPath = /mock/documents
const NOW = 'file:///mock/documents';
const OLD = 'file:///var/mobile/Containers/Data/Application/OLD/Documents';

describe('rehomeItemImages and the gallery', () => {
  it('re-anchors every local photo in the gallery and leaves the others', () => {
    const fixed = rehomeItemImages({
      userImage: `${OLD}/a.jpg`,
      retailerImage: `${OLD}/a.jpg`,
      images: [`${OLD}/a.jpg`, 'https://shop.example/b.jpg', `${OLD}/c.jpg`, '/var/mobile/Containers/Data/Application/X/Documents/d.jpg', 'file:///var/tmp/pick.jpg'],
    });
    expect(fixed.images).toEqual([
      `${NOW}/a.jpg`,
      'https://shop.example/b.jpg',
      `${NOW}/c.jpg`,
      `${NOW}/d.jpg`,
      'file:///var/tmp/pick.jpg',
    ]);
    expect(fixed.userImage).toBe(`${NOW}/a.jpg`);
    expect(fixed.retailerImage).toBe(`${NOW}/a.jpg`);
  });

  it('fixes a gallery even when the cover fields need nothing', () => {
    const fixed = rehomeItemImages({ userImage: 'https://shop.example/a.jpg', images: ['https://shop.example/a.jpg', `${OLD}/b.jpg`] });
    expect(fixed.images).toEqual(['https://shop.example/a.jpg', `${NOW}/b.jpg`]);
  });

  it('returns the very same object when nothing moves, gallery or not', () => {
    const remote = { userImage: 'https://x/y.jpg', images: ['https://x/y.jpg', 'https://x/z.jpg'] };
    expect(rehomeItemImages(remote)).toBe(remote);
    const current = { userImage: `${NOW}/a.jpg`, images: [`${NOW}/a.jpg`, `${NOW}/b.jpg`] };
    expect(rehomeItemImages(current)).toBe(current);
    const noGallery = { userImage: 'https://x/y.jpg' };
    expect(rehomeItemImages(noGallery)).toBe(noGallery);
  });

  it('does not invent a gallery for an item that has none', () => {
    const fixed = rehomeItemImages({ userImage: `${OLD}/a.jpg`, retailerImage: `${OLD}/a.jpg` });
    expect('images' in fixed).toBe(false);
  });

  it('keeps the other fields', () => {
    const fixed = rehomeItemImages({ id: 'x', name: 'Tee', images: [`${OLD}/a.jpg`] });
    expect(fixed).toEqual({ id: 'x', name: 'Tee', images: [`${NOW}/a.jpg`], userImage: undefined, retailerImage: undefined });
  });
});
