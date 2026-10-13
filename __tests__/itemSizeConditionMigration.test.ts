/**
 * The size/condition/tag migration adds nullable, length-capped columns, can run twice and
 * changes nothing else. Reads the migration as text, like itemSubcategoryMigration.test.ts.
 */
import fs from 'fs';
import path from 'path';
import { ITEM_CONDITIONS } from '../src/utils/itemCondition';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'migrations', '20261013000000_item_size_condition_tag.sql'),
  'utf8',
);
const code = sql.replace(/--.*$/gm, '');

describe('item size / condition / tag migration', () => {
  it('adds the five nullable columns', () => {
    for (const column of ['size text', 'condition text', 'care_instructions text\\[\\]', 'origin_country text', 'tag_text text']) {
      expect(code).toMatch(new RegExp(`add column if not exists ${column}`, 'i'));
    }
    expect(code).not.toMatch(/not null/i);
  });
  it('allows exactly the conditions the app offers', () => {
    const list = code.match(/condition in \(([^)]*)\)/i);
    expect(list).not.toBeNull();
    const allowed = [...list![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(allowed.sort()).toEqual([...ITEM_CONDITIONS].sort());
  });
  it('caps lengths at what the app writes', () => {
    expect(code).toMatch(/char_length\(size\) <= 20/i);
    expect(code).toMatch(/cardinality\(care_instructions\) <= 20/i);
    expect(code).toMatch(/char_length\(origin_country\) <= 60/i);
    expect(code).toMatch(/char_length\(tag_text\) <= 2000/i);
  });
  it('can run twice and changes nothing else', () => {
    expect(code.match(/if not exists \(select 1 from pg_constraint/gi)).toHaveLength(5);
    expect(code).not.toMatch(/drop /i);
    expect(code).not.toMatch(/create (or replace )?(function|policy|view|trigger|index)/i);
  });
});
