/**
 * proService.ts and the migrations must agree on every function (documentation/design/pro-accounts.md 4.6, 9.3):
 * PostgREST matches arguments by NAME, so a renamed or missing one fails on every installed build, and a column the
 * mappers read that the server stopped returning blanks a screen with every suite green. This reads the service and the
 * migrations as text and compares them, the way swapMigrations.test.ts reads its files.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../src/config/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() } }));

import { PRO_RPC_COLUMNS, PRO_RPC_MAPPERS, PRO_RPC_NESTED } from '../src/services/proService';
import { readProAll, type ProMigration } from '../supabase/tests/pro/migrationFiles';

const root = path.join(__dirname, '..');
// The files are found by name, not by their digits: the release renames them (pro-accounts.md 3.1, 11.1 P3).
const PRO_NAMES: ProMigration[] = ['foundation', 'upkeep', 'profiles_invites', 'connections', 'sharing', 'work', 'moderation'];
const CLIENT_NAMES = PRO_NAMES.slice(2);
const ALL_SQL = readProAll(PRO_NAMES);
const CLIENT_SQL = readProAll(CLIENT_NAMES);
const SERVICE = fs.readFileSync(path.join(root, 'src', 'services', 'proService.ts'), 'utf8');

const code = (sql: string): string => sql.replace(/--[^\n]*/g, '');

interface SqlFunction { name: string; args: string[]; required: string[]; columns: string[] | null; returns: string; text: string }

