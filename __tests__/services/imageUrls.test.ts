const mockCreateSignedUrls = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: mockCreateSignedUrls }) } },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  canonicalizeImageUrl,
  storagePathFromUrl,
  signStoragePaths,
  withSignedImages,
  clearSignedImageCache,
} from '../../src/services/imageUrls';

const HOST = 'https://abc.supabase.co';
const PUB = `${HOST}/storage/v1/object/public/wardrobe-images/user-1/100.jpg`;
const SIGNED = `${HOST}/storage/v1/object/sign/wardrobe-images/user-1/100.jpg?token=xyz`;

beforeEach(async () => {
  mockCreateSignedUrls.mockReset();
  await clearSignedImageCache();
});

describe('canonicalizeImageUrl / storagePathFromUrl', () => {
  it('turns a signed URL back into the stable public-form URL', () => {
    expect(canonicalizeImageUrl(SIGNED)).toBe(PUB);
  });
  it('leaves canonical, external, local and empty values alone', () => {
    expect(canonicalizeImageUrl(PUB)).toBe(PUB);
    expect(canonicalizeImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(canonicalizeImageUrl('file:///var/mobile/a.jpg')).toBe('file:///var/mobile/a.jpg');
    expect(canonicalizeImageUrl(undefined)).toBeUndefined();
    expect(canonicalizeImageUrl(null)).toBeNull();
  });
  it('extracts the storage path from both forms and ignores other URLs', () => {
    expect(storagePathFromUrl(PUB)).toBe('user-1/100.jpg');
    expect(storagePathFromUrl(SIGNED)).toBe('user-1/100.jpg');
    expect(storagePathFromUrl('https://cdn.example.com/a.jpg')).toBeNull();
  });
});

describe('signing', () => {
  const ok = (paths: string[]) => ({
    data: paths.map(p => ({ path: p, signedUrl: `${HOST}/storage/v1/object/sign/wardrobe-images/${p}?token=t`, error: null })),
    error: null,
  });

  it('signs bucket photos, leaves other URLs, and reuses the cache on the next call', async () => {
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ok(paths));
    const items = [
      { userImage: PUB, retailerImage: 'https://cdn.example.com/r.jpg' },
      { userImage: 'file:///local.jpg', retailerImage: undefined },
    ];
    const out = await withSignedImages(items);
    expect(out[0].userImage).toContain('/object/sign/wardrobe-images/user-1/100.jpg?token=');
    expect(out[0].retailerImage).toBe('https://cdn.example.com/r.jpg');
    expect(out[1].userImage).toBe('file:///local.jpg');
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);

    await withSignedImages(items);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1); // served from cache
  });

  it('does not call the API when there is nothing to sign', async () => {
    await withSignedImages([{ userImage: 'file:///x.jpg' }]);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('falls back to the original URL if signing fails', async () => {
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: new Error('offline') });
    const [item] = await withSignedImages([{ userImage: PUB }]);
    expect(item.userImage).toBe(PUB);
  });

  it('batches large lists', async () => {
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ok(paths));
    const paths = Array.from({ length: 250 }, (_, i) => `user-1/${i}.jpg`);
    const signed = await signStoragePaths(paths);
    expect(signed.size).toBe(250);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(3);
  });

  it('a signed link round-trips back to the stored form (never persisted as a token URL)', async () => {
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ok(paths));
    const [item] = await withSignedImages([{ userImage: PUB }]);
    expect(canonicalizeImageUrl(item.userImage)).toBe(PUB);
  });
});
