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
const RELEASED = /^\d{14}_(drop_legacy_friend_wardrobe_policy|wardrobe_images_private|purge_legacy_pro_tables)\.sql$/;
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
    expect(migrations.filter(f => /drop_legacy_friend_wardrobe_policy|wardrobe_images_private|purge_legacy_pro_tables/.test(f) && !RELEASED.test(f))).toEqual([]);
    for (const f of migrations.filter(f => RELEASED.test(f))) {
      expect(held).not.toContain(f.replace(/^\d{14}_/, ''));
      expect(versionOf(f)! > '20261013000000').toBe(true);     // later than the newest migration that existed when this was written
    }
  });

  // Professional accounts (pro-accounts.md 3.1): eight files, one concern each. Their digits are working versions that
  // the release recipe replaces (read the remote head, rename the eight files to v ... v+7), so nothing below names a
  // date or a range: it holds before and after the rename.
  describe('professional accounts', () => {
    const NAMES = ['lockdown_legacy_tables', 'foundation', 'upkeep', 'profiles_invites', 'connections', 'sharing', 'work', 'moderation'];
    const PRO = /^\d{14}_pro_(lockdown_legacy_tables|foundation|upkeep|profiles_invites|connections|sharing|work|moderation)\.sql$/;
    const pro = migrations.filter(f => /^\d+_pro_/.test(f));
    const nameOf = (f: string) => f.replace(/^\d+_pro_/, '').replace(/\.sql$/, '');

    it('has only the eight files, by name, each with a 14 digit version', () => {
      expect(pro.filter(f => !PRO.test(f))).toEqual([]);
      expect(new Set(pro.map(nameOf)).size).toBe(pro.length);
    });

    it('applies them in the documented order: the order of their versions is the order of the list', () => {
      // `migrations` is sorted by file name, which starts with the version, so this is the order db push applies them in
      expect(pro.map(nameOf)).toEqual(NAMES.filter(n => pro.map(nameOf).includes(n)));
    });

    it('puts every one of them after every file of the other features, a held file released later excepted', () => {
      const others = own.filter(f => !/^\d+_pro_/.test(f));
      const newestOther = others.map(f => versionOf(f)!).sort().pop()!;
      for (const f of pro) expect(`${f} > ${newestOther}: ${versionOf(f)! > newestOther}`).toBe(`${f} > ${newestOther}: true`);
    });

    it('gives no two of them one version', () => {
      expect(new Set(pro.map(f => versionOf(f))).size).toBe(pro.length);
    });

    it('is complete: all eight files exist (the last three come with the sharing, work and moderation streams)', () => {
      expect(NAMES.filter(n => !pro.map(nameOf).includes(n))).toEqual([]);
    });
  });
});
