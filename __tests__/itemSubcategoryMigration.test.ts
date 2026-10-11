/**
 * The item-type migration adds the nullable column the app reads and writes, can
 * be run twice and changes nothing else. Reads the migration as text, like
 * itemEstimatedValueMigration.test.ts.
 */
import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'migrations', '20261011000000_item_subcategory.sql'),
  'utf8',
);
const code = sql.replace(/--.*$/gm, '');

describe('item subcategory migration', () => {
  it('adds subcategory as nullable text', () => {
    expect(code).toMatch(/add column if not exists subcategory text\s*;/i);
    expect(code).not.toMatch(/not null/i);
  });

  it('caps its length at the 60 the app allows', () => {
    expect(code).toMatch(/check \(subcategory is null or char_length\(subcategory\) <= 60\)/i);
  });

  it('can run twice, and changes nothing else', () => {
    expect(code).toMatch(/if not exists \(\s*select 1 from pg_constraint/i);
    expect(code).not.toMatch(/drop /i);
    expect(code).not.toMatch(/create (or replace )?(function|policy|view|trigger|index)/i);
    expect(code.match(/alter table/gi)).toHaveLength(2);
  });
});
