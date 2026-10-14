const mockCreate = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { storage: { from: jest.fn(() => ({ createSignedUrls: (...a: any[]) => mockCreate(...a) })) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSwapPhotoCache, forgetSwapPhoto, signSwapPhotos } from '../../src/services/swapPhotoUrls';
import { SWAP_PHOTO_TTL_SECONDS } from '../../src/config/swapRules';

const answer = (paths: string[]) => ({ data: paths.map(p => ({ path: p, signedUrl: `https://x/${p}?t=1`, error: null })), error: null });

beforeEach(() => {
  mockCreate.mockReset().mockImplementation(async (paths: string[]) => answer(paths));
  clearSwapPhotoCache();
  (AsyncStorage.setItem as jest.Mock).mockClear?.();
});

describe('signSwapPhotos', () => {
  it('asks for ten-minute links', async () => {
    await signSwapPhotos(['a.jpg']);
    expect(mockCreate).toHaveBeenCalledWith(['a.jpg'], SWAP_PHOTO_TTL_SECONDS);
    expect(SWAP_PHOTO_TTL_SECONDS).toBeLessThanOrEqual(600);
  });

  it('reuses a link instead of asking again', async () => {
    await signSwapPhotos(['a.jpg']);
    const again = await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenLastCalledWith(['b.jpg'], SWAP_PHOTO_TTL_SECONDS);
    expect([...again.keys()].sort()).toEqual(['a.jpg', 'b.jpg']);
  });

  it('never writes links to disk', async () => {
    await signSwapPhotos(['a.jpg']);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('forgets one link, or all of them on sign-out', async () => {
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    forgetSwapPhoto('a.jpg');
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    clearSwapPhotoCache();
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('leaves out a photo that cannot be signed, without throwing', async () => {
    const missing = new Set<string>();
    mockCreate.mockResolvedValueOnce({ data: [{ path: 'a.jpg', signedUrl: null, error: 'Object not found' }], error: null });
    expect((await signSwapPhotos(['a.jpg'], { missing })).size).toBe(0);
    expect([...missing]).toEqual(['a.jpg']);                          // the call worked and the object is not there
    mockCreate.mockRejectedValueOnce(new Error('offline'));
    expect((await signSwapPhotos(['c.jpg'], { missing })).size).toBe(0);
    expect([...missing]).toEqual(['a.jpg']);                          // a call that threw says nothing about c.jpg
  });

  it('only calls a photo missing after a call that worked', async () => {
    const missing = new Set<string>();
    mockCreate.mockResolvedValueOnce({ data: null, error: { message: 'Bad gateway' } });
    expect((await signSwapPhotos(['a.jpg'], { missing })).size).toBe(0);
    mockCreate.mockResolvedValueOnce({ data: null, error: null });
    expect((await signSwapPhotos(['b.jpg'], { missing })).size).toBe(0);
    expect(missing.size).toBe(0);
  });

  it('names the photos with no row, or an error row, and not the ones that were signed', async () => {
    const missing = new Set<string>();
    mockCreate.mockResolvedValueOnce({ data: [
      { path: 'ok.jpg', signedUrl: 'https://x/ok.jpg?t=1', error: null },
      { path: 'gone.jpg', signedUrl: null, error: 'Object not found' },
    ], error: null });
    const links = await signSwapPhotos(['ok.jpg', 'gone.jpg', 'norow.jpg'], { missing });
    expect([...links.keys()]).toEqual(['ok.jpg']);
    expect([...missing].sort()).toEqual(['gone.jpg', 'norow.jpg']);
  });

  it('does not report a photo whose link is already cached, and works without an outcome', async () => {
    await signSwapPhotos(['a.jpg']);
    const missing = new Set<string>();
    await signSwapPhotos(['a.jpg'], { missing });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(missing.size).toBe(0);
    mockCreate.mockResolvedValueOnce({ data: [], error: null });
    expect((await signSwapPhotos(['z.jpg'])).size).toBe(0);
  });
});
