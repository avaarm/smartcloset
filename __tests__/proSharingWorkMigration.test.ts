/**
 * Reads the professional-accounts migrations 6 and 7 (sharing; looks, sessions and messages) as text and checks the rules
 * every function in them must keep: the exact grants, the pinned search_path, no storage policy, a fixed list of
 * columns, nothing private in any answer, and a WHERE on every write. The behaviour itself is checked by the
 * BEGIN ... ROLLBACK scripts p2_sharing and p3_work and by race.sh in supabase/tests/pro.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { proComesBefore, proFile, proMigrationFiles, readPro, readProAll } from '../supabase/tests/pro/migrationFiles';

const root = path.join(__dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');
const testDir = path.join(root, 'supabase', 'tests', 'pro');
// Found by name, not by digits: the release renames the pro files (pro-accounts.md 3.1, 11.1 P3).
const FILES = [proFile('sharing'), proFile('work')];
const [SHARING, WORK] = [readPro('sharing'), readPro('work')];
const both = [SHARING, WORK].join('\n');
const FOUNDATION = readPro('foundation');
const earlier = readProAll(['foundation', 'upkeep', 'profiles_invites', 'connections']);

/** The arguments of each function, in order, as 4.6 fixes them. `required` is how many have no default. */
const SPEC: Record<string, { args: string[]; required: number }> = {
  get_pro_grant: { args: ['p_connection'], required: 1 },
  set_pro_grant: { args: ['p_connection', 'p_scope', 'p_enabled', 'p_item_mode', 'p_item_ids', 'p_text_version', 'p_renew'], required: 3 },
  get_client_closet: { args: ['p_connection', 'p_offset', 'p_limit'], required: 1 },
  pro_photo_source: { args: ['p_uid', 'p_connection', 'p_item'], required: 3 },
  save_pro_recommendation: { args: ['p_connection', 'p_id', 'p_title', 'p_body', 'p_item_ids', 'p_client_ref'], required: 1 },
  send_pro_recommendation: { args: ['p_id'], required: 1 },
  delete_pro_recommendation: { args: ['p_id'], required: 1 },
  list_pro_recommendations: { args: ['p_connection', 'p_before', 'p_limit'], required: 1 },
  get_pro_recommendation: { args: ['p_id'], required: 1 },
  give_recommendation_feedback: { args: ['p_id', 'p_rating', 'p_comment', 'p_worn'], required: 1 },
  propose_pro_appointment: { args: ['p_connection', 'p_starts_at', 'p_duration_minutes', 'p_mode', 'p_place', 'p_note', 'p_utc_offset_minutes', 'p_client_ref'], required: 4 },
  respond_pro_appointment: { args: ['p_appointment', 'p_action'], required: 2 },
  cancel_pro_appointment: { args: ['p_appointment'], required: 1 },
  list_pro_appointments: { args: ['p_connection', 'p_scope'], required: 0 },
  send_pro_message: { args: ['p_connection', 'p_body', 'p_client_ref'], required: 3 },
  get_pro_thread: { args: ['p_connection', 'p_after_id', 'p_before_id', 'p_limit'], required: 1 },
};
const SHARING_CLIENT = ['get_pro_grant', 'set_pro_grant', 'get_client_closet'];
const WORK_CLIENT = ['save_pro_recommendation', 'send_pro_recommendation', 'delete_pro_recommendation', 'list_pro_recommendations',
  'get_pro_recommendation', 'give_recommendation_feedback', 'propose_pro_appointment', 'respond_pro_appointment',
  'cancel_pro_appointment', 'list_pro_appointments', 'send_pro_message', 'get_pro_thread'];
