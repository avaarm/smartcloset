/**
 * Item values for a signed-in user: read from the clothing_items row, written on
 * insert and update, and a database that has not had the migration yet still
 * saves the item.
 */
const calls: { insert: any[]; update: any[] } = { insert: [], update: [] };
let rows: any[] = [];
let insertErrors: any[] = [];
let updateErrors: any[] = [];
const mockRemove = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));

const chain: any = {};
chain.select = () => chain;
chain.eq = () => chain;
chain.order = () => chain;
chain.range = async () => ({ data: rows, error: null });
chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
chain.insert = async (p: any) => {
  calls.insert.push(p);
  return { error: insertErrors.shift() ?? null };
};
chain.update = (p: any) => {
  calls.update.push(p);
  return { eq: async () => ({ error: updateErrors.shift() ?? null }) };
};

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    from: () => chain,
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: [], error: null }),
        remove: (p: string[]) => mockRemove(p),
      }),
    },
  },
}));

import { getClothingItems, getOwnedClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import { itemValue, totalValue } from '../../src/utils/itemValue';
import type { ClothingItem } from '../../src/types';

const HOST = 'https://abc.supabase.co';
const PHOTO = `${HOST}/storage/v1/object/public/wardrobe-images/me/1.jpg`;
const NEW_PHOTO = `${HOST}/storage/v1/object/public/wardrobe-images/me/2.jpg`;

/** A row the way the table returns it for the owner's account. */
const row = (extra: Record<string, any> = {}) => ({
  id: 'r1',
  user_id: 'me',
  name: 'Wool coat',
  category: 'outerwear',
  brand: 'Zara',
  color: 'camel',
  season: ['fall', 'winter'],
  is_wishlist: false,
  cost: '40.00',
  retail_cost: null,
  retailer: '',
  materials: null,
  wear_count: 2,
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
});

const item: ClothingItem = {
  id: 'x',
  name: 'Tee',
  category: 'tops',
  color: 'red',
  season: [],
  dateAdded: '2026-01-01',
  isWishlist: false,
};

const missingColumn = (column: string) => ({
  code: 'PGRST204',
  message: `Could not find the '${column}' column of 'clothing_items' in the schema cache`,
});

beforeEach(() => {
  calls.insert = [];
  calls.update = [];
  rows = [];
  insertErrors = [];
  updateErrors = [];
  mockRemove.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('reading values', () => {
  it('maps the value and its source (numeric arrives as text or a number)', async () => {
    rows = [
      row({ id: 'a', estimated_value: '85.50', value_source: 'user' }),
      row({ id: 'b', estimated_value: 120, value_source: 'estimate' }),
      row({ id: 'c', estimated_value: 0, value_source: 'user' }),
    ];
    const [a, b, c] = await getClothingItems();
    expect(a).toMatchObject({ estimatedValue: 85.5, valueSource: 'user' });
    expect(b).toMatchObject({ estimatedValue: 120, valueSource: 'estimate' });
    expect(c).toMatchObject({ estimatedValue: 0, valueSource: 'user' });
  });

  it('a row from before the migration has no value, and the estimate stands in so totals work without a backfill', async () => {
    rows = [row({ id: 'old', estimated_value: null, value_source: null })];
    const [legacy] = await getClothingItems();
    expect(legacy.estimatedValue).toBeUndefined();
    expect(legacy.valueSource).toBeUndefined();
    expect(itemValue(legacy)).toBe(40); // what was paid
  });

  it('a row with no value columns at all (database without the migration) reads the same way', async () => {
    rows = [row()];
    const [legacy] = await getClothingItems();
    expect(legacy.estimatedValue).toBeUndefined();
    expect(itemValue(legacy)).toBe(40);
  });

  it('adds up owned items from a mix of valued, legacy and wishlist rows', async () => {
    rows = [
      row({ id: 'a', estimated_value: '100.00', value_source: 'user', cost: '10.00' }),
      row({ id: 'b', estimated_value: null, cost: '40.00' }),
      row({ id: 'w', estimated_value: '900.00', value_source: 'user', is_wishlist: true, cost: '862.00', retailer: '' }),
    ];
    expect(totalValue(await getOwnedClothingItems())).toBe(140);
  });

  it.each([
    ['a negative value', { estimated_value: '-5.00', value_source: 'user' }],
    ['text', { estimated_value: 'lots', value_source: 'user' }],
  ])('%s in the row is treated as no value', async (_label, extra) => {
    rows = [row(extra)];
    const [it] = await getClothingItems();
    expect(it.estimatedValue).toBeUndefined();
    expect(itemValue(it)).toBe(40);
  });

  it('ignores a value source it does not know', async () => {
    rows = [row({ estimated_value: '10.00', value_source: 'guess' })];
    expect((await getClothingItems())[0].valueSource).toBeUndefined();
  });
});

describe('saving a new item', () => {
  it('writes the value and its source', async () => {
    await saveClothingItem({ ...item, estimatedValue: 85, valueSource: 'estimate' });
    expect(calls.insert[0]).toMatchObject({ estimated_value: 85, value_source: 'estimate' });
  });

  it('keeps a value of 0', async () => {
    await saveClothingItem({ ...item, estimatedValue: 0, valueSource: 'user' });
    expect(calls.insert[0]).toMatchObject({ estimated_value: 0, value_source: 'user' });
  });

  it('keeps cents, to two places', async () => {
    await saveClothingItem({ ...item, estimatedValue: 85.456, valueSource: 'user' });
    expect(calls.insert[0].estimated_value).toBe(85.46);
  });

  it('sends nothing for an item without a value (so an older database is not asked for the columns)', async () => {
    await saveClothingItem(item);
    expect(JSON.parse(JSON.stringify(calls.insert[0]))).not.toHaveProperty('estimated_value');
    expect(JSON.parse(JSON.stringify(calls.insert[0]))).not.toHaveProperty('value_source');
  });

  it.each([
    ['negative', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('does not send a %s value (the database would reject the whole item)', async (_label, estimatedValue) => {
    await saveClothingItem({ ...item, estimatedValue, valueSource: 'user' });
    expect(calls.insert[0].estimated_value).toBeUndefined();
  });

  it('does not send a source it does not know', async () => {
    await saveClothingItem({ ...item, estimatedValue: 5, valueSource: 'guess' as any });
    expect(calls.insert[0].value_source).toBeUndefined();
  });
});

describe('editing an item', () => {
  it('writes a value the owner typed', async () => {
    await updateClothingItem({ ...item, estimatedValue: 250, valueSource: 'user' });
    expect(calls.update[0]).toMatchObject({ estimated_value: 250, value_source: 'user' });
  });

  it('writes a value of 0', async () => {
    await updateClothingItem({ ...item, estimatedValue: 0, valueSource: 'user' });
    expect(calls.update[0]).toMatchObject({ estimated_value: 0, value_source: 'user' });
  });

  it('going back to the estimate is a new value with source "estimate"', async () => {
    await updateClothingItem({ ...item, estimatedValue: 40, valueSource: 'estimate' });
    expect(calls.update[0]).toMatchObject({ estimated_value: 40, value_source: 'estimate' });
  });

  it('leaves the stored value alone when the caller has none (name edits, favourites, moving a wish)', async () => {
    await updateClothingItem({ ...item, name: 'Renamed', favorite: true });
    expect(calls.update[0]).not.toHaveProperty('estimated_value');
    expect(calls.update[0]).not.toHaveProperty('value_source');
  });

  it('leaves the stored value alone when the wear tracker writes', async () => {
    await updateClothingItem({ ...item, wearCount: 4 }, { includeWear: true });
    expect(calls.update[0]).toMatchObject({ wear_count: 4 });
    expect(calls.update[0]).not.toHaveProperty('estimated_value');
    expect(calls.update[0]).not.toHaveProperty('value_source');
  });

  it('does not send a negative value', async () => {
    await updateClothingItem({ ...item, estimatedValue: -3, valueSource: 'user' });
    expect(calls.update[0]).not.toHaveProperty('estimated_value');
  });

  it('a load, edit and save round trip keeps the value', async () => {
    rows = [row({ estimated_value: '75.00', value_source: 'user' })];
    const [loaded] = await getClothingItems();
    await updateClothingItem({ ...loaded, name: 'Renamed' });
    expect(calls.update[0]).toMatchObject({ estimated_value: 75, value_source: 'user' });
  });
});

describe('a database without the migration', () => {
  it('saves the item without the two columns', async () => {
    insertErrors = [missingColumn('estimated_value')];
    await saveClothingItem({ ...item, estimatedValue: 85, valueSource: 'estimate' });

    expect(calls.insert).toHaveLength(2);
    expect(calls.insert[0]).toMatchObject({ estimated_value: 85, value_source: 'estimate' });
    expect(calls.insert[1]).not.toHaveProperty('estimated_value');
    expect(calls.insert[1]).not.toHaveProperty('value_source');
    expect(calls.insert[1]).toMatchObject({ name: 'Tee', category: 'tops', user_id: 'me' });
  });

  it('does the same when it is the source column that is reported missing', async () => {
    insertErrors = [missingColumn('value_source')];
    await saveClothingItem({ ...item, estimatedValue: 85, valueSource: 'user' });
    expect(calls.insert).toHaveLength(2);
    expect(calls.insert[1]).not.toHaveProperty('estimated_value');
    expect(calls.insert[1]).not.toHaveProperty('value_source');
  });

  it('updates the item without the two columns', async () => {
    updateErrors = [missingColumn('estimated_value')];
    await updateClothingItem({ ...item, name: 'Renamed', estimatedValue: 85, valueSource: 'user' });

    expect(calls.update).toHaveLength(2);
    expect(calls.update[1]).not.toHaveProperty('estimated_value');
    expect(calls.update[1]).not.toHaveProperty('value_source');
    expect(calls.update[1]).toMatchObject({ name: 'Renamed' });
  });

  it('copes when the materials column is missing as well', async () => {
    insertErrors = [missingColumn('materials'), missingColumn('estimated_value')];
    await saveClothingItem({
      ...item,
      materials: [{ name: 'cotton' }],
      estimatedValue: 85,
      valueSource: 'user',
    });

    expect(calls.insert).toHaveLength(3);
    expect(calls.insert[2]).not.toHaveProperty('materials');
    expect(calls.insert[2]).not.toHaveProperty('estimated_value');
    expect(calls.insert[2]).not.toHaveProperty('value_source');
  });

  it('still drops only materials when that is the only column missing', async () => {
    insertErrors = [missingColumn('materials')];
    await saveClothingItem({ ...item, materials: [{ name: 'cotton' }], estimatedValue: 85, valueSource: 'user' });
    expect(calls.insert).toHaveLength(2);
    expect(calls.insert[1]).not.toHaveProperty('materials');
    expect(calls.insert[1]).toMatchObject({ estimated_value: 85, value_source: 'user' });
  });

  it('does not retry an error that is not a missing column', async () => {
    const rejected = { code: '23514', message: 'new row violates check constraint' };
    insertErrors = [rejected];
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(saveClothingItem({ ...item, estimatedValue: 85, valueSource: 'user' })).rejects.toBe(rejected);
    expect(calls.insert).toHaveLength(1);
  });

  it('reports the error of the retry when that fails too', async () => {
    const offline = { code: '08006', message: 'connection failure' };
    insertErrors = [missingColumn('estimated_value'), offline];
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(saveClothingItem({ ...item, estimatedValue: 85, valueSource: 'user' })).rejects.toBe(offline);
    expect(calls.insert).toHaveLength(2);
  });

  it('still removes a replaced photo after an update that had to retry', async () => {
    rows = [row({ user_image: PHOTO, retailer_image: null })];
    updateErrors = [missingColumn('estimated_value')];
    await updateClothingItem({ ...item, id: 'r1', userImage: NEW_PHOTO, estimatedValue: 85, valueSource: 'user' });
    expect(mockRemove).toHaveBeenCalledWith(['me/1.jpg']);
  });
});
