/**
 * The estimated-value migration adds the two columns the app reads and writes,
 * can be run twice, and changes nothing else (friends' closets in particular
 * must not start returning values).
 *
 * Reads the migration as text, like moreClothingCategoriesMigration.test.ts.
 */
import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'migrations', '20261008000000_item_estimated_value.sql'),
  'utf8',
);
const code = sql.replace(/--.*$/gm, '');
const storage = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'services', 'storage.ts'), 'utf8');

describe('item estimated value migration', () => {
  it('adds estimated_value as numeric(12,2) and value_source as text, both nullable', () => {
    expect(code).toMatch(/add column if not exists estimated_value numeric\(12,\s*2\)\s*,/i);
    expect(code).toMatch(/add column if not exists value_source text\s*;/i);
    expect(code).not.toMatch(/not null/i);
  });

  it('rejects negative values and unknown sources', () => {
    expect(code).toMatch(/check \(estimated_value is null or estimated_value >= 0\)/i);
    expect(code).toMatch(/check \(value_source is null or value_source in \('user', 'estimate'\)\)/i);
  });

  it('can run twice: columns and constraints are only added when missing', () => {
    expect(code).toMatch(/add column if not exists/i);
    expect(code.match(/if not exists \(\s*select 1 from pg_constraint/gi)).toHaveLength(2);
  });

  it('changes nothing else', () => {
    expect(code).not.toMatch(/get_friend_closet/i);
    expect(code).not.toMatch(/create (or replace )?(function|policy|view|trigger|index)/i);
    expect(code).not.toMatch(/drop /i);
    expect(code.match(/alter table/gi)).toHaveLength(3);
  });

  it('uses the column names the app reads and writes', () => {
    expect(storage).toContain('estimated_value');
    expect(storage).toContain('value_source');
  });
});
