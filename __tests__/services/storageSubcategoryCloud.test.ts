/**
 * The item type (subcategory) for a signed-in user: read from the clothing_items
 * row, written on insert and update, cleared by an empty string, left alone when
 * the caller has none, and a database without the column still saves the item.
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

import { getClothingItems, saveClothingItem, updateClothingItem } from '../../src/services/storage';
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

describe('reading', () => {
  it('reads the type of a row, and none from rows without one', async () => {
    rows = [row({ subcategory: 'Tote' }), row({ id: 'r2', subcategory: null })];
    const items = await getClothingItems();
    expect(items.map(i => i.subcategory)).toEqual(['Tote', undefined]);
  });
});

describe('saving', () => {
  it('writes the trimmed type with the new item', async () => {
    await saveClothingItem({ ...item, subcategory: '  Tote ' });
    expect(calls.insert[0].subcategory).toBe('Tote');
  });

  it('keeps a typed type to the 60 characters the column allows', async () => {
    await saveClothingItem({ ...item, subcategory: 'x'.repeat(90) });
    expect(calls.insert[0].subcategory).toHaveLength(60);
  });

  it('leaves the column out for an item with no type', async () => {
    await saveClothingItem({ ...item, subcategory: '' });
    expect(calls.insert[0].subcategory).toBeUndefined();
  });

  it('still saves when the database has not had the migration: the write is retried without the column', async () => {
    insertErrors = [missingColumn('subcategory')];
    await saveClothingItem({ ...item, subcategory: 'Tote' });
    expect(calls.insert).toHaveLength(2);
    expect('subcategory' in calls.insert[1]).toBe(false);
    expect(calls.insert[1].name).toBe('Tee');
  });
});

describe('updating', () => {
  it('writes a new type', async () => {
    await updateClothingItem({ ...item, subcategory: 'Crossbody' });
    expect(calls.update[0].subcategory).toBe('Crossbody');
  });

  it('clears the type when the form sends an empty one', async () => {
    await updateClothingItem({ ...item, subcategory: '' });
    expect(calls.update[0].subcategory).toBeNull();
  });

  it('leaves the saved type alone for a caller that does not know about types', async () => {
    await updateClothingItem({ ...item });
    expect('subcategory' in calls.update[0]).toBe(false);
  });

  it('still updates when the database has not had the migration', async () => {
    updateErrors = [missingColumn('subcategory')];
    await updateClothingItem({ ...item, subcategory: 'Tote' });
    expect(calls.update).toHaveLength(2);
    expect('subcategory' in calls.update[1]).toBe(false);
  });
});
