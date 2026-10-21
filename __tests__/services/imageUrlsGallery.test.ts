/**
 * An item's whole gallery (`images`) is signed for display like its cover: every bucket photo in it gets a
 * temporary link, other links pass through, and a link that goes back through canonicalizeImageUrl is the stored form.
 */
const mockCreateSignedUrls = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls: mockCreateSignedUrls }) } },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { canonicalizeImageUrl, clearSignedImageCache, withSignedImages } from '../../src/services/imageUrls';
import type { ClothingItem } from '../../src/types';

const HOST = 'https://abc.supabase.co';
const stored = (n: number) => `${HOST}/storage/v1/object/public/wardrobe-images/user-1/${n}.jpg`;
const SHOP = 'https://cdn.example.com/r.jpg';
const LOCAL = 'file:///var/mobile/Documents/clothing_1.jpg';

const ok = (paths: string[]) => ({
  data: paths.map(p => ({ path: p, signedUrl: `${HOST}/storage/v1/object/sign/wardrobe-images/${p}?token=t`, error: null })),
  error: null,
});

beforeEach(async () => {
  mockCreateSignedUrls.mockReset().mockImplementation(async (paths: string[]) => ok(paths));
  await clearSignedImageCache();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('withSignedImages and the gallery', () => {
  it('signs every bucket photo in the gallery, in order, and leaves other links alone', async () => {
    const [out] = await withSignedImages([{ userImage: stored(1), retailerImage: stored(1), images: [stored(1), SHOP, stored(2), LOCAL, stored(3)] }]);
    expect(out.images).toHaveLength(5);
    expect(out.images![0]).toContain('/object/sign/wardrobe-images/user-1/1.jpg?token=');
    expect(out.images![1]).toBe(SHOP);
    expect(out.images![2]).toContain('/object/sign/wardrobe-images/user-1/2.jpg?token=');
    expect(out.images![3]).toBe(LOCAL);
    expect(out.images![4]).toContain('/object/sign/wardrobe-images/user-1/3.jpg?token=');
  });

  it('signs the extra photos even when the cover fields are not bucket links', async () => {
    const [out] = await withSignedImages([{ userImage: SHOP, retailerImage: SHOP, images: [SHOP, stored(2)] }]);
    expect(out.images![0]).toBe(SHOP);
    expect(out.images![1]).toContain('/object/sign/wardrobe-images/user-1/2.jpg?token=');
  });

  it('signs a photo once even when the cover fields and the gallery all name it, in one call for the whole list', async () => {
    const items = [
      { userImage: stored(1), retailerImage: stored(1), images: [stored(1), stored(2)] },
      { userImage: stored(2), retailerImage: stored(2), images: [stored(2), stored(3)] },
    ];
    const out = await withSignedImages(items);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect([...mockCreateSignedUrls.mock.calls[0][0]].sort()).toEqual(['user-1/1.jpg', 'user-1/2.jpg', 'user-1/3.jpg']);
    expect(out[0].images![0]).toBe(out[0].userImage);
    expect(out[0].images![1]).toBe(out[1].images![0]);
  });

  it('keeps every other field, and gives items without a gallery none', async () => {
    const items = [
      { id: 'a', name: 'Tee', userImage: stored(1), images: [stored(1)] },
      { id: 'b', name: 'Old', userImage: stored(2), retailerImage: SHOP },
    ];
    const [a, b] = await withSignedImages(items);
    expect(a).toEqual(expect.objectContaining({ id: 'a', name: 'Tee' }));
    expect('images' in b).toBe(false);
    expect(b.userImage).toContain('token=');
    expect(b.retailerImage).toBe(SHOP);
  });

  it('does not call the API when no photo in the gallery is a bucket link', async () => {
    const items = [{ userImage: SHOP, images: [SHOP, LOCAL] }];
    const out = await withSignedImages(items);
    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
    expect(out).toBe(items);
  });

  it('falls back to the stored link for the whole gallery if signing fails', async () => {
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: new Error('offline') });
    const [out] = await withSignedImages([{ userImage: stored(1), images: [stored(1), stored(2)] }]);
    expect(out.images).toEqual([stored(1), stored(2)]);
  });

  it('works with full ClothingItems (the generic signature is kept)', async () => {
    const item: ClothingItem = {
      id: 'x', name: 'Tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false,
      userImage: stored(1), images: [stored(1), stored(2)],
    };
    const [out]: ClothingItem[] = await withSignedImages([item]);
    expect(out.images).toHaveLength(2);
    expect(out.name).toBe('Tee');
  });

  it('a signed gallery goes back to the stored form, so no expiring link is ever saved', async () => {
    const [out] = await withSignedImages([{ userImage: stored(1), images: [stored(1), SHOP, stored(2)] }]);
    expect(out.images!.map(u => canonicalizeImageUrl(u))).toEqual([stored(1), SHOP, stored(2)]);
  });
});
