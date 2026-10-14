/**
 * The quality ratings migration: private item and brand ratings, an opt-in contribution to brand insight, and the
 * one function other members read through. Reads the migration (and the SQL check scripts that go with it) as text,
 * like consentsAndQuotaMigration.test.ts. The behaviour itself is exercised by supabase/checks/*.sql on a scratch
 * PostgreSQL (documentation/design/quality-ratings.md 4.11 and 9.3), not here. The tests are written to match the
 * SQL; the SQL is not edited to make them pass.
 */
import fs from 'fs';
import path from 'path';
import {
  BUY_AGAIN,
  COMFORT_TAGS,
  FIT_VERDICTS,
  HOLDS_UP_TAGS,
  INSIGHT_REPORT_REASONS,
  MAX_TAGS_PER_GROUP,
  MIN_WEARS_FOR_HOLDS_UP,
  NOTE_MAX_LENGTH,
  RATINGS_POLICY_VERSION,
  TOUCH_TAGS,
} from '../src/config/ratingVocabulary';
import { brandKeyRaw } from '../src/utils/brandKey';
import { BRAND_TIERS } from '../src/utils/itemValueTables';

const repo = path.resolve(__dirname, '..');
const read = (...parts: string[]): string => fs.readFileSync(path.join(repo, ...parts), 'utf8');
const stripComments = (text: string): string => text.replace(/--.*$/gm, '');
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

const MIGRATION = '20261014000300_quality_ratings.sql';
const CONSENTS_MIGRATION = '20261014000200_consents_and_quota.sql';
const sql = read('supabase', 'migrations', MIGRATION);
const code = stripComments(sql);
const flat = squash(code);

