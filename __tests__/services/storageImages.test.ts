/**
 * Several photos per item in the cloud path of storage.ts: the gallery (`images`) is read from the row, written on
 * insert and update in the stable stored form, a database without the column still saves, and a photo that no
 * longer belongs to an item is removed from storage. Same harness as storageSizeCondition.test.ts.
 */
const calls: { insert: any[]; update: any[]; select: string[] } = { insert: [], update: [], select: [] };
let insertErrors: any[] = [];
let updateErrors: any[] = [];
let row: any = null;
let galleryColumnMissing = false;
const mockRemove = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));

let selected = '';
const chain: any = {};
chain.select = (columns: string) => { calls.select.push(columns); selected = columns; return chain; };
chain.eq = () => chain;
chain.maybeSingle = async () => {
  if (galleryColumnMissing && selected.includes('images')) {
    return { data: null, error: { code: '42703', message: 'column clothing_items.images does not exist' } };
  }
  return { data: row, error: null };
};
chain.insert = async (p: any) => {
  calls.insert.push(p);
  return { error: insertErrors.shift() ?? null };
};
chain.update = (p: any) => {
  calls.update.push(p);
  return { eq: async () => ({ error: updateErrors.shift() ?? null }) };
};
chain.delete = () => ({ eq: async () => ({ error: null }) });

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => chain,
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), remove: (p: string[]) => mockRemove(p) }) },
  },
}));

import { deleteClothingItem, mapDbToClothingItem, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

const HOST = 'https://abc.supabase.co';
const stored = (n: number | string) => `${HOST}/storage/v1/object/public/wardrobe-images/me/${n}.jpg`;
const signed = (n: number | string) => `${HOST}/storage/v1/object/sign/wardrobe-images/me/${n}.jpg?token=t`;
const SHOP = 'https://shop.example/a.jpg';

const item: ClothingItem = {
  id: 'x', name: 'Tee', category: 'tops', color: 'red', season: [], dateAdded: '2026-01-01', isWishlist: false,
};
const missingColumn = (column: string) => ({
  code: 'PGRST204',
  message: `Could not find the '${column}' column of 'clothing_items' in the schema cache`,
});

beforeEach(() => {
  calls.insert = [];
  calls.update = [];
  calls.select = [];
  insertErrors = [];
  updateErrors = [];
  row = null;
  galleryColumnMissing = false;
  mockRemove.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('reading the gallery', () => {
  const base = { id: '1', name: 'Coat', category: 'outerwear', season: [], is_wishlist: false };

  it('reads the list from the row, cover first', () => {
    const mapped = mapDbToClothingItem({ ...base, user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2), SHOP] });
    expect(mapped.images).toEqual([stored(1), stored(2), SHOP]);
    expect(mapped.userImage).toBe(stored(1));
    expect(mapped.retailerImage).toBe(stored(1));
  });

  it('tidies the list: blanks and repeats out, at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => stored(i));
    expect(mapDbToClothingItem({ ...base, images: [' ', stored(1), stored(1), null, ...many] }).images).toEqual([stored(1), ...many.filter(u => u !== stored(1))].slice(0, 8));
  });

  it('reads a row from before the column, an empty list, or a list that is not a list as having none', () => {
    for (const images of [undefined, null, [], ['', '  '], 'not a list', {}]) {
      expect(mapDbToClothingItem({ ...base, user_image: stored(1), images }).images).toBeUndefined();
    }
  });
});

describe('saving a new item', () => {
  it('writes the gallery in the stored form: trimmed, no repeats (a signed link and its stored form are one photo), at most eight', async () => {
    await saveClothingItem({
      ...item, userImage: signed(1), retailerImage: signed(1),
      images: [` ${signed(1)} `, stored(1), SHOP, signed(2), ...Array.from({ length: 10 }, (_, i) => stored(10 + i))],
    });
    const written = calls.insert[0];
    expect(written.images).toEqual([stored(1), SHOP, stored(2), stored(10), stored(11), stored(12), stored(13), stored(14)]);
    expect(written.images).toHaveLength(8);
    expect(written.user_image).toBe(stored(1));
    expect(written.retailer_image).toBe(stored(1));
    for (const u of written.images) expect(u).not.toContain('token=');
  });

  it('leaves the column out when the item has no gallery, so the empty default applies', async () => {
    await saveClothingItem({ ...item, userImage: stored(1) });
    expect(calls.insert[0].images).toBeUndefined();
    await saveClothingItem({ ...item, images: [] });
    expect(calls.insert[1].images).toBeUndefined();
  });

  it('still saves on a database without the column: retried without it, the rest intact', async () => {
    insertErrors = [missingColumn('images')];
    await saveClothingItem({ ...item, size: 'M', userImage: stored(1), images: [stored(1), stored(2)] });
    expect(calls.insert).toHaveLength(2);
    expect(calls.insert[0].images).toEqual([stored(1), stored(2)]);
    expect('images' in calls.insert[1]).toBe(false);
    expect(calls.insert[1]).toEqual(expect.objectContaining({ name: 'Tee', size: 'M', user_image: stored(1) }));
  });

  it('keeps the other migration groups when only the gallery column is missing', async () => {
    insertErrors = [missingColumn('images')];
    await saveClothingItem({ ...item, subcategory: 'Tank', images: [stored(1)] });
    expect(calls.insert[1].subcategory).toBe('Tank');
  });

  it('retries once per missing group when several columns are missing', async () => {
    insertErrors = [missingColumn('images'), missingColumn('size')];
    await saveClothingItem({ ...item, size: 'M', images: [stored(1)] });
    expect(calls.insert).toHaveLength(3);
    expect('images' in calls.insert[2]).toBe(false);
    expect('size' in calls.insert[2]).toBe(false);
  });

  it('does not hide an unrelated error', async () => {
    insertErrors = [{ code: '23514', message: 'new row violates check constraint "clothing_items_images_check"' }];
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(saveClothingItem({ ...item, images: [stored(1)] })).rejects.toEqual(expect.objectContaining({ code: '23514' }));
    expect(calls.insert).toHaveLength(1);
  });
});