/** Every function a text defines: its argument names (without defaults), which of them have none, and its returns. */
const functionsOf = (sql: string): SqlFunction[] => {
  const out: SqlFunction[] = [];
  const text = code(sql);
  for (const m of text.matchAll(/create or replace function public\.(\w+)\(/g)) {
    const start = m.index!;
    const end = text.indexOf('\n$$;', start) + 4;
    const def = text.slice(start, end);
    const open = def.indexOf('(');
    let depth = 0;
    let close = open;
    for (let i = open; i < def.length; i += 1) {
      if (def[i] === '(') {depth += 1;}
      if (def[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
    }
    const params: string[] = [];
    let level = 0;
    let cur = '';
    for (const ch of def.slice(open + 1, close)) {
      if (ch === '(') {level += 1;}
      if (ch === ')') {level -= 1;}
      if (ch === ',' && level === 0) { params.push(cur.trim()); cur = ''; } else {cur += ch;}
    }
    if (cur.trim()) {params.push(cur.trim());}
    const table = /returns table \(([\s\S]*?)\)\s*language/.exec(def);
    out.push({
      name: m[1],
      args: params.map(p => p.split(/\s+/)[0]),
      required: params.filter(p => !/\bdefault\b/i.test(p)).map(p => p.split(/\s+/)[0]),
      columns: table ? table[1].split(',').map(c => c.trim().split(/\s+/)[0]) : null,
      returns: /returns\s+(table|jsonb|void|integer|boolean|text|trigger)/.exec(def)?.[1] ?? '',
      text: def,
    });
  }
  return out;
};

/** The calls proService.ts makes: the function name and the p_ keys of the object it passes (none when it passes none). */
const serviceCalls = (): { fn: string; args: string[] }[] => {
  const out: { fn: string; args: string[] }[] = [];
  const re = /\bcall(?:<[^>]*>)?\(\s*'([a-z_]+)'\s*(,\s*\{)?/g;
  for (let m = re.exec(SERVICE); m; m = re.exec(SERVICE)) {
    if (!m[2]) { out.push({ fn: m[1], args: [] }); continue; }
    let depth = 1;
    let top = '';
    for (let i = m.index + m[0].length; i < SERVICE.length; i += 1) {
      const ch = SERVICE[i];
      if (ch === '{') {depth += 1;}
      else if (ch === '}') { depth -= 1; if (depth === 0) {break;} }
      else if (depth === 1) {top += ch;}
    }
    out.push({ fn: m[1], args: [...top.matchAll(/\b(p_[a-z_]+)\s*:/g)].map(k => k[1]) });
  }
  return out;
};

/** The functions granted to authenticated in the client files, by name. */
const grantedToAuthenticated = (): string[] => {
  const names: string[] = [];
  for (const block of code(CLIENT_SQL).matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)) {
    if (block[2].includes('to authenticated')) {names.push(...[...block[1].matchAll(/'public\.(\w+)\(/g)].map(m => m[1]));}
  }
  return names;
};

const sql = functionsOf(CLIENT_SQL);
const bySql = new Map(sql.map(f => [f.name, f]));
const calls = serviceCalls();

/**
 * The keys each `jsonb_build_object(...)` call of a text builds directly (not the keys of the objects inside it), one
 * list per call. Strings are skipped over, so a comma or a bracket inside one does not confuse it.
 */
const builders = (text: string): string[][] => {
  const out: string[][] = [];
  const start = /jsonb_build_object\(/g;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    let depth = 1;
    let arg = '';
    let inString = false;
    const args: string[] = [];
    for (let i = m.index + m[0].length; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        arg += ch;
        if (ch === "'") {
          if (text[i + 1] === "'") { arg += "'"; i += 1; } else { inString = false; }
        }
        continue;
      }
      if (ch === "'") { inString = true; arg += ch; continue; }
      if (ch === '(') { depth += 1; }
      if (ch === ')') { depth -= 1; if (depth === 0) { break; } }
      if (ch === ',' && depth === 1) { args.push(arg.trim()); arg = ''; continue; }
      arg += ch;
    }
    args.push(arg.trim());
    out.push(args.filter((_, k) => k % 2 === 0).map(a => /^'(\w+)'$/.exec(a)?.[1]).filter((k): k is string => Boolean(k)));
  }
  return out;
};

describe('proService.ts and the pro migrations', () => {
  it('define no function twice, across all the pro files', () => {
    const names = functionsOf(ALL_SQL).map(f => f.name);
    expect(names.length).toBeGreaterThan(70);
    expect(new Set(names).size).toBe(names.length);
  });

  it('call only functions the migrations define, with the same set of argument names', () => {
    expect(calls.length).toBeGreaterThanOrEqual(36);
    for (const c of calls) {
      const f = bySql.get(c.fn);
      expect({ fn: c.fn, defined: Boolean(f) }).toEqual({ fn: c.fn, defined: true });
      expect({ fn: c.fn, args: [...c.args].sort() }).toEqual({ fn: c.fn, args: [...f!.args].sort() });
      for (const a of c.args) {expect(a).toMatch(/^p_[a-z_]+$/);}
      for (const r of f!.required) {expect({ fn: c.fn, sends: c.args.includes(r) }).toEqual({ fn: c.fn, sends: true });}
    }
  });

  it('call each function once, and every client function of 4.6 is called by the service', () => {
    const called = calls.map(c => c.fn);
    expect(new Set(called).size).toBe(called.length);
    const client = grantedToAuthenticated().filter(n => n !== 'report_swap_content');
    expect(client).toHaveLength(36);
    expect([...called].sort()).toEqual([...client].sort());
  });

  it('never call a function an app user may not execute', () => {
    const callable = new Set(grantedToAuthenticated());
    for (const c of calls) {expect({ fn: c.fn, callable: callable.has(c.fn) }).toEqual({ fn: c.fn, callable: true });}
    for (const internal of ['pro_photo_source', 'pro_janitor', 'pro_refresh', 'pro_set_enabled', 'pro_admin_suspend', 'pro_gate']) {
      expect(calls.map(c => c.fn)).not.toContain(internal);
    }
    expect(SERVICE).not.toMatch(/\.from\(\s*'(pro_|stylist_|appointments|recommendations|message)/);      // no table is read
  });

  it('read the columns the server returns: PRO_RPC_COLUMNS equals the returns table lists, in order', () => {
    const tables = sql.filter(f => f.columns && calls.some(c => c.fn === f.name));
    expect(tables.map(f => f.name).sort()).toEqual(['get_client_closet', 'list_my_pro_invites', 'list_pro_appointments', 'list_pro_blocks',
      'list_pro_connections', 'list_pro_recommendations']);
    for (const f of tables) {expect({ fn: f.name, columns: [...(PRO_RPC_COLUMNS[f.name] ?? [])] }).toEqual({ fn: f.name, columns: f.columns });}
  });

  it('read keys the jsonb functions build, wherever in the answer they are built', () => {
    // functions that answer by calling another one
    const delegate: Record<string, string> = { set_pro_grant: 'get_pro_grant', save_stylist_profile: 'get_my_stylist_profile' };
    const jsonb = sql.filter(f => f.returns === 'jsonb' && calls.some(c => c.fn === f.name));
    expect(jsonb.length).toBeGreaterThanOrEqual(14);
    for (const f of jsonb) {
      const text = f.text + (delegate[f.name] ? bySql.get(delegate[f.name])!.text : '');
      const columns = PRO_RPC_COLUMNS[f.name];
      expect({ fn: f.name, listed: Boolean(columns) }).toEqual({ fn: f.name, listed: true });
      for (const key of columns) {expect({ fn: f.name, key, built: text.includes(`'${key}'`) }).toEqual({ fn: f.name, key, built: true });}
    }
  });

  it('read the nested keys the jsonb functions build too: closet.*, actions.*, counts.*, stylist.*, versions.*, client.*, items[].*, events[].*, messages[].*, feedback.*', () => {
    const delegate: Record<string, string> = { set_pro_grant: 'get_pro_grant' };
    expect(Object.keys(PRO_RPC_NESTED).sort()).toEqual(['get_pro_connection', 'get_pro_grant', 'get_pro_recommendation', 'get_pro_status', 'get_pro_thread', 'preview_pro_invite', 'set_pro_grant']);
    for (const [fn, parts] of Object.entries(PRO_RPC_NESTED)) {
      const f = bySql.get(fn)!;
      expect({ fn, defined: Boolean(f) }).toEqual({ fn, defined: true });
      const calls = builders(code(f.text + (delegate[fn] ? bySql.get(delegate[fn])!.text : '')));
      for (const [part, keys] of Object.entries(parts)) {
        expect({ fn, part, topLevel: PRO_RPC_COLUMNS[fn].includes(part) }).toEqual({ fn, part, topLevel: true });
        // some jsonb_build_object call of the function builds the part, with every key the mapper reads from it
        const built = calls.some(direct => keys.every(k => direct.includes(k)));
        expect({ fn, part, keys, built }).toEqual({ fn, part, keys, built: true });
      }
    }
  });

  it('list every function that answers with something, and no other, and give each a mapper', () => {
    const answering = sql.filter(f => calls.some(c => c.fn === f.name) && f.returns !== 'void' && f.name !== 'get_pro_badge');
    expect(Object.keys(PRO_RPC_COLUMNS).sort()).toEqual(answering.map(f => f.name).sort());
    expect(Object.keys(PRO_RPC_MAPPERS).sort()).toEqual(Object.keys(PRO_RPC_COLUMNS).sort());
    for (const mapper of Object.values(PRO_RPC_MAPPERS)) {expect(typeof mapper).toBe('function');}
  });

  it('send the same argument names the SQL declares for the functions that take a connection, a code or a version', () => {
    const args = (fn: string) => calls.find(c => c.fn === fn)!.args;
    expect(args('set_pro_grant')).toEqual(['p_connection', 'p_scope', 'p_enabled', 'p_item_mode', 'p_item_ids', 'p_text_version', 'p_renew']);
    expect(args('accept_pro_terms')).toEqual(['p_role', 'p_version', 'p_adult']);
    expect(args('redeem_pro_invite')).toEqual(['p_code', 'p_alias']);
    expect(args('report_pro_content')).toEqual(['p_ref_type', 'p_ref_id', 'p_reason', 'p_details', 'p_message_id']);
    expect(args('block_pro_member')).toEqual(['p_connection', 'p_invite']);
    expect(args('unblock_pro_member')).toEqual(['p_ref']);
    expect(args('get_pro_status')).toEqual([]);
    expect(args('export_my_pro_data')).toEqual([]);
  });
});
