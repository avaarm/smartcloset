import { rehomeLocalImage, rehomeItemImages } from '../../src/services/localImagePaths';

// jest.setup.js mocks react-native-fs with DocumentDirectoryPath = /mock/documents
const NOW = 'file:///mock/documents';

describe('rehomeLocalImage', () => {
  it('points a photo saved under an old app container at the current Documents folder', () => {
    const old = 'file:///var/mobile/Containers/Data/Application/AAAA-OLD/Documents/clothing_123.jpg';
    expect(rehomeLocalImage(old)).toBe(`${NOW}/clothing_123.jpg`);
  });

  it('handles a path without the file:// prefix', () => {
    expect(rehomeLocalImage('/var/mobile/Containers/Data/Application/X/Documents/clothing_9.jpg')).toBe(`${NOW}/clothing_9.jpg`);
  });

  it('leaves a path that is already current unchanged in value', () => {
    expect(rehomeLocalImage(`${NOW}/clothing_1.jpg`)).toBe(`${NOW}/clothing_1.jpg`);
  });

  it('leaves remote URLs, other file locations and empty values alone', () => {
    expect(rehomeLocalImage('https://example.com/Documents/x.jpg')).toBe('https://example.com/Documents/x.jpg');
    expect(rehomeLocalImage('file:///var/tmp/pick.jpg')).toBe('file:///var/tmp/pick.jpg');
    expect(rehomeLocalImage(undefined)).toBeUndefined();
    expect(rehomeLocalImage('')).toBe('');
  });
});

describe('rehomeItemImages', () => {
  it('fixes both image fields and returns the same object when nothing changes', () => {
    const fixed = rehomeItemImages({ userImage: 'file:///old/Documents/a.jpg', retailerImage: 'file:///old/Documents/a.jpg' });
    expect(fixed).toEqual({ userImage: `${NOW}/a.jpg`, retailerImage: `${NOW}/a.jpg` });
    const same = { userImage: 'https://x/y.jpg' };
    expect(rehomeItemImages(same)).toBe(same);
  });
});
