/**
 * The item photos migration adds one list column, caps it at what the app lets a person add, can run
 * twice, and changes nothing else. Reads the migration as text, like itemSizeConditionMigration.test.ts.
 */
import fs from 'fs';
import path from 'path';
import { MAX_ITEM_IMAGES } from '../src/utils/itemImages';

const dir = path.resolve(__dirname, '..', 'supabase', 'migrations');
const file = '20261021000000_item_images.sql';
const sql = fs.readFileSync(path.join(dir, file), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('item images migration', () => {
  it('adds a text[] column that is never null and starts empty', () => {
    expect(code).toMatch(/add column if not exists images text\[\] not null default '\{\}'/i);
  });

  it('caps the list at the number of photos the app allows', () => {
    const cap = code.match(/cardinality\(images\) <= (\d+)/i);
    expect(cap).not.toBeNull();
    expect(Number(cap![1])).toBe(MAX_ITEM_IMAGES);
  });

  it('can run twice: the column and the constraint are both guarded', () => {
    expect(code).toMatch(/add column if not exists/i);
    expect(code.match(/if not exists \(select 1 from pg_constraint/gi)).toHaveLength(1);
    expect(code).toMatch(/conname = 'clothing_items_images_check'/);
    expect(code).toMatch(/add constraint clothing_items_images_check/);
  });

  it('changes nothing else and writes no rows (a backfill would need a WHERE; none is wanted)', () => {
    expect(code).not.toMatch(/drop /i);
    expect(code).not.toMatch(/create (or replace )?(function|policy|view|trigger|index)/i);
    expect(code).not.toMatch(/alter table(?! public\.clothing_items)/i);
    expect(code).not.toMatch(/\bupdate\s+[\w."]+\s+set\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
  });
});
