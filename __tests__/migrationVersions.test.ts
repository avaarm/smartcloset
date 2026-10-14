/**
 * `supabase db push` records each migration under its version (the digits before the first underscore),
 * and the version is the primary key of the table that remembers what ran. Two files with the same version
 * and different names make `db push` and `db reset` fail, and nothing in a diff review shows it. Every
 * feature that adds migrations is covered by this one test (owner: Q0, the ratings foundation stream).
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', 'supabase');
const migrations = fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
const held = fs.existsSync(path.join(root, 'held')) ? fs.readdirSync(path.join(root, 'held')) : [];
const versionOf = (file: string) => file.match(/^(\d+)_/)?.[1];
// A held file released into the folder keeps its name behind a 14 digit release-day version (swap.md 4.1,
// quality-ratings.md 4.1). That version is "later than every file present at the time", so it can fall anywhere.
const RELEASED = /^\d{14}_(drop_legacy_friend_wardrobe_policy|wardrobe_images_private)\.sql$/;
const own = migrations.filter(f => !RELEASED.test(f));
const within = (f: string, from: string, to: string) => { const v = versionOf(f)!; return v >= from && v <= to; };

describe('supabase/migrations', () => {
  it('gives every file a version and a name', () => {
    for (const f of migrations) expect(versionOf(f)).toBeDefined();
  });

  it('has no two files with the same version', () => {
    const seen = new Map<string, string>();
    for (const f of migrations) {
      const v = versionOf(f)!;
      expect(`${v} is used by ${seen.get(v) ?? f}`).toBe(`${v} is used by ${f}`);
      seen.set(v, f);
    }
  });

  it('keeps each feature to its own range: another feature must take a range of its own', () => {
    // Ratings: 20261014000000 to 20261014000399. Swaps: 20261015000000 (a prerequisite table) and
    // 20261015000100 to 20261015000500. See documentation/design/BUILD-PLAN.md.
    const ratings = own.filter(f => within(f, '20261014000000', '20261014000399'));
    expect(ratings.every(f => /^20261014000(000_ratings_hardening|200_consents_and_quota|300_quality_ratings)\.sql$/.test(f))).toBe(true);
    const swaps = own.filter(f => within(f, '20261015000000', '20261015000500'));
    expect(swaps.every(f => /^2026101500(0000_styling_recommendations_if_missing|0[1-5]00_swap_)/.test(f))).toBe(true);
  });

  it('holds back what is waiting for a decision: a held file is not a migration, and a released one has no second copy', () => {
    for (const f of held) expect(versionOf(f)).toBeUndefined();
    expect(migrations.filter(f => /drop_legacy_friend_wardrobe_policy|wardrobe_images_private/.test(f) && !RELEASED.test(f))).toEqual([]);
    for (const f of migrations.filter(f => RELEASED.test(f))) {
      expect(held).not.toContain(f.replace(/^\d{14}_/, ''));
      expect(versionOf(f)! > '20261013000000').toBe(true);     // later than the newest migration that existed when this was written
    }
  });
});
