/**
 * The ratings hardening migration closes one view and nothing else. The legacy friends policy drop is a gated
 * file kept outside supabase/migrations until the owner releases it; the Phase 1 flag cannot be on while it is
 * still held. Reads the files as text, like itemSizeConditionMigration.test.ts.
 */
import fs from 'fs';
import path from 'path';
import { TAG_SCAN_ENABLED } from '../src/config/ratingFlags';

const root = path.resolve(__dirname, '..', 'supabase');
const migrations = path.join(root, 'migrations');
const held = path.join(root, 'held');
const code = (sql: string) => sql.replace(/--.*$/gm, '');
const read = (file: string) => fs.readFileSync(file, 'utf8');

const HARDENING = '20261014000000_ratings_hardening.sql';
const DROP_NAME = 'drop_legacy_friend_wardrobe_policy.sql';
const heldDrop = path.join(held, DROP_NAME);
const releasedDrops = (): string[] =>
  fs.readdirSync(migrations).filter(f => f.endsWith(`_${DROP_NAME}`) || f === DROP_NAME);

/** The Phase 1 flag may be on only when the drop has been released (moved into migrations) and nothing is left held. */
const flagIsSafe = (flagOn: boolean, heldExists: boolean, releasedCount: number): boolean => {
  const copies = (heldExists ? 1 : 0) + releasedCount;
  if (copies !== 1) return false;
  return flagOn ? !heldExists : true;
};

describe('ratings hardening migration', () => {
  const sql = read(path.join(migrations, HARDENING));
  const body = code(sql);

  it('revokes the view only when it exists', () => {
    expect(body).toMatch(/if to_regclass\('public\.material_usage_stats'\) is not null then\s+revoke all on public\.material_usage_stats from public, anon, authenticated;\s+end if;/i);
  });

  it('touches the one view and nothing else', () => {
    expect(body.match(/\brevoke\b/gi)).toHaveLength(1);
    expect(body).not.toMatch(/\bgrant\b/i);
    expect(body).not.toMatch(/\bdrop\b/i);
    expect(body).not.toMatch(/\balter\b/i);
    expect(body).not.toMatch(/\bcreate\b/i);
    expect(body).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(body).not.toMatch(/clothing_items/i);
    expect(body.match(/public\.\w+/g)).toEqual(['public.material_usage_stats', 'public.material_usage_stats']);
  });

  it('can run twice', () => {
    // revoke is idempotent, and the guard means a database without the view is a no-op
    expect(body).toMatch(/^\s*do \$\$/m);
  });

  it('says why', () => {
    expect(sql).toMatch(/material_usage_stats counts how many members use each material/);
    expect(sql).toMatch(/Safe to run twice/);
  });
});

describe('the gated friends policy drop', () => {
  it('has exactly one copy: held, or released into supabase/migrations under a 14 digit version', () => {
    const copies = [fs.existsSync(heldDrop) ? [heldDrop] : [], releasedDrops().map(f => path.join(migrations, f))].flat();
    expect(copies).toHaveLength(1);
    for (const f of releasedDrops()) {
      expect(f).toMatch(/^\d{14}_drop_legacy_friend_wardrobe_policy\.sql$/);
      expect(f.slice(0, 14) > '20261013000000').toBe(true);
    }
  });

  it('cannot be outrun by the Phase 1 flag: tag scanning needs the released drop', () => {
    // The real tree: with the flag on, the drop must be released (and held no longer). Dark, either state is fine.
    expect(flagIsSafe(TAG_SCAN_ENABLED, fs.existsSync(heldDrop), releasedDrops().length)).toBe(true);
  });

  it('would catch the flag being turned on while the drop is still held, missing or doubled', () => {
    expect(flagIsSafe(true, true, 0)).toBe(false);     // held, not released
    expect(flagIsSafe(true, false, 0)).toBe(false);    // lost altogether
    expect(flagIsSafe(true, true, 1)).toBe(false);     // two copies
    expect(flagIsSafe(true, false, 2)).toBe(false);    // two released copies
    expect(flagIsSafe(true, false, 1)).toBe(true);     // released
    expect(flagIsSafe(false, true, 0)).toBe(true);     // dark and held
    expect(flagIsSafe(false, false, 1)).toBe(true);    // dark and released
    expect(flagIsSafe(false, false, 0)).toBe(false);   // lost
  });

  const dropFile = fs.existsSync(heldDrop) ? heldDrop : path.join(migrations, releasedDrops()[0] ?? '');
  const sql = read(dropFile);
  const body = code(sql).trim();

  it('drops that one policy and nothing else', () => {
    expect(body).toBe(`drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;`);
  });

  it('names the policy that is on the live table, exactly', () => {
    // 20261007000100 re-created it under this name; a typo here would drop nothing and say nothing
    const rewrite = read(path.join(migrations, '20261007000100_wishlist_stays_private.sql'));
    expect(rewrite).toMatch(/create policy "Friends can view each other's wardrobe"\s+on public\.clothing_items/);
  });

  it('explains itself and how it is released', () => {
    expect(sql).toMatch(/GATED/);
    expect(sql).toMatch(/get_friend_closet\(\)/);
    expect(sql).toMatch(/supabase db push --dry-run/);
    expect(sql).toMatch(/newest=\$\(ls supabase\/migrations/);
    expect(sql).toMatch(/Safe to run twice/);
  });

  it('stays out of the migrations folder while the flag is off and the drop is held', () => {
    if (fs.existsSync(heldDrop)) {
      expect(releasedDrops()).toEqual([]);
    }
  });
});