describe('updating an item', () => {
  it('writes the gallery in the stored form', async () => {
    await updateClothingItem({ ...item, userImage: signed(1), retailerImage: signed(1), images: [signed(1), SHOP, stored(1), signed(3)] });
    expect(calls.update[0].images).toEqual([stored(1), SHOP, stored(3)]);
  });

  it('clears the gallery with an empty list (the column cannot be null)', async () => {
    await updateClothingItem({ ...item, userImage: '', retailerImage: '', images: [] });
    expect(calls.update[0].images).toEqual([]);
    expect(calls.update[0].images).not.toBeNull();
  });

  it('leaves the saved gallery alone for a caller that has none', async () => {
    await updateClothingItem({ ...item, userImage: stored(1) });
    expect('images' in calls.update[0]).toBe(false);
  });

  it('caps the gallery at eight', async () => {
    await updateClothingItem({ ...item, images: Array.from({ length: 11 }, (_, i) => stored(i)) });
    expect(calls.update[0].images).toHaveLength(8);
  });

  it('still updates on a database without the column', async () => {
    updateErrors = [missingColumn('images')];
    await updateClothingItem({ ...item, name: 'Renamed', images: [stored(1), stored(2)] });
    expect(calls.update).toHaveLength(2);
    expect('images' in calls.update[1]).toBe(false);
    expect(calls.update[1].name).toBe('Renamed');
  });
});

describe('photos nothing references any more are removed from storage', () => {
  it('asks the row for its gallery as well as its two single photos', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1)] };
    await updateClothingItem({ ...item, userImage: stored(1), retailerImage: stored(1), images: [stored(1)] });
    expect(calls.select[0]).toBe('user_image, retailer_image, images');
  });

  it('removing an extra photo removes its file, and only that one', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2), stored(3)] };
    await updateClothingItem({ ...item, userImage: stored(1), retailerImage: stored(1), images: [stored(1), stored(3)] });
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith(['me/2.jpg']);
  });

  it('makes a new cover out of an extra and removes the old cover', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2)] };
    await updateClothingItem({ ...item, userImage: stored(2), retailerImage: stored(2), images: [stored(2)] });
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });

  it('adding photos removes nothing', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1)] };
    await updateClothingItem({ ...item, userImage: stored(1), retailerImage: stored(1), images: [stored(1), stored(2), stored(3)] });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('saving with signed links (what the edit screen holds) keeps every photo', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2)] };
    await updateClothingItem({ ...item, userImage: signed(1), retailerImage: signed(1), images: [signed(1), signed(2)] });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('clearing every photo removes every file', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2)] };
    await updateClothingItem({ ...item, userImage: '', retailerImage: '', images: [] });
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect([...mockRemove.mock.calls[0][0]].sort()).toEqual(['me/1.jpg', 'me/2.jpg']);
  });

  it('a caller that sends no gallery leaves the saved one in place, so its files stay', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2)] };
    await updateClothingItem({ ...item, userImage: stored(3), retailerImage: stored(3) });
    expect('images' in calls.update[0]).toBe(false);
    expect(mockRemove).not.toHaveBeenCalled(); // 1 and 2 are still listed in the saved gallery
  });

  it('an old-style item with only its two photos still has a replaced photo removed', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [] };
    await updateClothingItem({ ...item, userImage: stored(2), retailerImage: stored(2), images: [stored(2)] });
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });

  it('never removes a photo hosted elsewhere or kept on the phone', async () => {
    row = { user_image: SHOP, retailer_image: 'file:///x.jpg', images: [SHOP, 'file:///x.jpg', 'https://other.example/b.jpg'] };
    await updateClothingItem({ ...item, userImage: stored(1), retailerImage: stored(1), images: [stored(1)] });
    expect(mockRemove).not.toHaveBeenCalled();
    await deleteClothingItem('x');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('deleting an item removes all of its photos, once each', async () => {
    row = { user_image: stored(1), retailer_image: stored(1), images: [stored(1), stored(2), stored(3), SHOP] };
    await deleteClothingItem('x');
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect([...mockRemove.mock.calls[0][0]].sort()).toEqual(['me/1.jpg', 'me/2.jpg', 'me/3.jpg']);
  });

  it('deleting an item that has no gallery removes its two photos as before', async () => {
    row = { user_image: stored(1), retailer_image: stored(2) };
    await deleteClothingItem('x');
    expect([...mockRemove.mock.calls[0][0]].sort()).toEqual(['me/1.jpg', 'me/2.jpg']);
  });

  it('on a database without the gallery column, still cleans up the single photos', async () => {
    galleryColumnMissing = true;
    row = { user_image: stored(1), retailer_image: stored(1) };
    await updateClothingItem({ ...item, userImage: stored(2), retailerImage: stored(2) });
    expect(calls.select).toEqual(['user_image, retailer_image, images', 'user_image, retailer_image']);
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);

    mockRemove.mockClear();
    await deleteClothingItem('x');
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });

  it('removes nothing for a row that is not there', async () => {
    row = null;
    await updateClothingItem({ ...item, userImage: stored(2), images: [stored(2)] });
    await deleteClothingItem('gone');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
