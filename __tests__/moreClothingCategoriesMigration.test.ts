/**
 * The database CHECK on clothing_items.category must allow exactly the
 * categories the app can save. If a category is added to the app without the
 * constraint, saving it fails on the server.
 *
 * Reads the migration as text, like navigationRoutes.test.ts reads App.tsx.
 */
import fs from 'fs';
import path from 'path';
import { CLOTHING_CATEGORIES } from '../src/utils/clothingOptions';

const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
const sql = fs.readFileSync(path.join(migrationsDir, '20261007000000_more_clothing_categories.sql'), 'utf8');

/** The values listed in the `check (category in (...))` of the migration. */
const allowed = (): string[] => {
  const list = sql.match(/check\s*\(\s*category\s+in\s*\(([\s\S]*?)\)\s*\)/i);
  if (!list) throw new Error('no category CHECK in the migration');
  return [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

describe('clothing_items category constraint', () => {
  it('allows exactly the categories the app offers', () => {
    expect([...allowed()].sort()).toEqual([...CLOTHING_CATEGORIES].sort());
  });

  it('keeps the original six, so older app builds can still save', () => {
    for (const original of ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories']) {
      expect(allowed()).toContain(original);
    }
  });

  it('replaces the old constraint instead of leaving two that disagree', () => {
    expect(sql).toMatch(/drop constraint/i);
    expect(sql).toMatch(/add constraint clothing_items_category_check/i);
  });
});