/** The text of one function: from its create to the closing `$$;`. */
const fn = (name: string, source: string = code): string => {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf('$$', start);
  return source.slice(start, source.indexOf('$$;', open + 2) + 3);
};
/** True when the function contains the snippet (whitespace does not matter). */
const has = (name: string, snippet: string): boolean => squash(fn(name)).includes(squash(snippet));
/** The argument types of a function, as the revoke and grant statements must spell them. */
const signature = (name: string): string => {
  const m = code.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)\\s*returns`));
  expect(m).not.toBeNull();
  const args = m![1].trim() === '' ? [] : m![1].split(',').map(a => a.trim().split(/\s+/)[1]);
  return `public.${name}(${args.join(', ')})`;
};
const position = (body: string, text: string): number => {
  const i = body.indexOf(text);
  expect(i).toBeGreaterThan(-1);
  return i;
};
const list = (text: string): string[] => Array.from(text.matchAll(/'([^']*)'/g), m => m[1]);

const TABLES = [
  'rating_settings', 'rating_suppressions', 'brand_aliases', 'material_aliases',
  'item_ratings', 'brand_ratings', 'brand_stats', 'insight_reports',
];

/** Members call these; everything else is internal (4.6). */
const PUBLIC_FUNCTIONS = [
  'save_item_rating', 'get_my_item_rating', 'delete_item_rating', 'save_brand_rating', 'delete_brand_rating',
  'withdraw_contributions', 'delete_all_my_ratings', 'get_my_brand_summary', 'get_brand_insight', 'report_brand_insight',
];
/** Small pure helpers: not security definer, still revoked from every client role. */
const PURE_HELPERS = ['brand_key_raw', 'resolve_brand_key', 'canonical_fibre', 'primary_material_key', 'count_bucket', 'round_shares_5'];
const INTERNAL_FUNCTIONS = [
  ...PURE_HELPERS,
  'invalidate_brand_stats', 'on_rating_row_deleted', 'rebuild_brand_keys', 'on_consent_changed_share_ratings',
  'rating_voters', 'rating_item_rows', 'rating_brand_rows', 'compute_brand_stats',
];

const functions = Array.from(code.matchAll(/create or replace function public\.(\w+)\(/g), m => m[1]);

describe('quality ratings migration: tables', () => {
  it('creates the eight tables, each only if missing', () => {
    expect(code.match(/create table\b/gi)).toHaveLength(8);
    expect(code.match(/create table if not exists public\.\w+/gi)).toHaveLength(8);
    const created = Array.from(code.matchAll(/create table if not exists public\.(\w+)/g), m => m[1]);
    expect(created.sort()).toEqual([...TABLES].sort());
  });

  it.each(TABLES)('locks %s down: row-level security on, nothing granted to the public roles', table => {
    expect(code).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
    const revoked = Array.from(code.matchAll(/revoke all on (?!function)([^;]*?)\s+from public, anon, authenticated;/g), m => m[1])
      .flatMap(tables => tables.split(',').map(t => t.trim()));
    expect(revoked).toContain(`public.${table}`);
  });

  it('grants a table to nobody except select on a member\'s own rating rows', () => {
    const grants = Array.from(code.matchAll(/grant\b(?! execute)[^;]*;/gi), m => squash(m[0]));
    expect(grants).toEqual(['grant select on public.item_ratings, public.brand_ratings to authenticated;']);
  });

  it('lets a member read only their own rows, and re-creates the two policies safely', () => {
    expect(code.match(/create policy/gi)).toHaveLength(2);
    expect(flat).toContain(
      'drop policy if exists "own item ratings" on public.item_ratings; create policy "own item ratings" on public.item_ratings for select to authenticated using (auth.uid() = user_id);',
    );
    expect(flat).toContain(
      'drop policy if exists "own brand ratings" on public.brand_ratings; create policy "own brand ratings" on public.brand_ratings for select to authenticated using (auth.uid() = user_id);',
    );
    // every other table has no policy at all: only the functions below touch them
    for (const table of TABLES.filter(t => t !== 'item_ratings' && t !== 'brand_ratings')) {
      expect(code).not.toMatch(new RegExp(`policy[^;]*on public\\.${table}\\b`, 'i'));
    }
  });

  it('cascades every member column from auth.users, and every rating from its item', () => {
    expect(code.match(/references auth\.users/g)).toHaveLength(4);
    expect(code.match(/references auth\.users\(id\) on delete cascade/g)).toHaveLength(4);
    expect(flat).toContain('item_id uuid primary key references public.clothing_items(id) on delete cascade');
    expect(code.match(/references public\.clothing_items/g)).toHaveLength(1);
    for (const table of ['item_ratings', 'brand_ratings', 'insight_reports', 'rating_suppressions']) {
      const start = code.indexOf(`create table if not exists public.${table} (`);
      const body = code.slice(start, code.indexOf('\n);', start));
      expect(body).toMatch(/user_id\s+uuid (not null|primary key) references auth\.users\(id\) on delete cascade/);
    }
  });

  it('keeps one rating per item, one brand rating per member and brand, one report per member and brand', () => {
    expect(flat).toContain('item_id uuid primary key');
    expect(flat).toMatch(/primary key \(user_id, brand_key\), constraint brand_ratings_contributed_check/);
    expect(flat).toMatch(/reason in \('looks_manipulated', 'inaccurate', 'other'\)\), created_at timestamptz not null default now\(\), primary key \(user_id, brand_key\)/);
  });

  it('keeps brand keys to a-z and 0-9, 2 to 40 characters, wherever one is stored', () => {
    expect(code.match(/~ '\^\[a-z0-9\]\{2,40\}\$'/g)).toHaveLength(6);   // item, brand rating, stats, report, alias, alias target
    expect(code).toMatch(/alias_key text primary key check \(alias_key ~ '\^\[a-z0-9\]\{2,40\}\$'\)/);
    expect(code).toMatch(/brand_key text not null check \(brand_key ~ '\^\[a-z0-9\]\{2,40\}\$'\)/);
    expect(code).toMatch(/brand_key\s+text check \(brand_key is null or brand_key ~ '\^\[a-z0-9\]\{2,40\}\$'\)/);
    expect(code).toMatch(/brand_label\s+text not null check \(char_length\(brand_label\) between 1 and 60\)/);
  });

  it('allows scores of 1 to 5 only', () => {
    for (const column of ['overall', 'touch', 'comfort', 'holds_up', 'quality', 'fit_consistency', 'value']) {
      expect(code).toMatch(new RegExp(`\\b${column}\\s+smallint (not null )?check \\(${column} between 1 and 5\\)`));
    }
  });

  it('never lets a rating be marked as contributed without a brand and a time', () => {
    expect(flat).toContain('constraint item_ratings_contributed_check check (not contributed or (brand_key is not null and contributed_at is not null))');
    expect(flat).toContain('constraint brand_ratings_contributed_check check (not contributed or contributed_at is not null)');
    expect(code).toMatch(/contributed\s+boolean not null default false/);
  });

  it('keeps a stored aggregate to a status and a payload, nothing per member', () => {
    const start = code.indexOf('create table if not exists public.brand_stats (');
    const body = code.slice(start, code.indexOf('\n);', start));
    expect(body).toMatch(/status\s+text not null check \(status in \('ok', 'insufficient'\)\)/);
    expect(body).toMatch(/payload\s+jsonb not null/);
    expect(body).not.toMatch(/user_id|item_id|email/);
  });
});

describe('quality ratings migration: settings', () => {
  const start = code.indexOf('create table if not exists public.rating_settings (');
  const settings = code.slice(start, code.indexOf('\n);', start));

  it('keeps one row, seeded once', () => {
    expect(settings).toMatch(/id\s+boolean primary key default true check \(id\)/);
    expect(code).toMatch(/insert into public\.rating_settings \(id\) values \(true\) on conflict \(id\) do nothing;/);
  });

  it('ships the thresholds the design settled on (10, 10, 5, 10, 7, 30, 5, 24, 6)', () => {
    const order = ['k_brand', 'k_slice', 'k_chip', 'min_old_voters', 'min_account_days', 'old_account_days', 'min_owned_items', 'settle_hours', 'cache_ttl_hours'];
    const defaults = order.map(name => {
      const m = settings.match(new RegExp(`\\b${name}\\s+integer not null default (\\d+)\\b`));
      expect(m).not.toBeNull();
      return Number(m![1]);
    });
    expect(defaults).toEqual([10, 10, 5, 10, 7, 30, 5, 24, 6]);
  });

  it('ships the other numbers as designed', () => {
    const expected: Record<string, string> = {
      prior_mean: '3.5', prior_weight: '5', young_weight: '0.5', trim_from: '20', burst_min: '5', hold_days: '7',
      straight_min_ratings: '8', straight_max_sd: '0.3', read_limit_per_day: '150', write_limit_per_day: '60',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(settings).toMatch(new RegExp(`\\b${name}\\s+(integer|numeric) not null default ${value.replace('.', '\\.')}\\b`));
    }
    expect(settings).toMatch(/insights_enabled\s+boolean not null default true/);
  });

  it('refuses values that would weaken a protection', () => {
    expect(settings).toMatch(/k_brand\s+integer not null default 10\s+check \(k_brand >= 3\)/);
    expect(settings).toMatch(/k_slice\s+integer not null default 10\s+check \(k_slice >= 5\)/);
    expect(settings).toMatch(/k_chip\s+integer not null default 5\s+check \(k_chip >= 3\)/);
    expect(settings).toMatch(/young_weight\s+numeric not null default 0\.5 check \(young_weight between 0 and 1\)/);
    expect(settings).toMatch(/trim_from\s+integer not null default 20\s+check \(trim_from >= 10\)/);
  });
});

describe('quality ratings migration: functions', () => {
  it('defines exactly the 24 functions, each with a fixed search path', () => {
    expect(functions).toHaveLength(24);
    expect([...functions].sort()).toEqual([...PUBLIC_FUNCTIONS, ...INTERNAL_FUNCTIONS].sort());
    for (const name of functions) {
      const header = fn(name).slice(0, fn(name).indexOf('$$'));
      expect(header).toMatch(/set search_path = public/);
    }
  });

  it('runs every function as its owner except the six pure helpers', () => {
    const notDefiner = functions.filter(name => !/security definer/.test(fn(name).slice(0, fn(name).indexOf('$$'))));
    expect([...notDefiner].sort()).toEqual([...PURE_HELPERS].sort());
  });

  it('follows every function with its revoke, spelled with the exact argument types', () => {
    for (const name of functions) {
      const body = fn(name);
      const after = squash(code.slice(code.indexOf(body) + body.length, code.indexOf(body) + body.length + 600));
      const sig = signature(name);
      if (PUBLIC_FUNCTIONS.includes(name)) {
        expect(after.startsWith(`revoke all on function ${sig} from public, anon; grant execute on function ${sig} to authenticated;`)).toBe(true);
      } else {
        expect(after.startsWith(`revoke all on function ${sig} from public, anon, authenticated;`)).toBe(true);
        expect(after.startsWith(`revoke all on function ${sig} from public, anon, authenticated; grant`)).toBe(false);
      }
    }
  });

  it('grants execute to signed-in members on the ten member functions and to nobody else', () => {
    const grants = Array.from(code.matchAll(/grant execute on function public\.(\w+)\(([^)]*)\) to (\w+);/g));
    expect(grants.map(g => g[1]).sort()).toEqual([...PUBLIC_FUNCTIONS].sort());
    for (const g of grants) {
      expect(g[3]).toBe('authenticated');
    }
    expect(code).not.toMatch(/\bto (public|anon)\b/i);
    expect(code.match(/revoke all on function/g)).toHaveLength(24);
  });

  it('works only for the signed-in member', () => {
    for (const name of PUBLIC_FUNCTIONS) {
      const body = fn(name);
      expect(body).toMatch(/uid uuid := auth\.uid\(\);/);
      expect(body).toContain("raise exception 'not_authenticated' using errcode = '28000';");
      // nothing a member sends decides whose data is read: no function takes a user id
      expect(body.slice(0, body.indexOf('$$'))).not.toMatch(/p_user\b|p_uid\b|p_owner\b/);
    }
  });

  it('uses the error codes the client maps (4.6), one code per message', () => {
    const codes = new Map<string, Set<string>>();
    for (const m of code.matchAll(/raise exception '(\w+)' using errcode = '(\w+)';/g)) {
      codes.set(m[1], (codes.get(m[1]) ?? new Set()).add(m[2]));
    }
    const table = Object.fromEntries(Array.from(codes, ([message, set]) => [message, Array.from(set)]));
    expect(table).toEqual({
      not_authenticated: ['28000'],
      item_not_found: ['22023'],
      invalid_rating: ['22023'],
      rating_rate_limited: ['54000'],
      invalid_brand: ['22023'],
      not_a_brand_owner: ['42501'],
      invalid_report: ['22023'],
    });
  });

  it('never asks the client for a consent step: neither save function can raise consent_required', () => {
    expect(fn('save_item_rating')).not.toContain('consent_required');
    expect(fn('save_brand_rating')).not.toContain('consent_required');
    expect(code).not.toContain('consent_required');
  });
});

describe('quality ratings migration: saving a rating', () => {
  it('reads the brand, the wear count and the owner from the item, never from the client', () => {
    const header = fn('save_item_rating').slice(0, fn('save_item_rating').indexOf('$$'));
    expect(header).not.toMatch(/p_brand|p_wear|p_user|p_brand_key/);
    expect(has('save_item_rating', `select ci.brand, coalesce(ci.wear_count, 0) into v_brand, v_wears
      from public.clothing_items ci
     where ci.id = p_item_id and ci.user_id = uid and not coalesce(ci.is_wishlist, false);`)).toBe(true);
    expect(has('save_item_rating', "raise exception 'item_not_found' using errcode = '22023';")).toBe(true);
    expect(has('save_item_rating', 'v_key := public.resolve_brand_key(v_brand);')).toBe(true);
  });

  it('checks everything before it spends a use of the daily allowance, and spends it before it writes', () => {
    const body = fn('save_item_rating');
    expect(position(body, "'not_authenticated'")).toBeLessThan(position(body, "'item_not_found'"));
    expect(position(body, "'item_not_found'")).toBeLessThan(position(body, "'invalid_rating'"));
    expect(position(body, "'invalid_rating'")).toBeLessThan(position(body, 'hit_quota(uid'));
    expect(position(body, 'hit_quota(uid')).toBeLessThan(position(body, 'insert into public.item_ratings'));
    const brand = fn('save_brand_rating');
    expect(position(brand, "'not_authenticated'")).toBeLessThan(position(brand, "'invalid_brand'"));
    expect(position(brand, "'invalid_brand'")).toBeLessThan(position(brand, "'invalid_rating'"));
    expect(position(brand, "'invalid_rating'")).toBeLessThan(position(brand, "'not_a_brand_owner'"));
    expect(position(brand, "'not_a_brand_owner'")).toBeLessThan(position(brand, 'hit_quota(uid'));
    expect(position(brand, 'hit_quota(uid')).toBeLessThan(position(brand, 'insert into public.brand_ratings'));
  });

  it('counts a write against the daily allowance, and a contributing write by a young account against a smaller one', () => {
    for (const name of ['save_item_rating', 'save_brand_rating']) {
      expect(has(name, "if not public.hit_quota(uid, 'rating_write', cfg.write_limit_per_day) then")).toBe(true);
      expect(has(name, "if coalesce(v_young, true) and not public.hit_quota(uid, 'rating_contribute_young', 5) then")).toBe(true);
      expect(has(name, 'u.created_at > now() - make_interval(days => cfg.old_account_days)')).toBe(true);
    }
    expect(has('get_brand_insight', "hit_quota(uid, 'insight_read', cfg.read_limit_per_day)")).toBe(true);
    expect(has('report_brand_insight', "hit_quota(uid, 'insight_report', 10)")).toBe(true);
  });

  it('always saves; asking to contribute when it is not allowed saves privately and says why', () => {
    const item = fn('save_item_rating');
    expect(has('save_item_rating', `if p_contribute is null then
      v_contrib := v_had and v_prev.contributed and v_key is not null;`)).toBe(true);
    expect(has('save_item_rating', `elsif p_contribute then
      if not public.consent_in_force(uid, 'share_ratings') then
        v_blocked := 'no_consent';
      elsif v_key is null then
        v_blocked := 'no_brand';
      elsif v_wears < 1 then
        v_blocked := 'not_worn';
      else
        v_contrib := true;
      end if;`)).toBe(true);
    expect(item).toContain('returns table (contributed boolean, contribution_blocked text, updated_at timestamptz)');
    expect(has('save_brand_rating', `elsif p_contribute then
      if not public.consent_in_force(uid, 'share_ratings') then
        v_blocked := 'no_consent';
      elsif not exists (`)).toBe(true);
    expect(has('save_brand_rating', "v_blocked := 'not_worn';")).toBe(true);
    expect(fn('save_brand_rating')).toContain('returns table (contributed boolean, contribution_blocked text)');
    // the stored choice survives a call that leaves p_contribute out
    expect(has('save_brand_rating', 'if p_contribute is null then v_contrib := v_had and v_prev.contributed;')).toBe(true);
  });

  it('makes the one-tap star harmless on a stale screen', () => {
    expect(has('save_item_rating', `if v_had and coalesce(p_only_if_new, false) then
      return query select v_prev.contributed, null::text, v_prev.updated_at;
      return;
    end if;`)).toBe(true);
    expect(fn('save_item_rating')).toContain('p_only_if_new     boolean default false');
  });

  it('keeps how-it-holds-up for pieces worn at least three times, and trims the note to 500 characters', () => {
    expect(has('save_item_rating', `if v_wears < ${MIN_WEARS_FOR_HOLDS_UP} then v_holds := null; v_holds_tags := '{}'; end if;`)).toBe(true);
    expect(has('save_item_rating', `v_note := left(v_note, ${NOTE_MAX_LENGTH});`)).toBe(true);
    expect(has('save_item_rating', "v_note := nullif(btrim(coalesce(p_note, '')), '');")).toBe(true);
  });

  it('refuses a brand rating for a brand the member owns nothing of, unless they are editing one', () => {
    expect(has('save_brand_rating', `if not v_had and not exists (
       select 1 from public.clothing_items ci
        where ci.user_id = uid and not coalesce(ci.is_wishlist, false)
          and public.resolve_brand_key(ci.brand) = v_key) then
      raise exception 'not_a_brand_owner' using errcode = '42501';`)).toBe(true);
    expect(has('save_brand_rating', "if v_key is null or v_label = '' then raise exception 'invalid_brand' using errcode = '22023';")).toBe(true);
    expect(has('save_brand_rating', "v_label text := left(btrim(coalesce(p_brand, '')), 60);")).toBe(true);
  });

  it('takes a brand\'s stored numbers away at once when a contribution stops or moves', () => {
    expect(has('save_item_rating', `if v_had and v_prev.contributed and v_prev.brand_key is not null
       and (not v_contrib or v_prev.brand_key is distinct from v_key) then
      perform public.invalidate_brand_stats(v_prev.brand_key);`)).toBe(true);
    expect(has('save_brand_rating', `if v_had and v_prev.contributed and not v_contrib then
      perform public.invalidate_brand_stats(v_key);`)).toBe(true);
    expect(has('get_my_item_rating', `if r.contributed and r.brand_key is not null
       and public.hit_quota(uid, 'rating_write', (select s.write_limit_per_day from public.rating_settings s where s.id)) then
      perform public.invalidate_brand_stats(r.brand_key);`)).toBe(true);
    expect(has('get_my_item_rating', 'return to_jsonb(r) - \'user_id\';')).toBe(true);
  });

  it('charges the wipe of a brand\'s numbers by a re-file to the daily write bucket, and never refuses the re-file itself', () => {
    const body = squash(fn('get_my_item_rating'));
    // the quota test sits in the condition of the invalidation only: the member's own row is always re-filed
    expect(body.match(/hit_quota\(/g)).toHaveLength(1);
    expect(position(body, 'hit_quota(uid')).toBeLessThan(position(body, 'perform public.invalidate_brand_stats(r.brand_key)'));
    expect(position(body, 'perform public.invalidate_brand_stats(r.brand_key)')).toBeLessThan(position(body, 'update public.item_ratings'));
    expect(body).not.toMatch(/rating_rate_limited|if not public\.hit_quota/);
    // it spends the same bucket as the two saves, so the three together stay inside the one daily limit
    for (const name of ['save_item_rating', 'save_brand_rating']) {
      expect(has(name, "if not public.hit_quota(uid, 'rating_write', cfg.write_limit_per_day) then")).toBe(true);
    }
  });

  it('restarts the settle clock when a contribution is edited, and when a rating is re-filed', () => {
    expect(has('save_item_rating', 'contributed = excluded.contributed, contributed_at = excluded.contributed_at,')).toBe(true);
    expect(has('save_item_rating', 'case when v_contrib then now() end')).toBe(true);
    expect(has('save_brand_rating', 'case when v_contrib then now() end')).toBe(true);
    expect(has('get_my_item_rating', 'contributed_at = case when contributed and v_key is not null then now() end')).toBe(true);
  });

  it('keeps the member\'s own view to their own rows', () => {
    expect(has('get_my_item_rating', 'select * into r from public.item_ratings where item_id = p_item_id and user_id = uid;')).toBe(true);
    expect(has('get_my_brand_summary', 'where r.user_id = uid and public.resolve_brand_key(ci.brand) = v_key;')).toBe(true);
    expect(has('get_my_brand_summary', "select to_jsonb(b) - 'user_id' - 'brand_key' into v_brand from public.brand_ratings b where b.user_id = uid and b.brand_key = v_key;")).toBe(true);
    expect(has('delete_item_rating', 'delete from public.item_ratings where item_id = p_item_id and user_id = uid;')).toBe(true);
    expect(has('delete_brand_rating', 'delete from public.brand_ratings where user_id = uid and brand_key = v_key;')).toBe(true);
  });
});

describe('quality ratings migration: stopping and deleting', () => {
  it('withdraws every contribution of the caller at once and keeps the ratings', () => {
    const body = squash(fn('withdraw_contributions'));
    expect(body).toContain('delete from public.brand_stats where brand_key in (');
    expect(body).toContain('update public.item_ratings set contributed = false, contributed_at = null where user_id = uid and contributed;');
    expect(body).toContain('update public.brand_ratings set contributed = false, contributed_at = null where user_id = uid and contributed;');
    expect(body).not.toMatch(/delete from public\.(item|brand)_ratings/);
  });

  it('deletes every rating of the caller after withdrawing, and leaves the consent answer alone', () => {
    const body = squash(fn('delete_all_my_ratings'));
    expect(position(body, 'perform public.withdraw_contributions();')).toBeLessThan(position(body, 'delete from public.item_ratings where user_id = uid;'));
    expect(body).toContain('delete from public.brand_ratings where user_id = uid;');
    expect(body).not.toMatch(/user_consents/);
  });

  it('turns contribution off for a member who withdraws, and on for old ratings only when asked', () => {
    const body = squash(fn('on_consent_changed_share_ratings'));
    expect(body).toContain('if not p_granted then delete from public.brand_stats where brand_key in (');
    expect(body).toContain('elsif p_include_existing then');
    expect(body).toContain('coalesce(ci.wear_count, 0) >= 1');
    expect(body).toContain('public.resolve_brand_key(ci.brand) = r.brand_key');
    // nothing is contributed unless the member chose to include earlier ratings
    expect(body.indexOf('set contributed = true')).toBeGreaterThan(body.indexOf('elsif p_include_existing then'));
  });

  it('removes the brand\'s stored numbers whenever a contributed rating disappears, by any path', () => {
    const triggers = Array.from(
      code.matchAll(/create or replace trigger (\w+)\s+after delete on public\.(\w+)\s+for each row when \(old\.contributed\)\s+execute function public\.on_rating_row_deleted\(\);/g),
      m => [m[1], m[2]],
    );
    expect(triggers).toEqual([['item_ratings_deleted', 'item_ratings'], ['brand_ratings_deleted', 'brand_ratings']]);
    expect(code.match(/create (or replace )?trigger/gi)).toHaveLength(2);
    const body = squash(fn('on_rating_row_deleted'));
    expect(body).toContain('if old.brand_key is not null then delete from public.brand_stats where brand_key = old.brand_key; end if; return old;');
    expect(fn('on_rating_row_deleted')).toMatch(/returns trigger/);
  });

  it('puts a trigger on this feature\'s two tables only, never on the wardrobe table', () => {
    for (const m of code.matchAll(/create (?:or replace )?trigger[^;]*;/gi)) {
      expect(m[0]).toMatch(/\bon public\.(item_ratings|brand_ratings)\b/);
      expect(m[0]).not.toMatch(/clothing_items/);
    }
  });
});

describe('quality ratings migration: who counts and what is published', () => {
  it('counts a member only when every rule holds at the time the numbers are computed', () => {
    const body = squash(fn('rating_voters'));
    expect(body).toContain("where public.consent_in_force(u.id, 'share_ratings')");
    expect(body).toContain('and u.created_at <= now() - make_interval(days => cfg.min_account_days)');
    expect(body).toContain('and u.email_confirmed_at is not null');
    expect(body).toContain('and not exists (select 1 from public.rating_suppressions x where x.user_id = u.id)');
    expect(body).toContain('>= cfg.min_owned_items');
    expect(body).toContain('having count(*) >= cfg.straight_min_ratings and coalesce(stddev_samp(r2.overall), 0) < cfg.straight_max_sd');
    expect(body).toContain('(u.created_at <= now() - make_interval(days => cfg.old_account_days))');
    expect(fn('rating_voters')).toMatch(/returns table \(user_id uuid, is_old boolean\)/);
  });

  it('waits out the settle time everywhere a contribution is read', () => {
    const settle = /contributed_at <= now\(\) - make_interval\(hours => cfg\.settle_hours\)/g;
    expect(fn('rating_voters').match(settle)).toHaveLength(2);
    expect(fn('rating_item_rows').match(settle)).toHaveLength(1);
    expect(fn('rating_brand_rows').match(settle)).toHaveLength(1);
  });

  it('re-checks the item every time: still yours, not wishlist, worn, still that brand', () => {
    const body = squash(fn('rating_item_rows'));
    expect(body).toContain('and not coalesce(ci.is_wishlist, false) and coalesce(ci.wear_count, 0) >= 1 and public.resolve_brand_key(ci.brand) = p_key;');
    expect(body).toContain('join public.clothing_items ci on ci.id = r.item_id and ci.user_id = r.user_id');
    expect(body).toContain('where r.contributed and r.brand_key = p_key');
    expect(body).not.toMatch(/\bnote\b/);
  });

  it('counts a brand vote only while the member still owns and has worn a piece of the brand', () => {
    const body = squash(fn('rating_brand_rows'));
    expect(body).toContain('and coalesce(ci.wear_count, 0) >= 1 and public.resolve_brand_key(ci.brand) = p_key');
    expect(body).toContain('not coalesce(ci.is_wishlist, false)');
    expect(body).not.toMatch(/brand_label/);
  });

  it('files a fabric slice only under compositions read off a tag', () => {
    expect(has('rating_item_rows', 'case when ci.tag_text is not null then public.primary_material_key(ci.materials) end')).toBe(true);
  });

  it('needs enough different, established members before it publishes any number', () => {
    expect(has('compute_brand_stats', `if coalesce(v_n_all, 0) < cfg.k_brand or coalesce(v_n_old, 0) < greatest(cfg.min_old_voters, cfg.k_brand) or s is null then
      payload := jsonb_build_object('status', 'insufficient');`)).toBe(true);
  });

  it('publishes only a half-point headline when fewer than ten members take part', () => {
    expect(has('compute_brand_stats', `if public.count_bucket(v_n_all) = 'under_10' then`)).toBe(true);
    expect(has('compute_brand_stats', `'score', round((s ->> 'score')::numeric * 2) / 2);`)).toBe(true);
    expect(has('count_bucket', "when p_n < 10 then 'under_10' when p_n < 25 then '10-24' when p_n < 100 then '25-99' else '100+'")).toBe(true);
  });

  it('shrinks the headline toward the prior, trims the extremes from 20 voters, and weighs young accounts less', () => {
    const body = squash(fn('compute_brand_stats'));
    expect(body).toContain('(sum(w * overall) + cfg.prior_weight * cfg.prior_mean) / (sum(w) + cfg.prior_weight) as score');
    expect(body).toContain('where cfg.trim_from > cnt or (rn > floor(0.05 * cnt) and rn <= cnt - floor(0.05 * cnt))');
    expect(body).toContain('case when u.is_old then 1::numeric else cfg.young_weight end as w');
    // one vote per member and brand: item ratings are averaged first, then blended with the brand rating
    expect(body).toContain('case when iu.o is not null and br.overall is not null then (iu.o + br.overall) / 2.0 else coalesce(iu.o, br.overall::numeric) end as overall');
    expect(body).toContain('(avg(holds_up) filter (where wears_at_rating >= 3))::numeric as holds_up');
  });

  it('publishes each dimension, split and slice only past its own threshold', () => {
    const body = squash(fn('compute_brand_stats'));
    for (const key of ['n_feel', 'n_comfort', 'n_holds', 'n_quality', 'n_fitc', 'n_value']) {
      expect(body).toContain(`coalesce((d ->> '${key}')::integer, 0) >= cfg.k_brand`);
    }
    expect(body).toContain("fit_ok boolean := coalesce((d ->> 'n_fit')::integer, 0) >= cfg.k_slice;");
    expect(body).toContain("coalesce((d ->> 'n_rebuy')::integer, 0) >= cfg.k_slice");
    expect(body).toContain('where c >= cfg.k_chip and (select n_items from tot) >= cfg.k_slice order by c desc, tag limit 4');
    expect(body).toContain('where n >= cfg.k_slice and ((select n_items from tot) - n = 0 or (select n_items from tot) - n >= cfg.k_brand)');
    expect(body).toContain('where rk <= 6');
  });

  it('rounds what it publishes: shares to steps of 5, scores to one decimal, counts to a range', () => {
    const body = squash(fn('compute_brand_stats'));
    expect(body).toContain("'would_buy_again_pct', (round((d ->> 'rebuy')::numeric * 100 / 5) * 5)::integer");
    expect(body).toContain('public.round_shares_5(');
    expect(body).toContain("'score', round(head.score, 1)");
    expect(body).toContain("'n_bucket', public.count_bucket(tot.n_all)");
    expect(body).toContain('(round(c::numeric / nullif((select n_items from tot), 0) * 100 / 5) * 5)::integer as pct');
    expect(has('round_shares_5', 'return array[units[1] * 5, units[2] * 5, units[3] * 5];')).toBe(true);
  });

  it('holds the previous numbers when a surge of new accounts appears, and never serves a held row after a removal', () => {
    const body = squash(fn('compute_brand_stats'));
    expect(body).toContain("interval '72 hours'");
    expect(body).toContain('coalesce(v_recent_young, 0) >= cfg.burst_min and coalesce(v_recent_young, 0) * 10 > coalesce(v_recent_total, 0) * 4');
    expect(body).toContain('held_until = now() + make_interval(days => cfg.hold_days)');
    expect(body).toContain('return v_prev.payload;');
    // a held row for a brand with nothing before it is an empty answer, not a number
    expect(body).toContain("values (p_key, 'insufficient', jsonb_build_object('status', 'insufficient'), now(), now() + make_interval(days => cfg.hold_days))");
  });

  /**
   * The arguments of every jsonb_build_object( ... ) call in a function body, split at the commas that are not inside
   * a bracket or a quoted string. A nested call is also returned on its own.
   */
  const buildObjectCalls = (body: string): string[][] => {
    const calls: string[][] = [];
    for (const m of body.matchAll(/jsonb_build_object\(/g)) {
      const args: string[] = [];
      let depth = 0;
      let quoted = false;
      let current = '';
      let closed = false;
      for (let i = m.index! + m[0].length; i < body.length && !closed; i++) {
        const ch = body[i];
        if (ch === "'") {
          quoted = !quoted;                               // '' inside a string toggles twice, which is right
        }
        if (!quoted && (ch === '(' || ch === '[')) {
          depth++;
        }
        if (!quoted && (ch === ')' || ch === ']')) {
          if (depth === 0) { closed = true; continue; }
          depth--;
        }
        if (!quoted && depth === 0 && ch === ',') { args.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      expect(closed).toBe(true);
      args.push(current.trim());
      calls.push(args);
    }
    return calls;
  };
  /** The names a call gives its values: the arguments in even positions, each of which must be a quoted literal. */
  const keysOf = (args: string[]): string[] =>
    args.filter((_, i) => i % 2 === 0).map(a => {
      expect(a).toMatch(/^'[a-z_]+'$/);
      return a.slice(1, -1);
    });

  // Everything a member can read about a brand, level by level (4.4). 'dims' is the working object inside
  // compute_brand_stats; the published payload is rebuilt from it key by key and never carries it.
  const PAYLOAD_KEYS = [
    'status', 'n_bucket', 'score', 'item', 'brand', 'traits', 'slices', 'as_of',
    'feel', 'comfort', 'holds_up', 'would_buy_again_pct', 'fit', 'runs_small', 'true_to_size', 'runs_large',
    'quality', 'fit_consistency', 'value', 'group', 'tag', 'pct', 'kind', 'key', 'overall',
  ];

  it('publishes only keys on a short list: no id, text, name or exact count can be added under a new name', () => {
    const seen: string[][] = [];
    for (const name of ['compute_brand_stats', 'get_brand_insight']) {
      const body = fn(name);
      for (const args of buildObjectCalls(body)) {
        expect(args.length % 2).toBe(0);
        const keys = keysOf(args);
        seen.push(keys);
        for (const key of keys) {
          expect(PAYLOAD_KEYS.concat('dims')).toContain(key);
        }
      }
      // nothing else turns a row or a record into json
      expect(body).not.toMatch(/\b(row_to_json|to_json|json_build_object|jsonb_object|jsonb_build_array|jsonb_populate_record)\b/);
      expect(body.match(/\bto_jsonb\(/g) ?? []).toHaveLength(name === 'compute_brand_stats' ? 1 : 0);
    }
    const shapes = seen.map(keys => keys.join(','));
    // the two payloads that leave compute_brand_stats, and the working object that never does
    expect(shapes).toContain('status,n_bucket,score,item,brand,traits,slices');
    expect(shapes).toContain('status,n_bucket,score');
    expect(shapes).toContain('score,n_bucket,dims,traits,slices');
    expect(shapes.filter(s => s.includes('dims'))).toEqual(['score,n_bucket,dims,traits,slices']);
    // each level has its own keys
    expect(shapes).toContain('group,tag,pct');
    expect(shapes).toContain('kind,key,n_bucket,overall,feel,holds_up');
    expect(shapes).toContain('runs_small,true_to_size,runs_large');
    expect(shapes).toContain('as_of');
    // the key reader itself must see a key that does not belong (the mutation the scenario script also tries)
    const mutated = fn('compute_brand_stats').replace("'item', item, 'brand', brand,", "'members', v_n_all, 'item', item, 'brand', brand,");
    expect(mutated).not.toBe(fn('compute_brand_stats'));
    expect(buildObjectCalls(mutated).map(keysOf).flat()).toContain('members');
    expect(PAYLOAD_KEYS).not.toContain('members');
  });

  it('puts only ids-free, text-free output in the payload', () => {
    for (const name of ['compute_brand_stats', 'get_brand_insight']) {
      const body = fn(name);
      expect(body).not.toMatch(/'(user_id|item_id|note|brand_label|email|voters|n)'/);
      expect(body).not.toMatch(/\br\.note\b|\bci\.name\b|\bci\.notes\b|\bbrand_label\b|\bemail\b/);
    }
  });

  it('is the one door for another member\'s numbers: kill switch, quota, and the same answer for unknown and thin brands', () => {
    const body = fn('get_brand_insight');
    expect(has('get_brand_insight', "if not cfg.insights_enabled then return jsonb_build_object('status', 'unavailable');")).toBe(true);
    expect(has('get_brand_insight', `if v_key is null
     or not (exists (select 1 from public.item_ratings r where r.brand_key = v_key and r.contributed)
          or exists (select 1 from public.brand_ratings b where b.brand_key = v_key and b.contributed)) then
    return jsonb_build_object('status', 'insufficient');`)).toBe(true);
    // the unknown-brand answer comes before any row can be written for the brand
    expect(position(body, "return jsonb_build_object('status', 'insufficient');")).toBeLessThan(position(body, 'compute_brand_stats(v_key)'));
    expect(position(body, 'hit_quota(uid')).toBeLessThan(position(body, 'compute_brand_stats(v_key)'));
    // A reader who finds another one computing waits and uses its row; it is never given an empty answer, which the
    // client would remember for hours. (An advisory lock is re-entrant inside one session, so a single-transaction
    // scenario cannot show the wait; it was shown with two sessions when this was written, and this text check keeps it.)
    expect(body).not.toContain('pg_try_advisory_xact_lock');
    expect(has('get_brand_insight', `perform pg_advisory_xact_lock(hashtextextended('brand_stats:' || v_key, 0));
    select * into v_row from public.brand_stats where brand_key = v_key;
    if found and (coalesce(v_row.held_until, '-infinity') > now()
                  or v_row.computed_at > now() - make_interval(hours => cfg.cache_ttl_hours)) then
      v_payload := v_row.payload;
      v_as_of := v_row.computed_at;
    else
      v_payload := public.compute_brand_stats(v_key);
    end if;`)).toBe(true);
    expect(position(body, 'pg_advisory_xact_lock(')).toBeLessThan(position(body, 'compute_brand_stats(v_key)'));
    expect(body.match(/compute_brand_stats\(/g)).toHaveLength(1);
    expect(body).not.toMatch(/coalesce\(v_row\.payload/);
    expect(has('get_brand_insight', "to_char(v_as_of at time zone 'utc', 'YYYY-MM-DD')")).toBe(true);
    expect(has('get_brand_insight', 'v_row.computed_at > now() - make_interval(hours => cfg.cache_ttl_hours)')).toBe(true);
  });

  it('writes the cache only for a brand that already has a contributed rating', () => {
    const stats = code.match(/insert into public\.brand_stats/g);
    expect(stats).toHaveLength(2);                                  // both inside compute_brand_stats
    expect(fn('compute_brand_stats').match(/insert into public\.brand_stats/g)).toHaveLength(2);
    expect(fn('get_brand_insight')).not.toMatch(/insert into/);
  });

  it('lets a member report a score, once per brand, with one of three reasons', () => {
    expect(has('report_brand_insight', "if v_key is null or p_reason is null or p_reason not in ('looks_manipulated', 'inaccurate', 'other') then")).toBe(true);
    expect(has('report_brand_insight', `insert into public.insight_reports (user_id, brand_key, reason)
    values (uid, v_key, p_reason)
    on conflict (user_id, brand_key) do update set reason = excluded.reason, created_at = now();`)).toBe(true);
  });
});

describe('quality ratings migration: brand identity and fibres', () => {
  const aliasBlock = code.slice(code.indexOf('insert into public.brand_aliases'), code.indexOf('on conflict (alias_key) do nothing;'));
  const aliases = Array.from(aliasBlock.matchAll(/\('([a-z0-9]+)', '([a-z0-9]+)'\)/g), m => [m[1], m[2]] as [string, string]);
  const tierKeys = new Set(Object.values(BRAND_TIERS).flat().map(name => brandKeyRaw(name)));

  it('seeds the 31 reviewed aliases and nothing else', () => {
    expect(aliases).toHaveLength(31);
    expect(new Set(aliases.map(([alias]) => alias)).size).toBe(31);
    expect(code.match(/insert into public\.brand_aliases/g)).toHaveLength(1);
    expect(code).toMatch(/on conflict \(alias_key\) do nothing;/);
  });

  it('keeps every alias and target in the key alphabet, with no alias equal to its target', () => {
    for (const [alias, target] of aliases) {
      expect(alias).toMatch(/^[a-z0-9]{2,40}$/);
      expect(target).toMatch(/^[a-z0-9]{2,40}$/);
      expect(alias).not.toBe(target);
      // a key the normaliser would produce, so the alias can actually be hit
      expect(brandKeyRaw(alias)).toBe(alias);
    }
  });

  it('never points an alias at another alias', () => {
    const aliasKeys = new Set(aliases.map(([alias]) => alias));
    for (const [, target] of aliases) {
      expect(aliasKeys.has(target)).toBe(false);
    }
  });

  it('points every alias at a brand the value estimate already knows', () => {
    for (const [alias, target] of aliases) {
      expect({ alias, known: tierKeys.has(target) }).toEqual({ alias, known: true });
    }
  });

  // A bare insert leaves earlier contributions under the old spelling, counted by neither brand.
  const needsRebuild = (migration: string): boolean =>
    /insert into public\.brand_aliases/i.test(migration) && !/rebuild_brand_keys\(\)/.test(migration);

  it('is followed, in every migration that adds aliases, by the rebuild that re-files earlier ratings', () => {
    const dir = path.join(repo, 'supabase', 'migrations');
    const adding = fs.readdirSync(dir).filter(f => f.endsWith('.sql') && /insert into public\.brand_aliases/i.test(read('supabase', 'migrations', f)));
    expect(adding).toContain(MIGRATION);
    for (const file of adding) {
      expect({ file, rebuilds: !needsRebuild(read('supabase', 'migrations', file)) }).toEqual({ file, rebuilds: true });
    }
    // the ratings migration defines the rebuild itself, which is why it counts
    expect(code).toContain('create or replace function public.rebuild_brand_keys()');
  });

  it('would catch a later alias migration that forgets the rebuild', () => {
    const later = "insert into public.brand_aliases (alias_key, brand_key) values ('drmarten', 'drmartens') on conflict (alias_key) do nothing;";
    expect(needsRebuild(later)).toBe(true);
    expect(needsRebuild(`${later}\nselect public.rebuild_brand_keys();`)).toBe(false);
    expect(needsRebuild('select 1;')).toBe(false);
  });

  it('re-files item ratings by the item\'s brand, merges a member\'s duplicate brand ratings keeping the newer, and drops the stored numbers', () => {
    const body = squash(fn('rebuild_brand_keys'));
    expect(body).toContain('where public.resolve_brand_key(ci.brand) is distinct from i.brand_key');
    expect(body).toContain('contributed = t.contributed and s.nk is not null');
    expect(body).not.toMatch(/set[^;]*contributed_at = now\(\)/);        // the contribution itself did not change
    expect(body).toContain('if r.updated_at > (select x.updated_at from public.brand_ratings x where x.user_id = r.user_id and x.brand_key = r.nk) then');
    expect(body).toContain('delete from public.brand_stats where brand_key = any(keys); return n;');
  });

  it('folds accents with an explicit table, reads & as and, and keeps 40 characters', () => {
    const body = squash(fn('brand_key_raw'));
    expect(body).toContain("'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE'), 'þ', 'th'), 'Þ', 'TH')");
    expect(body).toContain("'&', 'and')), '[^a-z0-9]', '', 'g'), 40), '')");
    // clothing_items.brand has no length limit and this runs on every lookup: the work is bounded before it starts
    expect(body).toContain("translate(left(coalesce(p_text, ''), 256), ");
    expect(body).toContain("left(coalesce(p_text, ''), 256)");
    expect(fn('brand_key_raw')).toMatch(/immutable/);
    const [from, to] = Array.from(fn('brand_key_raw').matchAll(/'([^']{20,})'/g), m => m[1]);
    expect(Array.from(from)).toHaveLength(Array.from(to).length);        // translate() needs one letter for each
  });

  it('turns a brand string into a key, or null when it is too short', () => {
    const body = squash(fn('resolve_brand_key'));
    expect(body).toContain('case when k is null or char_length(k) < 2 then null else coalesce((select a.brand_key from public.brand_aliases a where a.alias_key = k), k) end');
  });

  const fibreBlock = code.slice(code.indexOf('insert into public.material_aliases'), code.indexOf('on conflict (alias) do nothing;'));
  const fibres = Array.from(fibreBlock.matchAll(/\('([^']+)',\s*'([^']+)'\)/g), m => [m[1], m[2]] as [string, string]);
  const fibreOf = (alias: string): string | undefined => fibres.find(([a]) => a === alias)?.[1];

  it('seeds fibre names in lower case, once each', () => {
    expect(fibres.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fibres.map(([alias]) => alias)).size).toBe(fibres.length);
    for (const [alias, fibre] of fibres) {
      expect(alias).toBe(alias.toLowerCase());
      expect(alias.length).toBeGreaterThanOrEqual(2);
      expect(alias.length).toBeLessThanOrEqual(40);
      expect(fibre).toMatch(/^[a-z]{3,20}$/);
    }
    expect(code).toMatch(/on conflict \(alias\) do nothing;/);
  });

  it('files imitation leather under polyurethane, never under leather', () => {
    for (const phrase of ['vegan leather', 'faux leather', 'pleather', 'synthetic leather', 'pu leather']) {
      expect(fibreOf(phrase)).toBe('polyurethane');
    }
    expect(fibreOf('leather')).toBe('leather');
    expect(fibreOf('suede')).toBe('suede');
  });

  it('strips only qualifiers that do not change what the material is', () => {
    const body = fn('canonical_fibre');
    expect(body).toContain("'^(organic|recycled|regenerated|virgin|egyptian|supima)\\s+'");
    const stripped = body.match(/\^\(([^)]*)\)/)![1].split('|');
    expect(stripped).not.toContain('vegan');
    expect(stripped).not.toContain('faux');
    expect(body).toContain("'other'");
  });

  it('reads a materials list defensively', () => {
    const body = squash(fn('primary_material_key'));
    expect(body).toContain("if p_materials is null or jsonb_typeof(p_materials) <> 'array' or jsonb_array_length(p_materials) > 20 then return null;");
    expect(body).toContain("if tier not in ('primary', 'secondary', 'upper') then continue;");
    expect(body).toContain("(e ->> 'percentage') ~ '^[0-9]{1,3}(\\.[0-9]+)?$'");
  });
});

describe('quality ratings migration: the same words as the app', () => {
  const sameAll = (found: string[][], expected: readonly string[]): void => {
    expect(found.length).toBeGreaterThan(0);
    for (const one of found) {
      expect(one).toEqual([...expected]);
    }
  };
  const arrays = (re: RegExp): string[][] => Array.from(code.matchAll(re), m => list(m[1]));

  it('uses the touch, comfort and holding-up descriptors of ratingVocabulary.ts, in the checks and in the function', () => {
    const touch = arrays(/\b\w*touch_tags <@ array\[([^\]]*)\]/g);
    const comfort = arrays(/\b\w*comfort_tags <@ array\[([^\]]*)\]/g);
    const holds = arrays(/\b(?:holds_up_tags|v_holds_tags) <@ array\[([^\]]*)\]/g);
    expect(touch).toHaveLength(2);
    expect(comfort).toHaveLength(2);
    expect(holds).toHaveLength(2);
    sameAll(touch, TOUCH_TAGS);
    sameAll(comfort, COMFORT_TAGS);
    sameAll(holds, HOLDS_UP_TAGS);
  });

  it('uses the fit, buy-again and report-reason lists of ratingVocabulary.ts, in the checks and in the functions', () => {
    const fit = arrays(/\bfit in \(([^)]*)\)/g).concat(arrays(/p_fit not in \(([^)]*)\)/g));
    const again = arrays(/\bwould_buy_again in \(([^)]*)\)/g).concat(arrays(/p_would_buy_again not in \(([^)]*)\)/g));
    const reasons = arrays(/\breason in \(([^)]*)\)/g).concat(arrays(/p_reason not in \(([^)]*)\)/g));
    expect(fit).toHaveLength(2);
    expect(again).toHaveLength(2);
    expect(reasons).toHaveLength(2);
    sameAll(fit, FIT_VERDICTS);
    sameAll(again, BUY_AGAIN);
    sameAll(reasons, INSIGHT_REPORT_REASONS);
  });

  it('caps each descriptor group and the note at the numbers the app uses', () => {
    const caps = Array.from(code.matchAll(/cardinality\((?:v_)?\w+\) (<=|>) (\d+)/g), m => [m[1], Number(m[2])]);
    expect(caps).toHaveLength(6);
    for (const [, n] of caps) {
      expect(n).toBe(MAX_TAGS_PER_GROUP);
    }
    expect(code).toContain(`note is null or char_length(note) <= ${NOTE_MAX_LENGTH}`);
    expect(code).toContain(`left(v_note, ${NOTE_MAX_LENGTH})`);
  });

  it('asks for the wording version the app carries', () => {
    const seeded = read('supabase', 'migrations', CONSENTS_MIGRATION).match(/values \('share_ratings', true, '([^']+)', true,/)![1];
    expect(seeded).toBe(RATINGS_POLICY_VERSION);
    // the scenario script agrees with the app, so its "ALL PASSED" speaks for the shipped wording
    const scenarios = read('supabase', 'checks', 'quality_ratings_scenarios.sql');
    expect(scenarios).toContain(`set_consent('share_ratings', true, '${RATINGS_POLICY_VERSION}', true, false)`);
    expect(scenarios).toContain(`update public.consent_purposes set current_version = '${RATINGS_POLICY_VERSION}' where purpose = 'share_ratings';`);
  });
});

describe('quality ratings migration: scope', () => {
  it('can run twice', () => {
    expect(code.match(/create or replace function/g)).toHaveLength(24);
    expect(code.match(/create or replace trigger/g)).toHaveLength(2);
    expect(code.match(/create index if not exists/g)).toHaveLength(3);
    expect(code).not.toMatch(/create (unique )?index (?!if not exists)/);
    for (const seed of code.matchAll(/insert into public\.(rating_settings|brand_aliases|material_aliases)\b[^;]*;/g)) {
      expect(seed[0]).toMatch(/on conflict \([a-z_]+\) do nothing;$/);
    }
    expect(sql).toMatch(/Safe to run twice/);
  });

  it('drops only the two policies it re-creates, and nothing else', () => {
    const drops = (code.match(/\bdrop\b[^;]*;/gi) ?? []).map(squash);
    expect(drops).toEqual([
      'drop policy if exists "own item ratings" on public.item_ratings;',
      'drop policy if exists "own brand ratings" on public.brand_ratings;',
    ]);
    for (const kind of ['table', 'function', 'column', 'constraint', 'trigger', 'view', 'index', 'schema', 'type']) {
      expect(code).not.toMatch(new RegExp(`\\bdrop ${kind}\\b`, 'i'));
    }
  });

  it('adds nothing to the wardrobe table and watches it with no trigger', () => {
    expect(code).not.toMatch(/alter table (public\.)?clothing_items/i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+(public\.)?clothing_items\b/i);
    expect(code).not.toMatch(/(trigger|policy|index|constraint)[^;]*\bon (public\.)?clothing_items\b/i);
    expect(code).not.toMatch(/\bcreate (view|type|extension|schema)\b/i);
  });

  it('only reads the account table, and never an email address', () => {
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+auth\./i);
    expect(code).not.toMatch(/\bemail\b/i);                  // email_confirmed_at is the only thing it asks of a member
    expect(code.match(/\bauth\.users\b/g)!.length).toBeGreaterThan(4);
    expect(code).toContain('u.email_confirmed_at is not null');
  });

  it('does not truncate, builds no dynamic SQL, and carries no secret or key', () => {
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(code).not.toMatch(/\bexecute\s+(format|')/i);
    expect(sql).not.toMatch(/api[_-]?key|secret|token|password/i);
  });

  it('is in the version range reserved for this feature', () => {
    expect(MIGRATION.slice(0, 14) >= '20261014000000' && MIGRATION.slice(0, 14) <= '20261014000399').toBe(true);
  });
});

describe('supabase/checks: the SQL scripts that prove the behaviour', () => {
  const checks = (name: string): string => read('supabase', 'checks', name);
  const FILES = [
    'quality_ratings_scenarios.sql', 'quality_ratings_audit.sql', 'quality_ratings_leak_check.sql',
    'brand_key_parity.sql', 'local_stub.sql', 'populated_seed.sql', 'populated_cleanup.sql',
  ];

  it.each(FILES)('has %s', name => {
    expect(fs.existsSync(path.join(repo, 'supabase', 'checks', name))).toBe(true);
    expect(checks(name).trim().length).toBeGreaterThan(0);
  });

  it('keeps the parity script in step with the shared brand key fixture', () => {
    const fixture = JSON.parse(read('__tests__', 'fixtures', 'brandKeys.json')) as [string, string | null][];
    const unescape = (s: string): string => s.replace(/''/g, "'");
    const rows = Array.from(
      checks('brand_key_parity.sql').matchAll(/^\s*\('((?:[^']|'')*)', (null|'(?:[^']|'')*')\),?\s*$/gm),
      m => [unescape(m[1]), m[2] === 'null' ? null : unescape(m[2].slice(1, -1))] as [string, string | null],
    );
    expect(rows).toHaveLength(fixture.length);
    expect(rows).toEqual(fixture);
    expect(checks('brand_key_parity.sql')).toContain('count(*) filter (where public.brand_key_raw(input) is distinct from expected) as mismatches');
  });

  it('runs the scenarios in one transaction that is rolled back, with 107 uniquely named checks and one final result set', () => {
    const script = stripComments(checks('quality_ratings_scenarios.sql'));
    expect(script.trim().startsWith('begin;')).toBe(true);
    expect(script.trim().endsWith('rollback;')).toBe(true);
    const names = Array.from(script.matchAll(/select pg_temp\.check_\('((?:[^']|'')*)'/g), m => m[1]);
    expect(names).toHaveLength(107);
    expect(new Set(names).size).toBe(107);
    expect(script).toMatch(/union all select 'ALL PASSED', bool_and\(ok\), 1 from res/);
    expect(script).not.toMatch(/\bcommit\b/i);
    expect(script).not.toMatch(/\btruncate\b/i);
  });

  it('checks the keys of the published payload against a list, in the insight and the crowd scenarios', () => {
    const script = checks('quality_ratings_scenarios.sql');
    for (const name of ['insight: output has no ids, notes, names or exact counts', 'crowd: output has no ids, notes, names or exact counts']) {
      const start = script.indexOf(`pg_temp.check_('${name}'`);
      expect(start).toBeGreaterThan(-1);
      expect(script.slice(start, script.indexOf(');\n', start))).toContain('pg_temp.payload_keys_ok(j)');
    }
    expect(script).toContain("array['status', 'n_bucket', 'score', 'item', 'brand', 'traits', 'slices', 'as_of']");
    expect(script).toContain("array['feel', 'comfort', 'holds_up', 'would_buy_again_pct', 'fit']");
    expect(script).toContain("array['runs_small', 'true_to_size', 'runs_large']");
    expect(script).toContain("array['quality', 'fit_consistency', 'value']");
    expect(script).toContain("array['group', 'tag', 'pct']");
    expect(script).toContain("array['kind', 'key', 'n_bucket', 'overall', 'feel', 'holds_up']");
  });

  it('keeps the scenarios independent of real data: fixture ids, brands no member has, thresholds set by the script', () => {
    const script = checks('quality_ratings_scenarios.sql');
    expect(script).not.toMatch(/'Zara'/i);
    expect(script).toMatch(/update public\.rating_settings set\s+insights_enabled = true, k_brand = 5, k_slice = 10, k_chip = 5, min_old_voters = 3/);
    expect(script).toContain("where user_id::text like 'a0000000-%'");
    expect(script).toContain("brand_key like 'zz%'");
  });

  it('checks that a friend can no longer read the table, which is why the gated drop must be applied first', () => {
    const script = checks('quality_ratings_scenarios.sql');
    expect(script).toContain("friends: an accepted friend reads no row of the other person''s closet through the table");
    expect(script).toContain('public.get_friend_closet(pg_temp.uid(1))');
  });

  it('stands in for the friend policy under the same name the live table carries', () => {
    const live = read('supabase', 'migrations', '20261007000100_wishlist_stays_private.sql');
    const name = live.match(/create policy "(Friends can view each other's wardrobe)"\s+on public\.clothing_items/)![1];
    expect(checks('local_stub.sql')).toContain(`create policy "${name}" on public.clothing_items`);
    expect(checks('local_stub.sql')).toContain('create function public.get_friend_closet(p_friend_id uuid)');
    expect(checks('quality_ratings_audit.sql')).toContain(`policyname = 'Friends can view each other''s wardrobe'`);
  });

  it('audits every function and table the two ratings migrations create', () => {
    const audit = checks('quality_ratings_audit.sql');
    const inList = (after: string): string[] => {
      const start = audit.indexOf(after);
      expect(start).toBeGreaterThan(-1);
      const open = audit.indexOf('(', audit.indexOf(' in ', start));
      return list(audit.slice(open, audit.indexOf(')', open)));
    };
    const audited = inList('p.proname');
    const created = [
      ...Array.from(stripComments(read('supabase', 'migrations', CONSENTS_MIGRATION)).matchAll(/create or replace function public\.(\w+)\(/g), m => m[1]),
      ...functions,
    ];
    expect([...audited].sort()).toEqual([...created].sort());
    const auditedTables = inList('c.relname');
    const createdTables = [
      ...Array.from(stripComments(read('supabase', 'migrations', CONSENTS_MIGRATION)).matchAll(/create table if not exists public\.(\w+)/g), m => m[1]),
      ...TABLES,
    ];
    expect([...auditedTables].sort()).toEqual([...createdTables].sort());
  });

  it('seeds and removes the populated contributors under their own marker, away from the scenario fixtures', () => {
    const seed = checks('populated_seed.sql');
    const cleanup = checks('populated_cleanup.sql');
    expect(seed).toContain('@populated.test');
    expect(seed).not.toMatch(/a0000000|b0000000|@example\.test/);
    expect(seed).toContain("'Zara'");
    expect(cleanup).toContain("delete from auth.users where email like '%@populated.test';");
    expect(stripComments(cleanup).match(/\bdelete from\b/g)).toHaveLength(2);
    expect(checks('quality_ratings_leak_check.sql')).toContain("email like '%@populated.test'");
    expect(checks('quality_ratings_leak_check.sql')).toContain("email like '%@example.test'");
  });
});

describe('supabase/audit.sql', () => {
  const audit = read('supabase', 'audit.sql');
  const owned = audit.slice(audit.indexOf('user_owned_tables as ('), audit.indexOf(') as tablename'));
  const names = list(stripComments(owned));

  it('lists the three ratings tables a member reads through a policy', () => {
    for (const table of ['item_ratings', 'brand_ratings', 'user_consents']) {
      expect(names).toContain(table);
    }
  });

  it('keeps the tables it listed before', () => {
    for (const table of ['clothing_items', 'outfits', 'outfit_history', 'appointments', 'stylist_clients', 'stylist_profiles', 'recommendations']) {
      expect(names).toContain(table);
    }
    expect(names).toHaveLength(10);
  });

  it('leaves out tables that have row-level security and no policy by design', () => {
    expect(names.filter(n => n.startsWith('swap_'))).toEqual([]);
    for (const table of ['rating_settings', 'rating_suppressions', 'brand_aliases', 'material_aliases', 'brand_stats', 'insight_reports', 'consent_purposes', 'usage_counters']) {
      expect(names).not.toContain(table);
    }
  });

  it('has a policy that names the signed-in member on every table it lists', () => {
    const rules = squash(code + stripComments(read('supabase', 'migrations', CONSENTS_MIGRATION)));
    expect(rules).toContain('create policy "own item ratings" on public.item_ratings for select to authenticated using (auth.uid() = user_id);');
    expect(rules).toContain('create policy "own brand ratings" on public.brand_ratings for select to authenticated using (auth.uid() = user_id);');
    expect(rules).toContain('create policy "own consents" on public.user_consents for select to authenticated using (auth.uid() = user_id);');
  });
});