const COLUMNS: Record<string, string[]> = {
  get_client_closet: ['item_id', 'name', 'category', 'subcategory', 'color', 'brand', 'season', 'pattern', 'material', 'materials', 'size',
    'condition', 'has_photo', 'total_count'],
  list_pro_recommendations: ['rec_id', 'status', 'title', 'item_count', 'cover_item_id', 'cover_photo_path', 'sent_at', 'viewed_at',
    'updated_at', 'client_rating', 'is_new'],
  list_pro_appointments: ['appointment_id', 'connection_id', 'other_label', 'my_role', 'status', 'proposed_by', 'starts_at',
    'duration_minutes', 'mode', 'place', 'note', 'utc_offset_minutes', 'can_confirm', 'can_decline', 'can_cancel', 'created_at'],
};
/** 4.4: every message a function may raise, with the SQLSTATE it is raised with. */
const ERRORS: Record<string, string> = {
  not_authenticated: '28000',
  pro_disabled: '42501', pro_suspended: '42501', account_too_new: '42501', stylist_profile_required: '42501',
  stylist_profile_removed: '42501', invites_held: '42501', closet_not_shared: '42501', pro_terms_required: '42501',
  pro_unavailable: '22023', connection_ended: '22023', invite_invalid: '22023', stylist_not_accepting: '22023',
  adult_required: '22023', terms_version_mismatch: '22023', stale_consent_text: '22023', invalid_request: '22023',
  invalid_profile: '22023', invalid_alias: '22023', invalid_message: '22023', invalid_recommendation: '22023',
  invalid_appointment: '22023', invalid_report: '22023', recommendation_locked: '22023', recommendation_empty: '22023',
  appointment_closed: '22023', item_not_found: '22023', item_not_shared: '22023', text_not_allowed: '22023',
  appointment_conflict: '23505',
  pro_rate_limited: '54000', invite_limit: '54000', client_connection_limit: '54000', draft_limit: '54000',
  appointment_open_limit: '54000', closet_page_limit: '54000', report_rate_limited: '54000',
};

/** The statements of a SQL text with the comments taken out. */
const code = (sql: string): string => sql.replace(/--[^\n]*/g, '');

/** The code with comments out and every run of white space made one space, for matching an expression. */
const flat = (sql: string): string => code(sql).replace(/\s+/g, ' ');

/** The keys (first, third, ... argument, when quoted) of every jsonb_build_object( ... ) call in a text, nested ones too. */
const jsonKeys = (sql: string): string[] => {
  const text = code(sql);
  const keys: string[] = [];
  for (const m of text.matchAll(/jsonb_build_object\(/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const args: string[] = [];
    let current = '';
    let quoted = false;
    for (; i < text.length && depth > 0; i += 1) {
      const ch = text[i];
      if (ch === "'") {quoted = !quoted;}
      if (!quoted && ch === '(') {depth += 1;}
      if (!quoted && ch === ')') { depth -= 1; if (depth === 0) {break;} }
      if (!quoted && depth === 1 && ch === ',') { args.push(current.trim()); current = ''; } else {current += ch;}
    }
    args.push(current.trim());
    for (let k = 0; k < args.length; k += 2) {
      const lit = /^'([A-Za-z0-9_]+)'$/.exec(args[k]);
      if (lit) {keys.push(lit[1]);}
    }
  }
  return keys;
};

/** The whole definition of a function (up to its closing `$$;`). */
const definition = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) {throw new Error(`${name} is not defined`);}
  const end = sql.indexOf('\n$$;', start);
  return sql.slice(start, end + 4);
};

/** The parameter list of a function, split at top level: ["p_connection uuid", "p_offset integer default 0", ...]. */
const parameters = (def: string): string[] => {
  const open = def.indexOf('(');
  let depth = 0;
  let close = open;
  for (let i = open; i < def.length; i += 1) {
    if (def[i] === '(') {depth += 1;}
    if (def[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  const inner = def.slice(open + 1, close);
  const parts: string[] = [];
  let level = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') {level += 1;}
    if (ch === ')') {level -= 1;}
    if (ch === ',' && level === 0) { parts.push(current.trim()); current = ''; } else {current += ch;}
  }
  if (current.trim()) {parts.push(current.trim());}
  return parts;
};

/** The columns of a `returns table (...)` list. */
const tableColumns = (def: string): string[] => {
  const m = /returns table \(([\s\S]*?)\)\s*language/.exec(def);
  if (!m) {return [];}
  return m[1].split(',').map(c => c.trim().split(/\s+/)[0]);
};

/** Function names listed in `foreach f in array array[ ... ] loop ... end loop;` blocks that grant to `role`, with the
 *  signature text of each, and the roles it is first revoked from. */
const grantBlocks = (sql: string) => [...sql.matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)].map(block => ({
  functions: [...block[1].matchAll(/'public\.(\w+)\(([^)]*)\)'/g)].map(m => ({ name: m[1], signature: m[2] })),
  revoke: /revoke all on function %s from ([a-z, ]+)'/.exec(block[2])?.[1].split(',').map(r => r.trim()) ?? [],
  grant: /grant execute on function %s to (\w+)/.exec(block[2])?.[1] ?? null,
}));

const topLevel = (text: string): string => {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '(') {depth += 1;}
    else if (ch === ')') {depth = Math.max(0, depth - 1);}
    else if (depth === 0) {out += ch;}
  }
  return out;
};
const bareWrites = (sql: string): string[] => {
  const text = sql.replace(/--[^\n]*/g, '');
  const found: string[] = [];
  const start = /\b(update\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?\w+)?\s+set\b|delete\s+from\s+[\w."]+)/gi;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    if (/\bdo\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) {continue;}
    const end = text.indexOf(';', m.index);
    const statement = text.slice(m.index, end === -1 ? undefined : end);
    if (!/\bwhere\b/i.test(topLevel(statement))) {found.push(statement.replace(/\s+/g, ' ').trim().slice(0, 90));}
  }
  return found;
};

