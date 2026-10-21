/**
 * The photo library picker: one photo as before, and several at once for the Add / Edit item form.
 */
import { launchImageLibrary } from 'react-native-image-picker';
import * as entry from '../../src/platform/imagePicker';
import { pickImageFromLibrary, pickImagesFromLibrary } from '../../src/platform/imagePicker.native';

const launch = launchImageLibrary as unknown as jest.Mock;

const asset = (n: number) => ({
  uri: `file:///photos/${n}.jpg`,
  width: 800,
  height: 600,
  type: 'image/jpeg',
  fileSize: 1000 + n,
  fileName: `${n}.jpg`,
});

beforeEach(() => {
  launch.mockReset();
});

describe('pickImagesFromLibrary (native)', () => {
  it('opens the library with multi-select for as many photos as there is room for', async () => {
    launch.mockResolvedValue({ assets: [asset(1), asset(2)] });
    const picked = await pickImagesFromLibrary({ limit: 5 });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mediaType: 'photo', selectionLimit: 5, maxWidth: 1600, maxHeight: 1600, quality: 0.85 }),
    );
    expect(picked).toEqual([
      { uri: 'file:///photos/1.jpg', width: 800, height: 600, mimeType: 'image/jpeg', fileSize: 1001, fileName: '1.jpg' },
      { uri: 'file:///photos/2.jpg', width: 800, height: 600, mimeType: 'image/jpeg', fileSize: 1002, fileName: '2.jpg' },
    ]);
  });

  it('uses the same options as picking one photo, apart from the limit', async () => {
    launch.mockResolvedValue({ assets: [asset(1)] });
    await pickImageFromLibrary();
    await pickImagesFromLibrary({ limit: 3 });
    const [one, many] = launch.mock.calls.map(c => c[0]);
    expect(one.selectionLimit).toBe(1);
    expect(many.selectionLimit).toBe(3);
    expect({ ...many, selectionLimit: 1 }).toEqual(one);
  });

  it('gives [] when the person cancels or the library cannot be opened', async () => {
    launch.mockResolvedValueOnce({ didCancel: true });
    expect(await pickImagesFromLibrary({ limit: 4 })).toEqual([]);
    launch.mockResolvedValueOnce({ errorCode: 'permission', errorMessage: 'denied' });
    expect(await pickImagesFromLibrary({ limit: 4 })).toEqual([]);
    launch.mockResolvedValueOnce({});
    expect(await pickImagesFromLibrary({ limit: 4 })).toEqual([]);
  });

  it('leaves out picks with no file and never returns more than the limit', async () => {
    launch.mockResolvedValue({ assets: [asset(1), { type: 'image/jpeg' }, asset(2), asset(3)] });
    const picked = await pickImagesFromLibrary({ limit: 2 });
    expect(picked.map(p => p.uri)).toEqual(['file:///photos/1.jpg', 'file:///photos/2.jpg']);
  });

  it('does not open the library at all when there is no room: a limit of 0 would mean no limit to it', async () => {
    expect(await pickImagesFromLibrary({ limit: 0 })).toEqual([]);
    expect(await pickImagesFromLibrary({ limit: -2 })).toEqual([]);
    expect(await pickImagesFromLibrary({ limit: Number.NaN })).toEqual([]);
    expect(launch).not.toHaveBeenCalled();
  });

  it('rounds a fractional limit down', async () => {
    launch.mockResolvedValue({ assets: [asset(1)] });
    await pickImagesFromLibrary({ limit: 3.9 });
    expect(launch.mock.calls[0][0].selectionLimit).toBe(3);
  });
});

describe('pickImageFromLibrary (native, unchanged)', () => {
  it('still gives the first photo, or null', async () => {
    launch.mockResolvedValueOnce({ assets: [asset(7)] });
    expect((await pickImageFromLibrary())?.uri).toBe('file:///photos/7.jpg');
    launch.mockResolvedValueOnce({ didCancel: true });
    expect(await pickImageFromLibrary()).toBeNull();
    launch.mockResolvedValueOnce({ assets: [{}] });
    expect(await pickImageFromLibrary()).toBeNull();
  });
});

describe('the platform entry point', () => {
  it('exports both pickers', () => {
    expect(typeof entry.pickImageFromLibrary).toBe('function');
    expect(entry.pickImagesFromLibrary).toBe(pickImagesFromLibrary);
  });
});

describe('pickImagesFromLibrary (web)', () => {
  // Loaded by name, not imported: the browser file is outside the native type-check (it uses the DOM).
  const web = () =>
    require('../../src/platform/imagePicker.web') as {
      pickImagesFromLibrary: (o: { limit: number }) => Promise<Array<{ uri: string }>>;
    };
  const g = globalThis as any;
  const saved = { document: g.document, window: g.window, createObjectURL: g.URL?.createObjectURL };

  const stubBrowser = (files: unknown[]) => {
    const input: any = { style: {}, parentNode: null, files, click: jest.fn(() => input.onchange?.()) };
    g.document = { createElement: jest.fn(() => input), body: { appendChild: jest.fn() } };
    g.window = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
    g.URL.createObjectURL = jest.fn(() => 'blob:photo');
    return input;
  };

  afterEach(() => {
    g.document = saved.document;
    g.window = saved.window;
    g.URL.createObjectURL = saved.createObjectURL;
  });

  it('gives at most one photo, as a blob link', async () => {
    stubBrowser([{ type: 'image/png', size: 12, name: 'a.png' }, { type: 'image/png', size: 13, name: 'b.png' }]);
    const picked = await web().pickImagesFromLibrary({ limit: 5 });
    expect(picked).toEqual([{ uri: 'blob:photo', mimeType: 'image/png', fileSize: 12, fileName: 'a.png' }]);
  });

  it('gives [] when nothing was chosen, and does not open the picker when there is no room', async () => {
    stubBrowser([]);
    expect(await web().pickImagesFromLibrary({ limit: 5 })).toEqual([]);
    const input = stubBrowser([{ type: 'image/png', size: 12, name: 'a.png' }]);
    expect(await web().pickImagesFromLibrary({ limit: 0 })).toEqual([]);
    expect(input.click).not.toHaveBeenCalled();
  });
});
