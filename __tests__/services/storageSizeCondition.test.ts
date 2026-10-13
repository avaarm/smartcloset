/**
 * Size, condition and the tag fields: read from the row, written on insert and update (an empty
 * value clears, an absent one leaves the saved value alone), and a database without the migration
 * still saves the item. Same harness as storageSubcategoryCloud.test.ts.
 */
const calls: { insert: any[]; update: any[] } = { insert: [], update: [] };
let insertErrors: any[] = [];
let updateErrors: any[] = [];

const chain: any = {};
chain.select = () => chain;
chain.eq = () => chain;
chain.maybeSingle = async () => ({ data: null, error: null });
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
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) },
  },
}));

import { mapDbToClothingItem, saveClothingItem, updateClothingItem } from '../../src/services/storage';
import type { ClothingItem } from '../../src/types';

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
  insertErrors = [];
  updateErrors = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('reading', () => {
  const row = { id: '1', name: 'Coat', category: 'outerwear', season: [], is_wishlist: false };
  it('reads the fields from the row', () => {
    const mapped = mapDbToClothingItem({
      ...row, size: 'M', condition: 'like_new', care_instructions: ['Dry clean only'], origin_country: 'Italy', tag_text: '100% wool',
    });
    expect(mapped).toEqual(expect.objectContaining({
      size: 'M', condition: 'like_new', careInstructions: ['Dry clean only'], originCountry: 'Italy', tagText: '100% wool',
    }));
  });
  it('reads a row from before the columns existed, or with nothing in them, as having none', () => {
    for (const r of [row, { ...row, size: null, condition: null, care_instructions: null, origin_country: '', tag_text: null }, { ...row, condition: 'weird', care_instructions: [] }]) {
      const mapped = mapDbToClothingItem(r);
      expect(mapped.size).toBeUndefined();
      expect(mapped.condition).toBeUndefined();
      expect(mapped.careInstructions).toBeUndefined();
      expect(mapped.originCountry).toBeUndefined();
      expect(mapped.tagText).toBeUndefined();
    }
  });
});

describe('saving', () => {
  it('writes them cleaned', async () => {
    await saveClothingItem({
      ...item, size: '  EU   38 ', condition: 'good', careInstructions: [' Hand wash ', 'hand wash', 'Do not tumble dry'],
      originCountry: ' Portugal ', tagText: ' 80% wool ',
    });
    expect(calls.insert[0]).toEqual(expect.objectContaining({
      size: 'EU 38', condition: 'good', care_instructions: ['Hand wash', 'Do not tumble dry'], origin_country: 'Portugal', tag_text: '80% wool',
    }));
  });
  it('leaves empty ones out and refuses an unknown condition', async () => {
    await saveClothingItem({ ...item, size: '  ', condition: 'mint' as any, careInstructions: [], originCountry: ' ', tagText: '' });
    const written = calls.insert[0];
    for (const k of ['size', 'condition', 'care_instructions', 'origin_country', 'tag_text']) expect(written[k]).toBeUndefined();
  });
  it('still saves without the migration: retried without the five columns', async () => {
    insertErrors = [missingColumn('size')];
    await saveClothingItem({ ...item, size: 'M', condition: 'good' });
    expect(calls.insert).toHaveLength(2);
    for (const k of ['size', 'condition', 'care_instructions', 'origin_country', 'tag_text']) expect(k in calls.insert[1]).toBe(false);
    expect(calls.insert[1].name).toBe('Tee');
  });
});

describe('updating', () => {
  it('writes new values', async () => {
    await updateClothingItem({ ...item, size: 'L', condition: 'well_loved', careInstructions: ['Wash inside out'], originCountry: 'Peru', tagText: 'x' });
    expect(calls.update[0]).toEqual(expect.objectContaining({
      size: 'L', condition: 'well_loved', care_instructions: ['Wash inside out'], origin_country: 'Peru', tag_text: 'x',
    }));
  });
  it('clears them when the form sends empty values', async () => {
    await updateClothingItem({ ...item, size: '', condition: null as any, careInstructions: [], originCountry: '', tagText: '' });
    for (const k of ['size', 'condition', 'care_instructions', 'origin_country', 'tag_text']) expect(calls.update[0][k]).toBeNull();
  });
  it('leaves saved values alone for a caller that does not know about them', async () => {
    await updateClothingItem({ ...item });
    for (const k of ['size', 'condition', 'care_instructions', 'origin_country', 'tag_text']) expect(k in calls.update[0]).toBe(false);
  });
  it('still updates without the migration', async () => {
    updateErrors = [missingColumn('size')];
    await updateClothingItem({ ...item, size: 'M' });
    expect(calls.update).toHaveLength(2);
    expect('size' in calls.update[1]).toBe(false);
  });
});
