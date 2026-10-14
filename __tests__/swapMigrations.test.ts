/**
 * Reads the swap migrations as text and checks the rules every one of them must keep. The
 * behaviour itself is checked by the BEGIN ... ROLLBACK scripts in supabase/tests/swaps.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const heldDir = path.join(__dirname, '..', 'supabase', 'held');
const FILES = [
  '20261015000100_swap_foundation.sql',
  '20261015000200_swap_listings.sql',
  '20261015000300_swap_lifecycle.sql',
  '20261015000400_swap_moderation.sql',
  '20261015000500_swap_community.sql',
];
const PREREQUISITE = '20261015000000_styling_recommendations_if_missing.sql';
const sqls = FILES.map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
const all = sqls.join('\n');

const TABLES = ['swap_config', 'swap_meta', 'swap_members', 'swap_listings', 'swaps', 'swap_items', 'swap_messages', 'swap_rate_counters', 'swap_blocked_terms', 'swap_photo_gc'];

const CLIENT_FUNCTIONS = [
  'accept_swap_terms', 'block_swap_member', 'browse_swap_listings', 'cancel_swap', 'export_my_swap_data', 'get_swap',
  'get_swap_badge', 'get_swap_listing', 'get_swap_settings', 'join_swap_community', 'leave_swap_community',
  'list_my_swap_listings', 'list_my_swaps', 'list_swap_blocks', 'narrow_swap_listing', 'propose_swap',
  'renew_swap_listing', 'report_swap_content', 'respond_to_swap', 'send_swap_message', 'swap_ack_photo',
  'swap_complete_my_side', 'unblock_swap_member', 'update_swap_listing', 'withdraw_swap_listing',
];
const SERVICE_FUNCTIONS = [
  'swap_admin_hold_listing', 'swap_admin_release_listing', 'swap_admin_remove_listing', 'swap_admin_suspend', 'swap_admin_unsuspend',
  'swap_known_photo_paths', 'swap_publish_commit', 'swap_publish_precheck', 'swap_report_backlog', 'swap_send_report_digest',
  'swap_set_community_enabled', 'swap_set_enabled',
];

const definedFunctions = [...all.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);

/** Function names listed in `foreach f in array array[ ... ]` blocks whose following lines grant to `role`. */
const grantedTo = (role: string): string[] => {
  const out: string[] = [];
  for (const block of all.matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)) {
    if (block[2].includes(`to ${role}`)) {
      out.push(...[...block[1].matchAll(/'public\.(\w+)\(/g)].map(m => m[1]));
    }
  }
  // single statements
  for (const m of all.matchAll(/grant execute on function public\.(\w+)\(.*?\) to (\w+);/g)) {
    if (m[2] === role) out.push(m[1]);
  }
  return out;
};

describe('swap migrations', () => {
  it('exist, in order', () => {
    expect([...FILES].sort()).toEqual(FILES);
    for (const f of FILES) expect(fs.existsSync(path.join(dir, f))).toBe(true);
  });

  it('turn row level security on and close every swap table to app users', () => {
    for (const t of TABLES) expect(all).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
    const loop = all.match(/foreach t in array array\[([^\]]+)\]/)![1];
    for (const t of TABLES) expect(loop).toContain(`'${t}'`);
    expect(all).toContain("execute format('alter table public.%I enable row level security', t)");
    expect(all).toContain("execute format('revoke all on public.%I from public, anon, authenticated', t)");
  });

  it('give app users no policy on a swap table', () => {
    for (const m of all.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) {
      expect(['public.user_blocks', 'storage.objects']).toContain(m[2]);
    }
    expect(all).not.toMatch(/create policy[^;]*swap_(listings|items|messages|members)/);
  });

  it('only ever add a policy on storage.objects for the swap-photos viewer rule', () => {
    const storage = [...all.matchAll(/create policy "([^"]+)"\s+on storage\.objects[\s\S]*?;/g)];
    expect(storage).toHaveLength(1);
    expect(storage[0][1]).toBe('swap photos: viewers');
    expect(storage[0][0]).toContain("bucket_id = 'swap-photos' and public.can_view_swap_photo(name)");
    expect(storage[0][0]).toContain('for select to authenticated');
  });

  it('create the bucket private, small, and JPEG or PNG only', () => {
    expect(all).toContain("values ('swap-photos', 'swap-photos', false, 5242880, array['image/jpeg', 'image/png'])");
    expect(all).toContain('set public = false');
  });

  it('grant exactly the client functions to authenticated, and no others', () => {
    expect(grantedTo('authenticated').sort()).toEqual([...CLIENT_FUNCTIONS, 'can_view_swap_photo'].sort());
  });

  it('grant the service functions to service_role only', () => {
    expect(grantedTo('service_role').sort()).toEqual([...SERVICE_FUNCTIONS, 'swap_janitor'].sort());
  });

  it('revoke from anon, public and clients every function that is not a client function', () => {
    const clientish = new Set([...CLIENT_FUNCTIONS, 'can_view_swap_photo']);
    for (const name of definedFunctions) {
      if (clientish.has(name)) {
        expect(all).toMatch(new RegExp(`'public\\.${name}\\(|revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`));
      } else {
        expect(all).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated|'public\\.${name}\\(`));
      }
    }
  });

  it('pin search_path on every function that runs as its owner', () => {
    for (const chunk of all.split('create or replace function ').slice(1)) {
      const head = chunk.slice(0, chunk.indexOf('$$'));
      if (/security definer/.test(head)) expect(head).toMatch(/set search_path = public/);
    }
  });

  it('leave the live friend and account functions alone', () => {
    for (const name of ['delete_user_account', 'block_user', 'report_user', 'get_friend_closet', 'find_user_by_email', 'is_blocked_between', 'friend_display_name']) {
      expect(all).not.toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
    }
  });

  it('cascade every user foreign key, except the two swap participants, which are set null', () => {
    const refs = [...all.matchAll(/(\w+)\s+uuid[^\n]*references auth\.users\(id\)([^\n,]*)/g)];
    expect(refs.length).toBeGreaterThan(5);
    for (const r of refs) {
      if (r[1] === 'proposer_id' || r[1] === 'recipient_id') expect(r[2]).toContain('on delete set null');
      else expect(r[2]).toContain('on delete cascade');
    }
    expect(refs.filter(r => r[2].includes('set null'))).toHaveLength(2);
  });

  it('never put an email, a user id or a private column in a client-visible result', () => {
    const forbidden = ['email', 'user_id', 'owner_id uuid', 'proposer_id uuid', 'recipient_id uuid', 'cost', 'retail_cost', 'notes text', 'tag_text', 'estimated_value', 'wear_count', 'purchase_date'];
    for (const m of all.matchAll(/returns table \(([\s\S]*?)\)\s*language/g)) {
      for (const word of forbidden) expect(m[1]).not.toContain(word);
    }
  });

  it('keep the old report_user lists, so older builds are untouched', () => {
    expect(all).toMatch(/context in \('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat'\)/);
    expect(all).toMatch(/reason in \('spam', 'harassment', 'inappropriate', 'impersonation',\s+'scam', 'not_as_described', 'unsafe', 'other'\)/);
  });

  it('reach the database only through functions: no raw table SQL in client-callable code', () => {
    expect(all).not.toMatch(/grant (select|insert|update|delete)[^;]* on public\.(swaps?|swap_\w+) to (anon|authenticated|public)/);
  });

  it('keep two decisions out of the folder `supabase db push` applies until the owner releases them: the policy drop and the bucket flag', () => {
    const present = fs.readdirSync(dir);
    // db push applies every pending file and cannot skip one, so anything waiting for the owner lives in supabase/held.
    // The one way in is the release procedure (4.1): the same name behind a 14 digit release-day version, and the file gone
    // from supabase/held. The policy drop is Q0's file (quality-ratings.md 4.3); this test only reads it.
    const RELEASED = /^\d{14}_(drop_legacy_friend_wardrobe_policy|wardrobe_images_private)\.sql$/;
    expect(present.filter(f => /drop_legacy_friend_wardrobe_policy|wardrobe_images_private/.test(f) && !RELEASED.test(f))).toEqual([]);
    expect(present.filter(f => /blocked_terms/.test(f))).toEqual([]);
    const statements = (name: string) => {
      const held = path.join(heldDir, `${name}.sql`);
      const released = present.filter(f => f.endsWith(`_${name}.sql`));
      expect([fs.existsSync(held), ...released].filter(Boolean)).toHaveLength(1);    // exactly one copy, held or released
      return fs.readFileSync(fs.existsSync(held) ? held : path.join(dir, released[0]), 'utf8')
        .split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();
    };
    expect(statements('drop_legacy_friend_wardrobe_policy')).toBe(`drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;`);
    expect(statements('wardrobe_images_private')).toBe(
      "insert into storage.buckets (id, name, public) values ('wardrobe-images', 'wardrobe-images', false) on conflict (id) do update set public = false;");
  });

  it('do not load the objectionable-term list: the owner supplies it later, as a new migration or dashboard SQL', () => {
    expect(all).not.toMatch(/insert into public\.swap_blocked_terms/);
  });

  it('create the one table delete_user_account() needs, only when it is missing, with row level security', () => {
    const sql = fs.readFileSync(path.join(dir, PREREQUISITE), 'utf8');
    expect(sql).toContain("if to_regclass('public.styling_recommendations') is null then");
    expect(sql).toContain('alter table public.styling_recommendations enable row level security');
    expect(sql).toMatch(/create table public\.styling_recommendations/);
    expect(sql).not.toMatch(/create table if not exists/);   // never touches the live table
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(PREREQUISITE < FILES[0]).toBe(true);
  });

  it('fold text before any rule reads it, and keep terms folded', () => {
    expect(all).toContain('t text := public.swap_fold_text(p_text);');
    expect(all).toContain('and term = public.swap_fold_text(term)');
    expect(all).toContain('normalize(coalesce(p_text');
  });

  it('keep a hold in place: only the rack expires, holds record who made them, and every exit is explicit', () => {
    expect(all).toMatch(/set status = 'expired', status_changed_at = now\(\)\s+where status = 'active' and expires_at <= now\(\)/);
    expect(all).not.toMatch(/where status in \('active', 'held'\) and expires_at <= now\(\)/);
    expect(all).toContain("held_by            text check (held_by is null or held_by in ('reports', 'admin', 'suspension'))");
    expect(all).toContain("where owner_id = p_user and status = 'held' and held_by = 'suspension'");
    expect(all).toContain("perform public.swap_raise('listing_held', '42501')");
    expect(all).toContain("(status = 'active' or (status = 'held' and tg_op = 'DELETE'))");   // the wishlist round trip keeps a hold
    expect(all).toContain('create or replace function public.swap_admin_remove_listing');
  });

  it('check a piece in one place, and use that place both before and after the photo copy', () => {
    const listings = sqls[1];
    expect(listings).toContain('create or replace function public.swap_validate_item');
    expect((listings.match(/public\.swap_validate_item\(p_user, p_item, p_audience, p_note\)/g) ?? [])).toHaveLength(2);
    const commit = listings.slice(listings.indexOf('create or replace function public.swap_publish_commit'));
    expect(commit.indexOf('for share')).toBeGreaterThan(-1);
    expect(commit.indexOf('for share')).toBeLessThan(commit.indexOf('swap_validate_item'));
  });

  it('let a swap be cancelled by whoever has not tapped, and push the expiry out on the first tap', () => {
    const lifecycle = sqls[2];
    expect(lifecycle).toContain("(s.status = 'accepted' and not me_done)");
    expect(lifecycle).toContain("expires_at = greatest(expires_at, now() + interval '15 days')");
    expect(lifecycle).not.toMatch(/proposer_done_at is null and s\.recipient_done_at is null\) then/);
  });

  it('never filter a blocked pair out of the inbox, the count or the badge', () => {
    expect(sqls[1]).not.toMatch(/swap_pair_state\(s\.proposer_id, s\.recipient_id\) <> 'blocked'/);
    expect(sqls[2]).not.toMatch(/swap_pair_state\(s\.proposer_id, s\.recipient_id\) <> 'blocked'/);
    const getSwap = sqls[2].slice(sqls[2].indexOf('create or replace function public.get_swap('), sqls[2].indexOf('create or replace function public.respond_to_swap'));
    expect(getSwap).not.toMatch(/if not found or public\.swap_pair_state/);
    expect(getSwap).toContain("blocked := (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked');");
  });
});