describe('pro migrations 6 and 7', () => {
  it('exist, in order, after the five before them', () => {
    expect([...FILES].sort()).toEqual(FILES);
    for (const f of FILES) {expect(fs.existsSync(path.join(dir, f))).toBe(true);}
    expect(proComesBefore('connections', 'sharing')).toBe(true);
    expect(proComesBefore('sharing', 'work')).toBe(true);
    expect(proMigrationFiles()).toHaveLength(8);
  });

  it('define exactly the functions of 4.6 groups 5 to 8 (and pro_photo_source), each once, in the right file', () => {
    const inSharing = [...code(SHARING).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    const inWork = [...code(WORK).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    expect(inSharing).toEqual([...SHARING_CLIENT, 'pro_photo_source']);
    expect(inWork).toEqual(WORK_CLIENT);
    const everyDefined = [...code([earlier, both].join('\n')).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    expect(new Set(everyDefined).size).toBe(everyDefined.length);                      // no name twice, so nothing is overloaded
  });

  it('take the arguments of 4.6 by name, with the optional ones defaulted and none renamed', () => {
    for (const [name, spec] of Object.entries(SPEC)) {
      const def = definition(name in SPEC && SHARING_CLIENT.concat('pro_photo_source').includes(name) ? SHARING : WORK, name);
      const params = parameters(def);
      expect(params.map(p => p.split(/\s+/)[0])).toEqual(spec.args);
      expect(params.map(p => /\bdefault\b/i.test(p))).toEqual(spec.args.map((_, i) => i >= spec.required));
      for (const p of params) {expect(p).toMatch(/^p_[a-z_]+ /);}
    }
  });

  it('return the columns of 4.6 for the three list functions, in order', () => {
    for (const [name, columns] of Object.entries(COLUMNS)) {
      const def = definition(SHARING_CLIENT.includes(name) ? SHARING : WORK, name);
      expect(tableColumns(def)).toEqual(columns);
      expect(def).toContain('#variable_conflict use_column');
    }
  });

  it('pin search_path and run as the definer, on every function', () => {
    for (const sql of [SHARING, WORK]) {
      const defs = [...code(sql).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
      expect(defs.length).toBeGreaterThan(0);
      for (const name of defs) {
        const def = definition(sql, name);
        const header = def.slice(0, def.indexOf('as $$'));
        expect(header).toContain('security definer');
        expect(header).toContain('set search_path = public');
      }
    }
  });

  it('grant the client functions to authenticated only, after revoking from public and anon, with the exact signatures', () => {
    for (const [sql, expected] of [[SHARING, SHARING_CLIENT], [WORK, WORK_CLIENT]] as const) {
      const blocks = grantBlocks(code(sql)).filter(b => b.grant === 'authenticated');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].revoke).toEqual(['public', 'anon']);
      expect(blocks[0].functions.map(f => f.name)).toEqual(expected);
      for (const f of blocks[0].functions) {
        const def = definition(sql, f.name);
        const types = parameters(def).map(p => p.replace(/\s+default\b[\s\S]*$/i, '').trim().split(/\s+/).slice(1).join(' ').replace('timestamp with time zone', 'timestamptz'));
        expect(f.signature.split(',').map(s => s.trim())).toEqual(types);
      }
    }
  });

  it('grant pro_photo_source to the service role only, and to nobody else', () => {
    const blocks = grantBlocks(code(SHARING)).filter(b => b.grant === 'service_role');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].revoke).toEqual(['public', 'anon', 'authenticated']);
    expect(blocks[0].functions.map(f => f.name)).toEqual(['pro_photo_source']);
    expect(blocks[0].functions[0].signature).toBe('uuid, uuid, uuid');
    expect(grantBlocks(code(both)).flatMap(b => b.functions.map(f => f.name)).sort())
      .toEqual([...SHARING_CLIENT, 'pro_photo_source', ...WORK_CLIENT].sort());
    expect(code(both)).not.toMatch(/\bto\s+(anon|public)\b/i);
    expect(code(both)).not.toMatch(/grant\s+(select|insert|update|delete|all)\b/i);
  });

  it('add no storage policy, no policy and no storage object of any kind', () => {
    const body = code(both);
    expect(body).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(body).not.toMatch(/storage\.(objects|buckets)|on storage|\bstorage\.\w+\(/i);
    expect(body).not.toMatch(/create table|alter table|create index|create trigger|create view/i);
    expect(body).not.toMatch(/create or replace function public\.(block_user|report_user|delete_user_account|get_friend_closet|report_swap_content)\b/);
  });

  it('use dynamic SQL for grants only', () => {
    for (const m of code(both).matchAll(/execute format\('([^']*)'/g)) {expect(m[1]).toMatch(/^(revoke all on function|grant execute on function) %s /);}
    expect(code(both)).not.toMatch(/^\s*execute\s+(?!format\()/im);
  });

  it('give no UPDATE or DELETE a missing WHERE', () => {
    expect(bareWrites(SHARING)).toEqual([]);
    expect(bareWrites(WORK)).toEqual([]);
  });

  it('raise only the messages of 4.4, with the SQLSTATE they have there', () => {
    const used = new Set<string>();
    for (const m of code(both).matchAll(/pro_raise\('(\w+)',\s*'(\w+)'/g)) {
      used.add(m[1]);
      expect(ERRORS[m[1]]).toBeDefined();
      expect({ message: m[1], state: m[2] }).toEqual({ message: m[1], state: ERRORS[m[1]] });
    }
    for (const needed of ['closet_not_shared', 'closet_page_limit', 'item_not_found', 'item_not_shared', 'stale_consent_text', 'recommendation_locked',
      'recommendation_empty', 'appointment_conflict', 'appointment_closed', 'appointment_open_limit', 'draft_limit', 'connection_ended', 'pro_unavailable']) {
      expect(used.has(needed)).toBe(true);
    }
    expect(code(both)).not.toMatch(/raise exception/i);                                  // every error goes through pro_raise
  });

  it('use only limits and counters that pro_limit defines, and counters with a window in their name', () => {
    const defined = new Set([...FOUNDATION.matchAll(/when '(\w+)'\s+then \d+/g)].map(m => m[1]));
    for (const m of code(both).matchAll(/pro_limit\('(\w+)'\)/g)) {expect(defined.has(m[1])).toBe(true);}
    const buckets = [...code(both).matchAll(/pro_rate_check\(\w+,\s*'(\w+)'\)/g)].map(m => m[1]);
    expect(new Set(buckets)).toEqual(new Set(['grant_day', 'closet_page_day', 'photo_day', 'recommend_day', 'send_look_day', 'feedback_day',
      'appointment_day', 'respond_day', 'message_min', 'message_hour', 'message_day']));
    for (const b of buckets) {
      expect(defined.has(b)).toBe(true);
      expect(b).toMatch(/_(min|hour|day)$/);
    }
  });

  it('start every client function with the sign-in gate and re-check the connection under its lock', () => {
    for (const name of [...SHARING_CLIENT, ...WORK_CLIENT]) {
      const def = definition(SHARING_CLIENT.includes(name) ? SHARING : WORK, name);
      const body = def.slice(def.indexOf('\nbegin'));
      expect(def).toMatch(/uid\s+uuid := auth\.uid\(\)/);
      expect(body.indexOf('pro_gate(uid')).toBeGreaterThan(-1);
      // nothing happens before the gate except the optional header comments and, for the text helpers, plain assignments
      const beforeGate = body.slice(0, body.indexOf('pro_gate(uid')).replace(/--[^\n]*/g, '');
      expect(beforeGate).not.toMatch(/\b(insert|update|delete|select)\b/i);
    }
    for (const name of ['set_pro_grant', 'save_pro_recommendation', 'propose_pro_appointment', 'respond_pro_appointment', 'send_pro_message',
      'send_pro_recommendation', 'delete_pro_recommendation', 'give_recommendation_feedback', 'cancel_pro_appointment']) {
      const def = definition(SHARING_CLIENT.includes(name) ? SHARING : WORK, name);
      expect(def).toMatch(/for update;/);
      expect(def).toMatch(/connection_ended/);
    }
  });

  it('take the persons advisory lock before the connection row, never the other way round', () => {
    for (const sql of [SHARING, WORK]) {
      for (const name of [...code(sql).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1])) {
        const def = code(definition(sql, name));
        const lock = def.indexOf('pro_lock_users(');
        const rows = [...def.matchAll(/pro_connections x where [^;]*for update;/g)].map(m => m.index!);
        if (lock === -1 || rows.length === 0) {continue;}
        // a row lock before the advisory lock is only allowed in a branch that returns before reaching it
        const early = rows.filter(i => i < lock);
        if (early.length > 0) {
          expect(name).toBe('set_pro_grant');
          const branch = def.slice(def.indexOf('if not p_enabled then'), lock);
          expect(branch).toContain('return public.get_pro_grant(p_connection);');
          expect(branch).toContain('end if;');
          expect(rows.some(i => i > lock)).toBe(true);
        }
      }
    }
    // the ones the document names take the lock at all
    for (const name of ['set_pro_grant', 'save_pro_recommendation', 'propose_pro_appointment', 'respond_pro_appointment']) {
      expect(definition(SHARING_CLIENT.includes(name) ? SHARING : WORK, name)).toContain('pro_lock_users(');
    }
  });
});

describe('pro migrations 6 and 7: nothing private in any answer', () => {
  const CLOSET_COLUMNS = new Set(['id', 'user_id', 'name', 'category', 'subcategory', 'color', 'brand', 'season', 'pattern', 'material', 'materials',
    'size', 'condition', 'user_image', 'is_wishlist', 'date_added']);

  it('read only the permitted columns of clothing_items, and never select *', () => {
    const body = code(both);
    const read = new Set([...body.matchAll(/\bci\.(\w+)/g)].map(m => m[1]));
    for (const column of read) {expect(CLOSET_COLUMNS.has(column)).toBe(true);}
    expect(body).not.toMatch(/\bci\.\*|clothing_items\.\*/);
    expect(body).not.toMatch(/select\s+\*[^;]*from\s+(public\.)?clothing_items/i);
    for (const forbidden of ['cost', 'notes', 'tags', 'tag_text', 'estimated_value', 'wear_count', 'last_worn', 'favorite', 'retailer', 'retailer_image',
      'images', 'care_instructions', 'origin_country', 'purchase_date', 'occasion']) {
      expect(body).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(body).not.toMatch(/\b(email|phone|password|token)\b/i);
  });

  it('read date_added only to order the closet, and user_image only to ask whether a photo exists or to build the clients own path', () => {
    const body = code(both);
    for (const m of body.matchAll(/ci\.date_added/g)) {expect(body.slice(Math.max(0, m.index! - 12), m.index!)).toMatch(/order by\s*$/);}
    for (const m of body.matchAll(/ci\.user_image/g)) {expect(body.slice(Math.max(0, m.index! - 25), m.index!)).toMatch(/pro_photo_path\(\s*$/);}
  });

  it('give a path to the client only: cover_photo_path and photoPath are both behind a client test', () => {
    const list = code(definition(WORK, 'list_pro_recommendations'));
    expect(list).toMatch(/case when me = 'client' then cover\.path end/);
    expect([...list.matchAll(/cover\.path/g)]).toHaveLength(1);
    const one = code(definition(WORK, 'get_pro_recommendation'));
    expect(one).toMatch(/'photoPath', case when me = 'client' and f\.shown then public\.pro_photo_path\(ci\.user_image, ci\.user_id\) end/);
    expect([...one.matchAll(/pro_photo_path\(/g)]).toHaveLength(2);                      // hasPhoto, and the client's own path
    expect(one).toMatch(/'hasPhoto', f\.shown and public\.pro_photo_path\(ci\.user_image, ci\.user_id\) is not null/);
    // a stylist's view of a piece comes only through f.shown, which needs pro_can_read_closet and the live grant
    expect(one).toContain('can_read and exists');
    expect(one).toMatch(/can_read := me = 'stylist' and c\.client_id is not null\s+and public\.pro_can_read_closet\(/);
    const other = code(definition(WORK, 'list_pro_recommendations'));
    expect(other).toContain('can_read and exists');
  });

  it('name no path, link or account id in a column list or a JSON key, but the two client-only names', () => {
    const keys: string[] = [];
    for (const name of [...SHARING_CLIENT, ...WORK_CLIENT]) {
      const def = definition(SHARING_CLIENT.includes(name) ? SHARING : WORK, name);
      keys.push(...tableColumns(def), ...jsonKeys(def));
    }
    expect(keys.length).toBeGreaterThan(40);
    const forbidden = /(^|_)(path|url|link|uri|email|phone|price|cost|notes|tag|tags|wear|favorite|retailer|gallery|images|image|account|user_id|stylist_id|client_id|sender_id|owner|storage|address|secret|token)(_|$)|Path$|Url$|Id$/;
    for (const key of keys) {
      if (key === 'cover_photo_path' || key === 'photoPath') {continue;}                     // the two client-only names
      if (['item_id', 'cover_item_id', 'rec_id', 'appointment_id', 'connection_id', 'itemId', 'itemIds', 'connectionId', 'appointmentId', 'messageId', 'id'].includes(key)) {continue;}
      expect({ key, forbidden: forbidden.test(key) }).toEqual({ key, forbidden: false });
    }
    // and no string of the shape <uuid>/<file> in either file
    expect(code(both)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//);
  });

  it('return the stylists grant as exactly five keys and keep the history to the client', () => {
    const def = code(definition(SHARING, 'get_pro_grant'));
    const stylist = def.slice(def.indexOf("if me = 'stylist' then"), def.indexOf('if c.shell_at is null then'));
    expect(jsonKeys(stylist)).toEqual(['scope', 'enabled', 'itemMode', 'itemCount', 'expiresAt']);
    expect(stylist).toContain('pro_can_read_closet(');
    const client = def.slice(def.indexOf('if c.shell_at is null then'));
    for (const k of ['events', 'lastViewedAt', 'views30d', 'textVersion', 'itemIds']) {expect(client).toContain(`'${k}'`);}
  });

  it('keep the closet to a fixed list of columns that are cleaned and capped', () => {
    const def = flat(definition(SHARING, 'get_client_closet'));
    const select = def.slice(def.indexOf('return query'));
    for (const piece of ['left(btrim(ci.name), 120)', 'left(btrim(ci.category), 60)', 'left(btrim(ci.subcategory), 60)', 'left(btrim(ci.color), 60)',
      'left(btrim(ci.brand), 60)', 'public.pro_clean_season(ci.season)', 'left(btrim(ci.pattern), 60)', 'left(btrim(ci.material), 60)',
      'public.pro_clean_materials(ci.materials)', 'left(btrim(ci.size), 60)', 'left(btrim(ci.condition), 60)',
      'public.pro_photo_path(ci.user_image, ci.user_id) is not null']) {
      expect(select).toContain(piece);
    }
    expect(select.match(/coalesce\(ci\.is_wishlist, false\) = false/g)).toHaveLength(1);
    expect(def.match(/coalesce\(ci\.is_wishlist, false\) = false/g)).toHaveLength(2);    // the count and the rows
    expect(def).toContain('skip := ((total - 1) / lim) * lim');
    expect(def).toContain("least(greatest(coalesce(p_limit, public.pro_limit('closet_page_size')), 1), public.pro_limit('closet_page_size'))");
    expect(def).toContain('pro_can_read_closet(uid, c.client_id, c.id)');
    expect(def).toContain("pro_gate(uid, 'stylist')");
  });

  it('check the live grant on every photo request and refuse everything the same way', () => {
    const def = code(definition(SHARING, 'pro_photo_source'));
    expect(def).toContain('pro_can_read_closet(c.stylist_id, c.client_id, c.id)');
    expect(def).toContain("pro_gate(p_uid, 'stylist')");
    expect(def).toContain("pro_rate_check(p_uid, 'photo_day')");
    expect(def.indexOf('pro_rate_check')).toBeGreaterThan(def.indexOf('if path is null'));                // counted on success only
    expect(def.match(/return null;/g)!.length).toBeGreaterThanOrEqual(4);
    expect(def).not.toMatch(/pro_raise\(/);                                                // a refusal is a null, never an error
    expect(def).toContain('coalesce(ci.is_wishlist, false) = false');
    expect(def).toContain("g.item_mode = 'all'");
    expect(def).toContain('gi.item_id = ci.id');
  });
});

describe('pro migrations 6 and 7: the rules of the sharing and the work', () => {
  it('turn sharing off through the safety gate, with no text version, no counter and no word to the stylist', () => {
    const def = code(definition(SHARING, 'set_pro_grant'));
    const off = def.slice(def.indexOf('if not p_enabled then'), def.indexOf('-- Enabling') === -1 ? def.indexOf('if p_item_mode is null') : def.indexOf('-- Enabling'));
    expect(off.length).toBeGreaterThan(100);
    for (const forbidden of ['pro_rate_check', 'stale_consent_text', 'p_text_version', "pro_gate(uid, 'client')", 'insert into public.pro_messages', 'last_activity_at', 'pro_lock_users']) {
      expect(off).not.toContain(forbidden);
    }
    expect(off).toContain("'revoked'");
    expect(def.indexOf("pro_gate(uid, 'safety')")).toBeLessThan(def.indexOf('if p_enabled then'));
    expect(def).toMatch(/if p_enabled then\s+perform public\.pro_gate\(uid, 'client'\)/);
    expect(def).not.toContain('last_activity_at');                                         // sharing never moves the connection
    expect(def.match(/insert into public\.pro_messages/g)).toHaveLength(1);
    expect(def).toContain("values (c.id, 'system', 'sharing_on')");
    expect(def).toContain("interval '24 hours'");
  });

  it('require the choice, the current text and a new expiry only on request', () => {
    const def = code(definition(SHARING, 'set_pro_grant'));
    expect(def).toContain("p_item_mode is null or p_item_mode not in ('all', 'selected')");
    expect(def).toContain("p_text_version is distinct from (public.pro_cfg('share_text_version') #>> '{}')");
    expect(def).toContain('expires_at = case when coalesce(p_renew, false) then excluded.expires_at else pro_grants.expires_at end');
    expect(def).toContain("pro_limit('grant_items_max')");
    expect(def).toContain("pro_limit('grant_days')");
    expect(def).toContain('for key share');
  });

  it('write the connections activity only where the document says: a sent look, a proposal and a message', () => {
    for (const name of WORK_CLIENT) {
      const def = code(definition(WORK, name));
      const touches = /last_activity_at/.test(def);
      expect({ name, touches }).toEqual({ name, touches: ['send_pro_recommendation', 'propose_pro_appointment', 'send_pro_message'].includes(name) });
    }
  });

  it('answer a retry from the stored row, and never raise a duplicate-key error', () => {
    for (const name of ['save_pro_recommendation', 'propose_pro_appointment', 'send_pro_message']) {
      const def = code(definition(WORK, name));
      expect(def).toMatch(/on conflict \([^)]*\) where client_ref is not null do nothing/);
      expect(def).toContain('client_ref = p_client_ref');
    }
  });

  it('keep sessions free of any money field and any link', () => {
    const body = code(WORK);
    expect(body).not.toMatch(/\b(fee|price|paid|payment_|amount|currency|invoice|url|link)\b/i);
    expect(body).toContain("pro_require_text(pl, 'place', 'public')");
    expect(body).toContain("pro_require_text(nt, 'note', 'chat')");
    expect(body).toContain("pro_require_text(bdy, 'message', 'chat')");
    expect(body).toContain("pro_require_text(ttl, 'title', 'chat')");
    expect(body).toContain("pro_require_text(bdy, 'body', 'chat')");
    expect(body).toContain("pro_require_text(cmt, 'comment', 'chat')");
  });

  it('read ended connections through the safety gate and active ones through the roles gate', () => {
    for (const name of ['list_pro_recommendations', 'get_pro_recommendation', 'get_pro_thread', 'list_pro_appointments']) {
      const def = flat(definition(WORK, name));
      expect(def).toContain("pro_gate(uid, 'safety')");
      expect(def).toMatch(/if (c\.status = 'active'[^;]*|live) then (perform public\.pro_gate\(uid, (me|case when)|)/);
      expect(def).toMatch(/pro_gate\(uid, (me|case when c\.stylist_id = uid then 'stylist' else 'client' end)\)/);
    }
    for (const name of ['list_pro_recommendations', 'get_pro_recommendation', 'get_pro_thread']) {
      expect(code(definition(WORK, name))).toContain('c.shell_at is not null');
    }
    for (const name of ['save_pro_recommendation', 'send_pro_recommendation', 'delete_pro_recommendation', 'give_recommendation_feedback', 'propose_pro_appointment',
      'respond_pro_appointment', 'cancel_pro_appointment', 'send_pro_message']) {
      const def = code(definition(WORK, name));
      expect(def).toContain("pro_gate(uid, 'member')");
      expect(def).toContain('c.shell_at is not null');
    }
  });

  it('page the thread both ways and move the read pointer only forward', () => {
    const def = code(definition(WORK, 'get_pro_thread'));
    expect(def).toContain('p_after_id is not null and p_before_id is not null');
    expect(def).toContain('least(greatest(coalesce(p_limit, 50), 1), 100)');
    expect(def).toContain('client_seen_message_id < maxid');
    expect(def).toContain('stylist_seen_message_id < maxid');
    expect(def).toContain("c.status = 'active' and maxid is not null");
  });
});

describe('pro SQL scripts of this stream', () => {
  const read = (f: string) => fs.readFileSync(path.join(testDir, f), 'utf8');
  const racePath = path.join(testDir, 'race.sh');
  const race = read('race.sh');

  it('exist, are listed by the runner, and never commit (but the race script)', () => {
    const runner = fs.readFileSync(path.join(root, 'scripts', 'run-pro-sql-tests.sh'), 'utf8');
    const listed = runner.match(/scenarios=\(([^)]*)\)/)![1];
    for (const s of ['p2_sharing', 'p3_work']) {
      expect(fs.existsSync(path.join(testDir, `${s}.sql`))).toBe(true);
      expect(listed).toContain(s);
      expect(read(`${s}.sql`)).not.toMatch(/^\s*(commit|rollback|begin)\s*;/im);
    }
    expect(() => fs.accessSync(racePath, fs.constants.X_OK)).not.toThrow();
  });

  it('contain no mention of an assistant or its maker, in the migrations, the scripts or this file', () => {
    const words = new RegExp(['clau' + 'de', 'anthro' + 'pic', 'open' + 'ai', 'chat' + 'gpt', 'copi' + 'lot', 'gem' + 'ini'].join('|'), 'i');
    for (const text of [SHARING, WORK, read('p2_sharing.sql'), read('p3_work.sql'), race, fs.readFileSync(__filename, 'utf8')]) {
      expect(text).not.toMatch(words);
    }
  });

  describe('race.sh, which commits its fixtures, only runs against a local database', () => {
    const run = (url?: string) => spawnSync('bash', [racePath], {
      env: url === undefined ? { PATH: process.env.PATH } : { PATH: process.env.PATH, PRO_TEST_DB_URL: url },
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
        'postgresql://postgres@127.0.0.1:1,db.invalid:5432/postgres',
        'postgresql://postgres@127.0.0.1@db.invalid/postgres',
        'host=db.invalid dbname=127.0.0.1',
      ]) {
        const r = run(url);
        expect({ url, status: r.status, refused: /refusing to run/.test(r.stderr) }).toEqual({ url, status: 1, refused: true });
      }
    });

    it('refuses to run without a URL', () => {
      const r = run();
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('PRO_TEST_DB_URL');
    });

    it('lets local addresses through its check (the check alone is run, nothing connects)', () => {
      const start = race.indexOf('case "$PRO_TEST_DB_URL" in postgres://*');
      const end = race.indexOf('unset PGHOSTADDR');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const guard = race.slice(start, end);
      for (const url of [
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        'postgres://postgres@localhost/postgres?sslmode=disable',
        'postgresql://postgres@[::1]:5432/postgres',
      ]) {
        const r = spawnSync('bash', ['-c', `set -eu\n${guard}\necho passed`], {
          env: { PATH: process.env.PATH, PRO_TEST_DB_URL: url }, encoding: 'utf8',
        });
        expect({ url, out: r.stdout.trim(), err: r.stderr.trim() }).toEqual({ url, out: 'passed', err: '' });
      }
    });

    it('covers the races of 9.2', () => {
      for (const scenario of ['redeem', 'revoke', 'close', 'accepting', 'confirm', 'end', 'retry', 'cap', 'refresh']) {
        expect(race).toContain(`if selected ${scenario}; then`);
      }
      for (const call of ['redeem_pro_invite', 'revoke_pro_invite', 'close_stylist_profile', 'set_stylist_accepting', 'respond_pro_appointment',
        'set_pro_grant', 'send_pro_message', 'end_pro_connection']) {
        expect(race).toContain(call);
      }
    });
  });
});
