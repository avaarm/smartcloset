/**
 * Reads the professional-accounts migrations 1 to 5 (the lockdown of the legacy tables, the foundation, the upkeep, the
 * profile and invite functions, the connection functions) as text and checks the rules every one of them must keep. The
 * behaviour itself is checked by the BEGIN ... ROLLBACK scripts in supabase/tests/pro (p1 and p8); the files of the
 * sharing, work and moderation streams have tests of their own.
 */
import fs from 'fs';
import path from 'path';
import { proFile, proMigrationFiles, readPro, type ProMigration } from '../supabase/tests/pro/migrationFiles';

const root = path.join(__dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');
const heldDir = path.join(root, 'supabase', 'held');
// Found by name, not by digits: the release renames the pro files (pro-accounts.md 3.1, 11.1 P3).
const NAMES: ProMigration[] = ['lockdown_legacy_tables', 'foundation', 'upkeep', 'profiles_invites', 'connections'];
const FILES = NAMES.map(n => proFile(n));
const [LOCKDOWN, FOUNDATION, UPKEEP, PROFILES, CONNECTIONS] = NAMES.map(n => readPro(n));
const all = [FOUNDATION, UPKEEP, PROFILES, CONNECTIONS].join('\n');
const everything = [LOCKDOWN, all].join('\n');

const LEGACY = ['stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations',
  'message_threads', 'messages', 'booking_requests', 'stylist_reviews'];
const TABLES = ['pro_config', 'pro_meta', 'pro_members', 'pro_stylists', 'pro_invites', 'pro_connections', 'pro_grants',
  'pro_grant_items', 'pro_grant_events', 'pro_closet_views', 'pro_recommendations', 'pro_recommendation_items',
  'pro_appointments', 'pro_messages', 'pro_rate_counters'];
// 4.6, groups 1 to 4: the functions of files 4 and 5 that the app calls.
const CLIENT_FUNCTIONS = ['get_pro_status', 'get_pro_badge', 'accept_pro_terms', 'get_my_stylist_profile', 'save_stylist_profile',
  'set_stylist_accepting', 'close_stylist_profile', 'create_pro_invite', 'list_my_pro_invites', 'revoke_pro_invite',
  'preview_pro_invite', 'redeem_pro_invite', 'list_pro_connections', 'get_pro_connection', 'end_pro_connection', 'set_pro_alias'];
// 4.1: internal helpers and triggers of files 2 and 3.
const INTERNAL_FUNCTIONS = ['pro_raise', 'pro_cfg', 'pro_limit', 'pro_rate_check', 'pro_text_ok', 'pro_require_text', 'pro_gate',
  'pro_new_code', 'pro_norm_code', 'pro_clean_name', 'pro_name_ok', 'pro_clean_list', 'pro_clean_materials', 'pro_clean_season',
  'pro_photo_path', 'pro_lock_users', 'pro_invites_held', 'pro_report_is_qualified', 'pro_can_read_closet', 'pro_end_connection',
  'pro_end_between', 'pro_shell_connection', 'pro_on_block', 'pro_on_member_left', 'pro_refresh'];
const SERVICE_FUNCTIONS = ['pro_janitor'];

const definedFunctions = [...all.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);

/** Function names listed in `foreach f in array array[ ... ] loop ... end loop;` blocks whose body grants to `role`
 *  (or, with role null, revokes without granting). */
const listed = (sql: string, role: string | null): string[] => {
  const out: string[] = [];
  for (const block of sql.matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)) {
    const grants = /grant execute on function %s to (\w+)/.exec(block[2]);
    if ((role === null && !grants) || (role !== null && grants && grants[1] === role)) {
      out.push(...[...block[1].matchAll(/'public\.(\w+)\(/g)].map(m => m[1]));
    }
  }
  return out;
};

/** The statements of a SQL text with the comments taken out. */
const code = (sql: string): string => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

/** A trimmed copy of the scanner of migrationSafeUpdate.test.ts: an UPDATE or DELETE without a WHERE of its own. */
const topLevel = (text: string): string => {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
};
const bareWrites = (sql: string): string[] => {
  const text = sql.replace(/--[^\n]*/g, '');
  const found: string[] = [];
  const start = /\b(update\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?\w+)?\s+set\b|delete\s+from\s+[\w."]+)/gi;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    if (/\bdo\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    const end = text.indexOf(';', m.index);
    const statement = text.slice(m.index, end === -1 ? undefined : end);
    if (!/\bwhere\b/i.test(topLevel(statement))) found.push(statement.replace(/\s+/g, ' ').trim().slice(0, 90));
  }
  return found;
};

describe('pro migrations 1 to 5', () => {
  it('exist, in order', () => {
    expect([...FILES].sort()).toEqual(FILES);
    expect(proMigrationFiles().slice(0, 5)).toEqual(FILES);
    for (const f of FILES) expect(fs.existsSync(path.join(dir, f))).toBe(true);
  });

  it('keep to one concern each: the lockdown only revokes, and only on the nine legacy tables', () => {
    const body = code(LOCKDOWN);
    expect(body.startsWith('do $$')).toBe(true);
    for (const forbidden of ['create ', 'drop ', 'alter ', 'insert ', 'update ', 'delete ', 'truncate ', 'grant ', 'policy']) {
      expect(body).not.toContain(forbidden);
    }
    const list = LOCKDOWN.match(/foreach t in array array\[([^\]]+)\]/)![1];
    expect([...list.matchAll(/'(\w+)'/g)].map(m => m[1])).toEqual(LEGACY);
    expect(LOCKDOWN).toContain("if to_regclass('public.' || t) is not null then");
    expect(LOCKDOWN).toContain("execute format('revoke all on public.%I from public, anon, authenticated', t)");
    expect(LOCKDOWN.match(/\bexecute\b/g)).toHaveLength(1);
  });

  it('turn row level security on and close all fifteen tables to app users, with no policy on any of them', () => {
    for (const t of TABLES) expect(FOUNDATION).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
    expect([...FOUNDATION.matchAll(/create table if not exists public\.(\w+)/g)]).toHaveLength(15);
    const loop = FOUNDATION.match(/foreach t in array array\[([^\]]+)\]/)![1];
    expect([...loop.matchAll(/'(\w+)'/g)].map(m => m[1])).toEqual(TABLES);
    expect(FOUNDATION).toContain("execute format('alter table public.%I enable row level security', t)");
    expect(FOUNDATION).toContain("execute format('revoke all on public.%I from public, anon, authenticated', t)");
    expect(FOUNDATION).toContain('revoke all on sequence public.pro_messages_id_seq from public, anon, authenticated');
    expect(FOUNDATION).toContain('revoke all on sequence public.pro_grant_events_id_seq from public, anon, authenticated');
    for (const m of everything.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) expect(m[2]).toBe('public.user_blocks');
    expect([...everything.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)]).toHaveLength(2);
    expect(everything).not.toMatch(/grant (select|insert|update|delete|all)[^;]* on (table )?public\.pro_\w+ to (anon|authenticated|public)/);
  });

  it('seed the off-switch off, and the versions and the account-age rule as written', () => {
    const seeds = FOUNDATION.match(/insert into public\.pro_config \(key, value\) values([\s\S]*?)on conflict \(key\) do nothing;/)![1];
    expect(seeds).toContain("('pro_enabled',           'false'::jsonb)");
    expect(seeds).toContain(`('stylist_terms_version', '"2026-10"'::jsonb)`);
    expect(seeds).toContain(`('client_terms_version',  '"2026-10"'::jsonb)`);
    expect(seeds).toContain(`('share_text_version',    '"2026-10"'::jsonb)`);
    expect(seeds).toContain("('min_account_age_hours', '48'::jsonb)");
    expect(seeds).not.toContain('directory_enabled');
    expect(seeds).not.toMatch(/'pro_enabled',\s+'true'/);
    expect(all).not.toMatch(/set value = 'true'/);                       // nothing here switches the feature on
    expect(FOUNDATION).toContain('insert into public.pro_meta (id) values (true) on conflict (id) do nothing;');
  });

  it('give no UPDATE or DELETE a missing WHERE, in any of the files or in the held purge', () => {
    for (const sql of [LOCKDOWN, FOUNDATION, UPKEEP, PROFILES, CONNECTIONS, fs.readFileSync(path.join(heldDir, 'purge_legacy_pro_tables.sql'), 'utf8')]) {
      expect(bareWrites(sql)).toEqual([]);
    }
    // the scanner cannot see inside dynamic SQL, so it is used for revokes and the row-security loop only
    for (const m of everything.matchAll(/execute format\('([^']*)'/g)) {
      expect(m[1]).toMatch(/^(revoke all on|alter table public\.%I enable row level security|grant execute on)/);
    }
    expect(everything).not.toMatch(/execute format\('(update|delete)/i);
  });

  it('write the janitor as bounded deletes and wrap upkeep so a failure is a warning', () => {
    const janitor = UPKEEP.slice(UPKEEP.indexOf('create or replace function public.pro_janitor'), UPKEEP.indexOf('create or replace function public.pro_refresh'));
    expect([...janitor.matchAll(/delete from public\.(\w+) where ctid in \(/g)].map(m => m[1])).toEqual(
      ['pro_messages', 'pro_connections', 'pro_invites', 'pro_rate_counters', 'pro_closet_views']);
    expect(janitor.match(/limit 5000/g)).toHaveLength(5);
    expect(janitor).toContain('update public.pro_meta set last_janitor_at = now() where id;');
    expect(janitor).toContain("pg_try_advisory_xact_lock(hashtextextended('pro_janitor', 0))");
    expect(janitor).toContain("interval '15 minutes'");
    expect(janitor).toContain("raise warning 'pro_janitor: %', sqlerrm");
    expect(janitor).toContain("(status = 'live' and expires_at < now() - interval '30 days')");
    const refresh = UPKEEP.slice(UPKEEP.indexOf('create or replace function public.pro_refresh'));
    expect(refresh).toContain("raise warning 'pro_refresh: %', sqlerrm");
    expect(refresh).toContain("raise warning 'pro_refresh (janitor): %', sqlerrm");
    expect(refresh).toContain('with gone as (');
    expect(refresh).not.toMatch(/\braise exception\b/);
  });

  it('pin search_path on every function', () => {
    expect(definedFunctions.length).toBeGreaterThan(40);
    for (const chunk of all.split('create or replace function ').slice(1)) {
      const head = chunk.slice(0, chunk.indexOf('$$'));
      expect(head).toMatch(/set search_path = public/);
    }
  });

  it('grant exactly the 16 client functions to authenticated, the janitor to service_role, and nothing else to anyone', () => {
    expect(listed(all, 'authenticated').sort()).toEqual([...CLIENT_FUNCTIONS].sort());
    expect(listed(all, 'service_role').sort()).toEqual([...SERVICE_FUNCTIONS].sort());
    expect(listed(all, 'anon')).toEqual([]);
    expect(listed(all, 'public')).toEqual([]);
    expect(everything).not.toMatch(/grant execute on function[^;]* to (anon|public)\b/);
    // client functions are revoked from public and anon first; helpers from everyone but the owner (and service_role's explicit grant)
    for (const block of all.matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)) {
      const body = block[2];
      if (body.includes('to authenticated')) expect(body).toContain("revoke all on function %s from public, anon'");
      else expect(body).toContain("revoke all on function %s from public, anon, authenticated'");
    }
  });

  it('list every function the files define, once, as client, internal or service', () => {
    const covered = [...CLIENT_FUNCTIONS, ...INTERNAL_FUNCTIONS, ...SERVICE_FUNCTIONS];
    expect([...definedFunctions].sort()).toEqual([...covered].sort());
    expect(new Set(definedFunctions).size).toBe(definedFunctions.length);            // no overloading
    expect(listed(all, null).sort()).toEqual([...INTERNAL_FUNCTIONS].sort());
  });

  it('name every argument of a client function with a p_ prefix, the contract PostgREST matches by name', () => {
    for (const name of CLIENT_FUNCTIONS) {
      const m = new RegExp(`create or replace function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`).exec(all)!;
      const args = m[1].split(',').map(a => a.trim()).filter(Boolean);
      for (const a of args) expect(`${name}(${a})`).toMatch(/\(p_[a-z_]+ /);
    }
    const sig = (name: string) => new RegExp(`create or replace function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`).exec(all)![1].replace(/\s+/g, ' ').trim();
    expect(sig('accept_pro_terms')).toBe('p_role text, p_version text, p_adult boolean default false');
    expect(sig('save_stylist_profile')).toBe(
      "p_display_name text, p_headline text default '', p_bio text default '', p_services text[] default '{}', p_languages text[] default '{}', p_rates_text text default '', p_accepting boolean default true");
    expect(sig('create_pro_invite')).toBe('p_client_ref uuid, p_label text default null');
    expect(sig('redeem_pro_invite')).toBe('p_code text, p_alias text');
    expect(sig('preview_pro_invite')).toBe('p_code text');
    expect(sig('revoke_pro_invite')).toBe('p_invite uuid');
    expect(sig('list_pro_connections')).toBe("p_as text default 'client'");
    expect(sig('get_pro_connection')).toBe('p_connection uuid');
    expect(sig('end_pro_connection')).toBe('p_connection uuid');
    expect(sig('set_pro_alias')).toBe('p_connection uuid, p_alias text');
    expect(sig('set_stylist_accepting')).toBe('p_accepting boolean');
  });

  it('start every table-returning function with the column-wins pragma', () => {
    for (const name of ['list_my_pro_invites', 'list_pro_connections']) {
      const body = all.slice(all.indexOf(`create or replace function public.${name}(`));
      expect(body.slice(0, body.indexOf('declare'))).toContain('#variable_conflict use_column');
    }
  });

  it('never put an email, an account id, a path or a private column in a client-visible result', () => {
    const forbidden = ['email', 'phone', 'user_id', 'stylist_id', 'client_id', 'owner_id', 'cost', 'price', 'notes', 'tag_text',
      'estimated_value', 'wear_count', 'purchase_date', 'path', 'image'];
    const lists = [...all.matchAll(/returns table \(([\s\S]*?)\)\s*language/g)];
    expect(lists).toHaveLength(2);
    for (const m of lists) for (const word of forbidden) expect(m[1]).not.toContain(word);
    // the jsonb keys of the client functions: no account id, email or phone, and the invite label only for its owner
    const keys = [...new Set([...PROFILES.matchAll(/'([a-zA-Z0-9]+)',/g), ...CONNECTIONS.matchAll(/'([a-zA-Z0-9]+)',/g)].map(m => m[1]))];
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(k).not.toMatch(/^(email|phone|userId|stylistId|clientId|ownerId|accountId|price|cost|notes|path|photoPath)$/);
    const invitePreview = PROFILES.slice(PROFILES.indexOf('create or replace function public.preview_pro_invite'), PROFILES.indexOf('create or replace function public.redeem_pro_invite'));
    expect(invitePreview).not.toMatch(/\blabel\b/);
  });

  it('cascade every user foreign key, except the two sides of a connection, which are set null', () => {
    const refs = [...FOUNDATION.matchAll(/(\w+)\s+uuid[^\n]*references auth\.users\(id\)([^\n,]*)/g)];
    expect(refs.map(r => r[1])).toEqual(['user_id', 'user_id', 'stylist_id', 'stylist_id', 'client_id', 'sender_id', 'user_id']);
    for (const r of refs) {
      if (r[1] === 'client_id' || (r[1] === 'stylist_id' && r[2].includes('set null'))) expect(r[2]).toContain('on delete set null');
      else expect(r[2]).toContain('on delete cascade');
    }
    expect(refs.filter(r => r[2].includes('set null'))).toHaveLength(2);
    expect(FOUNDATION).toMatch(/clothing_items\(id\) on delete cascade/);          // a deleted piece leaves a grant
    expect(FOUNDATION).toMatch(/item_id\s+uuid references public\.clothing_items\(id\) on delete set null/);   // and keeps the copied name in a look
  });

  it('leave the live friend, block, report and account functions alone', () => {
    for (const name of ['delete_user_account', 'block_user', 'report_user', 'report_swap_content', 'get_friend_closet', 'find_user_by_email', 'is_blocked_between', 'friend_display_name', 'swap_fold_text']) {
      expect(everything).not.toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
    }
    // swap is read from in exactly two places: the fold function and the term table
    expect([...new Set([...everything.matchAll(/\b(swap_\w+)/g)].map(m => m[1]))].sort()).toEqual(['swap_blocked_terms', 'swap_fold_text']);
    expect(everything).not.toContain('storage.objects');
    expect(everything).not.toMatch(/create policy[^;]*storage/);
  });

  it('change user_blocks by one column and its two client policies, and hook both triggers', () => {
    expect(FOUNDATION).toContain('alter table public.user_blocks add column if not exists via_pro boolean not null default false;');
    expect(FOUNDATION.match(/using \(auth\.uid\(\) = blocker_id and not via_swap and not via_pro\)/g)).toHaveLength(2);
    expect(FOUNDATION).toContain('create trigger pro_on_block after insert on public.user_blocks');
    expect(FOUNDATION).toContain('create trigger pro_on_member_left after update of stylist_id, client_id on public.pro_connections');
    expect(FOUNDATION).toContain('when ((old.client_id is not null and new.client_id is null) or (old.stylist_id is not null and new.stylist_id is null))');
    for (const trigger of ['pro_on_block', 'pro_on_member_left']) {
      const body = FOUNDATION.slice(FOUNDATION.indexOf(`create or replace function public.${trigger}()`));
      expect(body.slice(0, body.indexOf('$$;', 20))).toContain("raise warning '" + trigger + ": %', sqlerrm");
    }
    expect(everything).not.toContain('drop table');
    expect(everything).not.toMatch(/alter table public\.(?!pro_|user_blocks|%I)/);
  });

  it('keep the gate, the lookups and the redeem to the order the design fixes', () => {
    const gate = FOUNDATION.slice(FOUNDATION.indexOf('create or replace function public.pro_gate'), FOUNDATION.indexOf('create or replace function public.pro_new_code'));
    expect(gate.indexOf("p_need = 'safety'")).toBeGreaterThan(gate.indexOf("'is_anonymous'"));
    expect(gate.indexOf("p_need = 'safety'")).toBeLessThan(gate.indexOf("'pro_disabled'"));
    expect(gate.indexOf("'pro_disabled'")).toBeLessThan(gate.indexOf("'pro_suspended'"));
    expect(gate.indexOf("'pro_suspended'")).toBeLessThan(gate.indexOf("'adult_required'"));
    const redeem = PROFILES.slice(PROFILES.indexOf('create or replace function public.redeem_pro_invite'), PROFILES.indexOf('-- ─── Function privileges'));
    const order = ["pro_gate(uid, 'client')", "pro_rate_check(uid, 'redeem_day')", 'select i.stylist_id into sid', 'pro_lock_users(sid, uid)',
      'where i.code = norm for update', "update public.pro_invites set status = 'used'", 'insert into public.pro_connections', "'connected'"];
    const at = order.map(s => redeem.indexOf(s));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const preview = PROFILES.slice(PROFILES.indexOf('create or replace function public.preview_pro_invite'), PROFILES.indexOf('create or replace function public.redeem_pro_invite'));
    expect(preview.indexOf("pro_rate_check(uid, 'invite_lookup_hour')")).toBeGreaterThan(preview.indexOf("pro_gate(uid, 'member')"));
    expect(preview.indexOf("pro_rate_check(uid, 'invite_lookup_hour')")).toBeLessThan(preview.indexOf('select * into inv'));
    // a failure of the code returns, so the counter commits; the preview and the redeem never raise invite_invalid
    expect(PROFILES).not.toMatch(/pro_raise\('invite_invalid'/);
    expect(PROFILES).toContain(`jsonb_build_object('valid', false, 'error', 'invite_invalid')`);
    expect(PROFILES).toContain(`jsonb_build_object('ok', false, 'error', 'invite_invalid')`);
    // every stylist-side function that decides what a redeem decides on takes the stylist's lock
    for (const name of ['save_stylist_profile', 'set_stylist_accepting', 'close_stylist_profile', 'revoke_pro_invite', 'create_pro_invite']) {
      const body = PROFILES.slice(PROFILES.indexOf(`create or replace function public.${name}(`));
      expect(body.slice(0, body.indexOf('$$;', 20))).toContain('pro_lock_users(uid, uid)');
    }
  });

  it('use the safety gate for every way out of a connection, and the role gate for what creates content', () => {
    const body = (name: string) => {
      const from = CONNECTIONS.indexOf(`create or replace function public.${name}(`);
      return CONNECTIONS.slice(from, CONNECTIONS.indexOf('$$;', from + 20));
    };
    for (const name of ['list_pro_connections', 'get_pro_connection', 'end_pro_connection']) expect(body(name)).toContain("pro_gate(uid, 'safety')");
    expect(body('set_pro_alias')).toContain("pro_gate(uid, 'client')");
    expect(PROFILES.slice(PROFILES.indexOf('create or replace function public.close_stylist_profile'))).toContain("pro_gate(uid, 'safety')");
    expect(body('get_pro_connection')).toContain('safetyOnly');
    expect(body('end_pro_connection')).toContain("pro_gate(uid, 'safety');");
    expect(body('end_pro_connection')).not.toMatch(/pro_gate\(uid, '(member|client|stylist)/);
  });

  it('keep the limits in one function, in the shape the in-step test reads, with the documented numbers', () => {
    const limits = [...FOUNDATION.matchAll(/when '(\w+)'\s+then (\d+)/g)].map(m => [m[1], Number(m[2])] as const);
    expect(limits).toHaveLength(49);
    expect(new Set(limits.map(l => l[0])).size).toBe(49);
    const byName = Object.fromEntries(limits);
    expect(byName).toMatchObject({
      terms_day: 20, profile_day: 6, invite_day: 5, invite_lookup_hour: 10, redeem_day: 10, alias_day: 10, end_day: 30, block_day: 30,
      grant_day: 60, closet_page_day: 600, recommend_day: 60, send_look_day: 30, feedback_day: 60, appointment_day: 20, respond_day: 60,
      message_min: 6, message_hour: 60, message_day: 300, photo_day: 3000, reports_day: 20, stylist_clients: 25, stylist_clients_probation: 3,
      invites_live: 10, invites_live_probation: 1, invite_expiry_days: 7, client_connections: 5, items_per_look: 12, grant_items_max: 500,
      drafts_per_connection: 30, appointments_open_per_connection: 5, appointment_lead_minutes: 60, appointment_max_days_ahead: 180,
      grant_days: 90, grant_warn_days: 7, closet_page_size: 60, closet_pages_connection_day: 200, message_retention_days: 180,
      ended_message_retention_days: 30, ended_connection_retention_days: 90, churn_connections: 10, churn_hours: 48,
      reports_to_hold_stylist: 2, report_window_days: 14, hold_release_days: 7, qualified_reporter_hours: 48,
      qualified_connection_hours: 24, qualified_connection_messages: 3, evidence_bytes: 18000, evidence_body_chars: 300,
    });
    expect(FOUNDATION).toMatch(/else 0\s+end;/);                                  // an unknown name is 0
  });

  it('bound the text columns as the design says', () => {
    expect(FOUNDATION).toContain('char_length(display_name) between 2 and 40');
    expect(FOUNDATION).toContain('check (char_length(headline) <= 80)');
    expect(FOUNDATION).toContain('check (char_length(bio) <= 500)');
    expect(FOUNDATION).toContain('check (char_length(rates_text) <= 120)');
    expect(FOUNDATION).toContain('check (stylist_label is null or char_length(stylist_label) <= 40)');
    expect(FOUNDATION).toContain('check (client_alias is null or char_length(client_alias) <= 30)');
    expect(FOUNDATION).toContain('check (label is null or char_length(label) <= 40)');
    expect(FOUNDATION).toContain('char_length(title) between 1 and 80');
    expect(FOUNDATION).toContain('check (char_length(body) <= 1000)');
    expect(FOUNDATION).toContain('check (client_comment is null or char_length(client_comment) <= 500)');
    expect(FOUNDATION).toContain('check (char_length(place) <= 120)');
    expect(FOUNDATION).toContain('check (char_length(note) <= 280)');
    expect(FOUNDATION).toContain('check (char_length(body) <= 500)');
    expect(FOUNDATION).toContain("check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$')");
    // no column anywhere for money, a link or a contact detail
    expect(FOUNDATION).not.toMatch(/\b(fee|price|paid|link|url|email|phone|website|handle|address|location|verified)\b\s+(text|numeric|boolean|integer)/i);
  });

  it('keep the purge of the legacy rows out of the folder `supabase db push` applies', () => {
    const present = fs.readdirSync(dir);
    const RELEASED = /^\d{14}_purge_legacy_pro_tables\.sql$/;
    expect(present.filter(f => /purge_legacy_pro_tables/.test(f) && !RELEASED.test(f))).toEqual([]);
    const held = path.join(heldDir, 'purge_legacy_pro_tables.sql');
    const released = present.filter(f => RELEASED.test(f));
    expect([fs.existsSync(held), ...released].filter(Boolean)).toHaveLength(1);       // exactly one copy, held or released
    const sql = code(fs.readFileSync(fs.existsSync(held) ? held : path.join(dir, released[0]), 'utf8'));
    const deletes = [...sql.matchAll(/if to_regclass\('public\.(\w+)'\) is not null then delete from public\.(\w+) where id is not null; end if;/g)];
    expect(deletes.map(d => d[1])).toEqual(['messages', 'message_threads', 'booking_requests', 'stylist_reviews', 'styling_recommendations',
      'recommendations', 'appointments', 'stylist_clients', 'stylist_profiles']);
    for (const d of deletes) expect(d[1]).toBe(d[2]);
    expect([...deletes.map(d => d[1])].sort()).toEqual([...LEGACY].sort());
    expect(sql.match(/delete from/g)).toHaveLength(9);                                // one statement per table, nothing else
    expect(sql).not.toMatch(/\b(drop|alter|grant|revoke|truncate|insert|update)\b/);
  });

  it('apply the lockdown the same way in the scenario that proves it is safe to run twice', () => {
    const block = LOCKDOWN.slice(LOCKDOWN.indexOf('do $$'), LOCKDOWN.lastIndexOf('$$;') + 3);
    const scenario = fs.readFileSync(path.join(root, 'supabase', 'tests', 'pro', 'p8_legacy_lockdown.sql'), 'utf8');
    expect(block.length).toBeGreaterThan(100);
    expect(scenario).toContain(block);
  });

  it('never name an AI assistant or its maker', () => {
    const banned = new RegExp(['clau' + 'de', 'anthr' + 'opic', 'chat' + 'gpt', 'open' + 'ai', 'copi' + 'lot', 'gem' + 'ini'].join('|'), 'i');
    const files = [
      ...FILES.map(f => path.join(dir, f)),
      path.join(heldDir, 'purge_legacy_pro_tables.sql'),
      path.join(root, 'scripts', 'run-pro-sql-tests.sh'),
      ...['00_lib.sql', '10_fixture_users.sql', '20_fixture_closets.sql', '99_tail.sql', 'p1_profile_invite_connect.sql', 'p8_legacy_lockdown.sql']
        .map(f => path.join(root, 'supabase', 'tests', 'pro', f)),
    ];
    for (const f of files) expect([f, banned.test(fs.readFileSync(f, 'utf8'))]).toEqual([f, false]);
  });
});

// Fixes after the review of the first build (documentation/design/pro-accounts.md, "Review notes", items 15 to 21). The
// behaviour is proved by the scenarios (p1, p4, p5) and by race.sh; this keeps the text that makes it true from drifting.
describe('pro migrations 1 to 5: what the review changed', () => {
  const fn = (sql: string, name: string): string => {
    const from = sql.indexOf(`create or replace function public.${name}(`);
    return code(sql.slice(from, sql.indexOf('\n$$;', from) + 4));
  };

  it('has a block made through Friends or Swaps take the pair lock a redeem takes, before it ends anything', () => {
    const body = fn(FOUNDATION, 'pro_on_block');
    expect(body).toContain('perform public.pro_lock_users(new.blocker_id, new.blocked_id);');
    expect(body.indexOf('pro_lock_users(new.blocker_id, new.blocked_id)')).toBeLessThan(body.indexOf('pro_end_between(new.blocker_id, new.blocked_id)'));
    expect(body).toContain("exception when others then raise warning 'pro_on_block: %', sqlerrm;");     // a block still never fails
    expect(fn(PROFILES, 'redeem_pro_invite')).toContain('pro_lock_users(sid, uid)');
  });

  it('repairs a block the trigger did not finish, at the next read of either person, under the same pair lock', () => {
    const body = fn(UPKEEP, 'pro_refresh');
    const repair = body.slice(body.indexOf('public.is_blocked_between(c.stylist_id, c.client_id)'));
    expect(body).toContain("(c.status = 'active' or c.shell_at is null)");
    expect(repair).toContain('perform public.pro_lock_users(r.stylist_id, r.client_id);');
    expect(repair.indexOf('pro_lock_users(r.stylist_id, r.client_id)')).toBeLessThan(repair.indexOf('pro_end_between('));
    expect(repair).toContain('perform public.pro_end_between(r.client_id, r.stylist_id);');             // the blocker's role is kept
    expect(repair).toContain('perform public.pro_end_between(r.stylist_id, r.client_id);');
    expect(body.indexOf('is_blocked_between')).toBeGreaterThan(body.indexOf('perform public.pro_end_connection(r.id'));
    expect(bareWrites(UPKEEP)).toEqual([]);
  });

  it('deletes the unsent drafts of a stylist who left, here and in the repair, and nothing the client was sent', () => {
    const left = fn(FOUNDATION, 'pro_on_member_left');
    const stylistBranch = left.slice(left.indexOf('if old.stylist_id is not null and new.stylist_id is null'));
    expect(stylistBranch).toContain("delete from public.pro_recommendations where connection_id = new.id and status = 'draft';");
    const repair = fn(UPKEEP, 'pro_refresh');
    expect(repair).toContain("delete from public.pro_recommendations where status = 'draft' and connection_id in (select c.id from public.pro_connections c where c.stylist_id is null and c.client_id = p_uid);");
    // the client-left branch still deletes every look
    expect(left.slice(left.indexOf('old.client_id is not null and new.client_id is null'), left.indexOf('if old.stylist_id'))).toContain('delete from public.pro_recommendations where connection_id = new.id;');
  });

  it('never tells either side that a moderation decision ended a connection: the list maps "system" to the other person, as the detail does', () => {
    const list = fn(CONNECTIONS, 'list_pro_connections');
    expect(list).toContain("case when c.ended_by = 'system' then (case when p_as = 'client' then 'stylist' else 'client' end) else c.ended_by end");
    expect(list).not.toMatch(/c\.status,\s*c\.ended_by,/);
  });

  it('counts only an active connection as "already connected", in the preview and in the redeem', () => {
    expect(fn(PROFILES, 'preview_pro_invite')).toContain("where c.invite_id = inv.id and c.client_id = uid and c.status = 'active'");
    expect(fn(PROFILES, 'redeem_pro_invite')).toContain("where c.invite_id = inv.id and c.client_id = uid and c.status = 'active'");
  });

  it('holds a client alias to the reserved words a display name is held to, when it is chosen and when it is changed', () => {
    for (const body of [fn(PROFILES, 'redeem_pro_invite'), fn(CONNECTIONS, 'set_pro_alias')]) {
      expect(body).toContain("if not public.pro_name_ok(alias) then perform public.pro_raise('text_not_allowed', '22023', 'alias', 'name');");
    }
  });

  it('refuses text that hides characters or claims approval by SmartCloset, in the one text filter every field goes through', () => {
    const body = fn(FOUNDATION, 'pro_text_ok');
    expect(body).toContain('\\u202a-\\u202e');                                          // bidirectional overrides
    expect(body).toContain('\\u2060-\\u206f');                                          // isolates and invisible operators
    expect(body).not.toMatch(/\\u200d|\\ufe0f|\\u200c/);                                // emoji joiners and variation selectors stay allowed
    expect(body.indexOf('hidden')).toBeLessThan(body.indexOf('if t ~ \'(gift'));        // computed first,
    expect(body.lastIndexOf('if hidden then')).toBeGreaterThan(body.indexOf('swap_blocked_terms'));   // answered last, so a phrase keeps its own hint
    expect(body).toMatch(/smart\[ \._-\]\*closet\.\{0,40\}.*official\|verified\|approved/);
    const publicBranch = body.slice(body.indexOf("if p_mode = 'public' then"), body.indexOf('swap_blocked_terms'));
    expect(publicBranch).toContain('smart[ ._-]*closet');                                 // the claims check is for what a stranger reads only
    for (const field of ['headline', 'bio', 'rates']) {
      expect(fn(PROFILES, 'save_stylist_profile')).toContain(`pro_require_text(${{ headline: 'hl', bio: 'bi', rates: 'rt' }[field]}, '${field}', 'public')`);
    }
  });

  it('counts only the reported person’s own messages toward a qualified report', () => {
    expect(fn(FOUNDATION, 'pro_report_is_qualified')).toContain("m.connection_id = c.id and m.kind = 'text' and m.sender_id = p_reported");
  });

  it('stores a session’s offset from UTC and never a zone name', () => {
    expect(FOUNDATION).toContain('utc_offset_minutes smallint not null default 0 check (utc_offset_minutes between -720 and 840 and utc_offset_minutes % 15 = 0)');
    expect(code(FOUNDATION)).not.toMatch(/\btz\b\s+text/);
  });
});