describe('swap SQL scripts', () => {
  const root = path.join(__dirname, '..');
  const scenarioDir = path.join(root, 'supabase', 'tests', 'swaps');
  const runnerPath = path.join(root, 'scripts', 'run-swap-sql-tests.sh');
  const racePath = path.join(scenarioDir, 'race.sh');
  const runner = fs.readFileSync(runnerPath, 'utf8');
  const race = fs.readFileSync(racePath, 'utf8');
  const sqlFiles = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.sql'));

  it('are executable', () => {
    for (const f of [runnerPath, racePath]) {
      expect(() => fs.accessSync(f, fs.constants.X_OK)).not.toThrow();
    }
  });

  it('run every scenario by default, except the one that needs the legacy friends policy', () => {
    const scenarios = sqlFiles.filter(f => /^s\d+_/.test(f)).map(f => f.replace(/\.sql$/, '')).sort();
    const listed = runner.match(/scenarios=\((s\d[^)]*)\)/)![1].trim().split(/\s+/);
    expect(listed).toEqual(scenarios.filter(s => s !== 's7_legacy_policy'));
  });

  it('end every run in a rollback, and never commit anywhere but the race script', () => {
    expect(fs.readFileSync(path.join(scenarioDir, '99_tail.sql'), 'utf8').trim().endsWith('rollback;')).toBe(true);
    expect(runner).toContain('echo "begin;"');
    for (const f of sqlFiles) {
      expect(fs.readFileSync(path.join(scenarioDir, f), 'utf8')).not.toMatch(/^\s*commit\s*;/im);
    }
  });

  describe('race.sh, which commits its fixtures, only runs against a local database', () => {
    const run = (url?: string) => spawnSync('bash', [racePath], {
      env: url === undefined ? { PATH: process.env.PATH } : { PATH: process.env.PATH, SWAP_TEST_DB_URL: url },
      encoding: 'utf8',
    });

    it('refuses a remote host, wherever "localhost" or "127.0.0.1" also appears in the text', () => {
      for (const url of [
        'postgresql://postgres:pw@db.invalid:5432/postgres',
        'postgresql://postgres:localhost@db.invalid/postgres',
        'postgresql://postgres:pw@db.invalid/127.0.0.1',
        'postgresql://postgres@db.invalid/postgres?application_name=127.0.0.1',
        'postgresql://postgres@localhost.invalid/postgres',
        'postgresql://postgres@127.0.0.1.invalid/postgres',
      ]) {
        const r = run(url);
        expect({ url, status: r.status, refused: /refusing to run/.test(r.stderr) }).toEqual({ url, status: 1, refused: true });
      }
    });

    it('refuses a URL that carries its own host, and anything that is not a URL', () => {
      for (const url of [
        'postgresql://postgres@127.0.0.1/postgres?host=db.invalid',
        'postgresql://postgres@127.0.0.1/postgres?sslmode=disable&hostaddr=10.0.0.5',
        'postgresql://postgres@127.0.0.1/postgres?service=live',
        'postgresql://postgres@127.0.0.1/postgres?%68ost=db.invalid',
        'postgresql://postgres@127.0.0.1/postgres?%73ervice=live',
        'postgresql://postgres@127.0.0.1/postgres?%68ostaddr=10.0.0.5',
        'postgresql://postgres@127.0.0.1:1,db.invalid:5432/postgres',
        'postgresql://postgres@127.0.0.1@db.invalid/postgres',
        'postgresql://postgres@127.0.0.1/postgres?sslmode=disable&options=-c%20search_path%3Dx',
        'host=db.invalid dbname=127.0.0.1',
      ]) {
        const r = run(url);
        expect({ url, status: r.status, refused: /refusing to run/.test(r.stderr) }).toEqual({ url, status: 1, refused: true });
      }
    });

    it('refuses to run without a URL', () => {
      const r = run();
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('SWAP_TEST_DB_URL');
    });

    it('lets local addresses through its check (the check alone is run, nothing connects)', () => {
      const start = race.indexOf('case "$SWAP_TEST_DB_URL" in postgres://*');
      const end = race.indexOf('unset PGHOSTADDR');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const guard = race.slice(start, end);
      for (const url of [
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        'postgresql://postgres:p%40ss@127.0.0.1:54322/postgres',
        'postgres://postgres@localhost/postgres?sslmode=disable',
        'postgresql://postgres@127.0.0.1:54322/postgres?sslmode=disable&connect_timeout=2',
        'postgresql://postgres@127.0.0.1:54322/postgres?application_name=ghost',
        'postgresql://postgres@[::1]:5432/postgres',
      ]) {
        const r = spawnSync('bash', ['-c', `set -eu\n${guard}\necho passed`], {
          env: { PATH: process.env.PATH, SWAP_TEST_DB_URL: url }, encoding: 'utf8',
        });
        expect({ url, out: r.stdout.trim(), err: r.stderr.trim() }).toEqual({ url, out: 'passed', err: '' });
      }
    });
  });
});
