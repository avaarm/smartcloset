const mockUnlink = jest.fn();
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    CachesDirectoryPath: '/data/user/0/app/cache',
    TemporaryDirectoryPath: '/private/var/mobile/Containers/Data/Application/ABC/tmp',
    DocumentDirectoryPath: '/data/user/0/app/files',
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));
jest.mock('../../src/services/imageUrls', () => ({
  resolveImageUrl: jest.fn(async (uri: string) => uri),
}));

import * as native from '../../src/platform/fileSystem.native';
import * as web from '../../src/platform/fileSystem.web';
import * as entry from '../../src/platform/fileSystem';

const { discardTempImage } = native;

beforeEach(() => {
  mockUnlink.mockReset().mockResolvedValue(undefined);
});

describe('discardTempImage (native)', () => {
  it('removes the picker copy in the caches folder, as a file URI or a bare path', async () => {
    await discardTempImage('file:///data/user/0/app/cache/rn_image_picker_lib_temp/a.jpg');
    await discardTempImage('/data/user/0/app/cache/rn_image_picker_lib_temp/b.jpg');
    expect(mockUnlink.mock.calls).toEqual([
      ['/data/user/0/app/cache/rn_image_picker_lib_temp/a.jpg'],
      ['/data/user/0/app/cache/rn_image_picker_lib_temp/b.jpg'],
    ]);
  });

  it('removes the picker copy in the temp folder, even when iOS names the folder with or without /private', async () => {
    await discardTempImage('file:///private/var/mobile/Containers/Data/Application/ABC/tmp/react-native-image-picker/c.jpg');
    await discardTempImage('file:///var/mobile/Containers/Data/Application/ABC/tmp/react-native-image-picker/d.jpg');
    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenNthCalledWith(1, '/private/var/mobile/Containers/Data/Application/ABC/tmp/react-native-image-picker/c.jpg');
  });

  it('decodes a percent-escaped file URI before removing it', async () => {
    await discardTempImage('file:///data/user/0/app/cache/my%20tag%20photo.jpg');
    expect(mockUnlink).toHaveBeenCalledWith('/data/user/0/app/cache/my tag photo.jpg');
  });

  it('never removes a photo outside the caches and temp folders', async () => {
    const elsewhere = [
      'file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.JPG',
      '/storage/emulated/0/DCIM/Camera/IMG_0001.jpg',
      '/data/user/0/app/files/closet/photo.jpg',
      'file:///data/user/0/app/files/closet/photo.jpg',
      'ph://ABCDEF/L0/001',
      'content://media/external/images/media/42',
      'assets-library://asset/asset.JPG?id=1&ext=JPG',
      'https://example.com/cache/photo.jpg',
      'data:image/jpeg;base64,AAAA',
      'relative/cache/photo.jpg',
      '',
    ];
    for (const uri of elsewhere) await discardTempImage(uri);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('never removes a folder itself, a neighbour that shares its name, or a path that climbs out of it', async () => {
    const tricky = [
      '/data/user/0/app/cache',
      '/data/user/0/app/cache/',
      '/data/user/0/app/cache-other/photo.jpg',
      '/data/user/0/app/cache/../files/closet/photo.jpg',
      'file:///data/user/0/app/cache/%2e%2e/files/closet/photo.jpg',
      'file:///data/user/0/app/cache/%zz/photo.jpg',
      '/private/var/mobile/Containers/Data/Application/ABC/tmp',
      '/private/var/mobile/Containers/Data/Application/ABC/Documents/photo.jpg',
    ];
    for (const uri of tricky) await discardTempImage(uri);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('swallows every error', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(discardTempImage('/data/user/0/app/cache/gone.jpg')).resolves.toBeUndefined();
    mockUnlink.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    await expect(discardTempImage('/data/user/0/app/cache/boom.jpg')).resolves.toBeUndefined();
    await expect(discardTempImage(undefined as unknown as string)).resolves.toBeUndefined();
  });
});

describe('discardTempImage (web and entry point)', () => {
  it('is a no-op in the browser shim', async () => {
    await expect(web.discardTempImage('blob:https://example.com/abc')).resolves.toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('is re-exported next to readImageAsBase64 by the default entry point', () => {
    expect(entry.discardTempImage).toBe(native.discardTempImage);
    expect(typeof entry.readImageAsBase64).toBe('function');
    expect(typeof web.readImageAsBase64).toBe('function');
  });
});
