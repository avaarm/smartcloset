/**
 * Reads the professional-accounts migration 8 (moderation: widened report lists, report_swap_content with an evidence
 * budget, the client functions for reports, blocks and the export, the admin functions and the two queue views) as text
 * and checks the rules every function in it must keep. The behaviour itself is checked by the BEGIN ... ROLLBACK scripts
 * p4_edges, p5_deletion, p6_moderation and p7_catalog in supabase/tests/pro, and by the swap scripts, which run after
 * this file replaces report_swap_content.
 */
import fs from 'fs';
import path from 'path';
import { proComesBefore, proFile, proMigrationFiles, readPro, readProAll, type ProMigration } from '../supabase/tests/pro/migrationFiles';

const root = path.join(__dirname, '..');
const dir = path.join(root, 'supabase', 'migrations');
const testDir = path.join(root, 'supabase', 'tests', 'pro');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

// Found by name, not by digits: the release renames the pro files (pro-accounts.md 3.1, 11.1 P3).
const FILE = proFile('moderation');
const EARLIER_PRO: ProMigration[] = ['foundation', 'upkeep', 'profiles_invites', 'connections', 'sharing', 'work'];
const SQL = readPro('moderation');
const FOUNDATION = readPro('foundation');
const earlier = readProAll(EARLIER_PRO);
const SWAP_MODERATION = read('supabase', 'migrations', '20261015000400_swap_moderation.sql');
const SWAP_FOUNDATION = read('supabase', 'migrations', '20261015000100_swap_foundation.sql');
const FRIEND_MODERATION = read('supabase', 'migrations', '20261006000000_friend_moderation.sql');

/** The statements of a SQL text with the comments taken out. */
const code = (sql: string): string => sql.replace(/--[^\n]*/g, '');
/** The code with comments out and every run of white space made one space, for matching an expression. */
const flat = (sql: string): string => code(sql).replace(/\s+/g, ' ').trim();

/** The whole definition of a function (up to its closing `$$;`). */
const definition = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start === -1) {throw new Error(`${name} is not defined`);}
  return sql.slice(start, sql.indexOf('\n$$;', start) + 4);
};

/** The parameter list of a function, split at top level: ["p_ref_type text", "p_details text default null", ...]. */
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

/** Names listed in `foreach f in array array[ ... ] loop ... end loop;` blocks, with what each block does to them. */
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
/** A trimmed copy of the scanner of migrationSafeUpdate.test.ts: an UPDATE or DELETE without a WHERE of its own. */
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

/** The quoted words of a list: `('a', 'b')` gives ['a', 'b']. */
const words = (list: string): string[] => [...list.matchAll(/'(\w+)'/g)].map(m => m[1]);

/** The functions of this file, in order, and the arguments of each as 4.6 and 4.7 fix them. `required` have no default. */
const SPEC: Record<string, { args: string[]; required: number }> = {
  report_swap_content: { args: ['p_ref_type', 'p_ref_id', 'p_reason', 'p_details', 'p_message_id'], required: 3 },
  pro_chat_evidence: { args: ['p_connection', 'p_reporter', 'p_flagged', 'p_qualified'], required: 4 },
  report_pro_content: { args: ['p_ref_type', 'p_ref_id', 'p_reason', 'p_details', 'p_message_id'], required: 3 },
  block_pro_member: { args: ['p_connection', 'p_invite'], required: 0 },
  list_pro_blocks: { args: [], required: 0 },
  unblock_pro_member: { args: ['p_ref'], required: 1 },
  export_my_pro_data: { args: [], required: 0 },
  pro_set_enabled: { args: ['p_on'], required: 1 },
  pro_admin_approve_stylist: { args: ['p_user'], required: 1 },
  pro_admin_hold_stylist: { args: ['p_user'], required: 1 },
  pro_admin_release_stylist: { args: ['p_user'], required: 1 },
  pro_admin_suspend: { args: ['p_user', 'p_reason'], required: 2 },
  pro_admin_unsuspend: { args: ['p_user'], required: 1 },
  pro_admin_remove_stylist: { args: ['p_user', 'p_reason'], required: 2 },
  pro_admin_restore_stylist: { args: ['p_user'], required: 1 },
  pro_report_backlog: { args: ['p_older_than'], required: 0 },
  pro_send_report_digest: { args: ['p_older_than'], required: 0 },
};
const ORDER = Object.keys(SPEC);
const CLIENT = ['report_pro_content', 'block_pro_member', 'list_pro_blocks', 'unblock_pro_member', 'export_my_pro_data'];
const ADMIN = ['pro_set_enabled', 'pro_admin_approve_stylist', 'pro_admin_hold_stylist', 'pro_admin_release_stylist', 'pro_admin_suspend',
  'pro_admin_unsuspend', 'pro_admin_remove_stylist', 'pro_admin_restore_stylist', 'pro_report_backlog', 'pro_send_report_digest'];
const REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'scam', 'unsafe', 'underage', 'false_credentials', 'data_misuse',
  'unsafe_meeting', 'other'];
/** 4.4: the messages this file may raise, with the SQLSTATE they have there. */
const ERRORS: Record<string, string> = {
  not_authenticated: '28000', pro_unavailable: '22023', invalid_request: '22023', invalid_report: '22023', text_not_allowed: '22023',
  pro_rate_limited: '54000', report_rate_limited: '54000',
};

describe('pro migration 8: moderation', () => {
  it('exists and sorts after the seven before it', () => {
    expect(fs.existsSync(path.join(dir, FILE))).toBe(true);
    for (const f of EARLIER_PRO) {expect(proComesBefore(f, 'moderation')).toBe(true);}
    expect(proMigrationFiles().pop()).toBe(FILE);
  });

  it('defines exactly the seventeen functions, each once, in this order, and the two views', () => {
    const defined = [...code(SQL).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    expect(defined).toEqual(ORDER);
    expect(new Set(defined).size).toBe(defined.length);                                    // nothing overloaded
    const inEarlier = [...code(earlier).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    for (const name of ORDER.filter(n => n !== 'report_swap_content')) {expect(inEarlier).not.toContain(name);}   // no name twice across the pro files
    expect([...code(SQL).matchAll(/create or replace view public\.(\w+)/g)].map(m => m[1])).toEqual(['pro_moderation_queue', 'pro_review_queue']);
    expect(code(SQL)).not.toMatch(/create table|create index|create trigger|create policy|alter policy|drop policy/i);
  });

  it('takes the arguments of 4.6 and 4.7 by name, the optional ones defaulted, none renamed', () => {
    for (const [name, spec] of Object.entries(SPEC)) {
      const params = parameters(definition(SQL, name));
      expect(params.map(p => p.split(/\s+/)[0])).toEqual(spec.args);
      expect(params.map(p => /\bdefault\b/i.test(p))).toEqual(spec.args.map((_, i) => i >= spec.required));
      for (const p of params) {expect(p).toMatch(/^p_[a-z_]+ /);}
    }
    const sig = (name: string) => parameters(definition(SQL, name)).join(', ').replace(/\s+/g, ' ');
    expect(sig('report_pro_content')).toBe('p_ref_type text, p_ref_id uuid, p_reason text, p_details text default null, p_message_id bigint default null');
    expect(sig('block_pro_member')).toBe('p_connection uuid default null, p_invite uuid default null');
    expect(sig('pro_report_backlog')).toBe("p_older_than interval default interval '4 hours'");
    expect(sig('pro_send_report_digest')).toBe("p_older_than interval default interval '4 hours'");
  });

  it('pins search_path and runs as the owner on every function', () => {
    for (const name of ORDER) {
      const def = definition(SQL, name);
      const header = def.slice(0, def.indexOf('as $$'));
      expect(header).toContain('security definer');
      expect(header).toContain('set search_path = public');
    }
  });

  it('returns the columns of 4.6 and 4.7, with the column-wins pragma where a table is returned', () => {
    const tableOf = (name: string) => {
      const m = /returns table \(([\s\S]*?)\)\s*language/.exec(definition(SQL, name))!;
      return m[1].split(',').map(c => c.trim());
    };
    expect(tableOf('list_pro_blocks')).toEqual(['ref uuid', 'label text', 'blocked_at timestamptz']);
    expect(tableOf('pro_report_backlog')).toEqual(['waiting integer', 'oldest_hours integer']);
    expect(definition(SQL, 'list_pro_blocks')).toContain('#variable_conflict use_column');
  });

  it('grants the five client functions to authenticated after revoking from public and anon, and no others', () => {
    const blocks = grantBlocks(code(SQL));
    const authenticated = blocks.filter(b => b.grant === 'authenticated');
    expect(authenticated).toHaveLength(2);                                                  // the five, and swap's own report function
    expect(authenticated.map(b => b.revoke)).toEqual([['public', 'anon'], ['public', 'anon']]);
    expect(authenticated[0].functions.map(f => f.name)).toEqual(CLIENT);
    expect(authenticated[1].functions.map(f => f.name)).toEqual(['report_swap_content']);
    for (const f of [...authenticated[0].functions, ...authenticated[1].functions]) {
      const types = parameters(definition(SQL, f.name)).map(p => p.replace(/\s+default\b[\s\S]*$/i, '').trim().split(/\s+/).slice(1).join(' '));
      expect(f.signature.split(',').map(s => s.trim()).filter(Boolean)).toEqual(types);
    }
    expect(code(SQL)).not.toMatch(/\bto\s+(anon|public)\b/i);
  });

  it('grants the ten admin functions to the service role only, and the evidence builder to nobody', () => {
    const blocks = grantBlocks(code(SQL));
    const service = blocks.filter(b => b.grant === 'service_role');
    expect(service).toHaveLength(1);
    expect(service[0].revoke).toEqual(['public', 'anon', 'authenticated']);
    expect(service[0].functions.map(f => f.name)).toEqual(ADMIN);
    for (const f of service[0].functions) {
      const types = parameters(definition(SQL, f.name)).map(p => p.replace(/\s+default\b[\s\S]*$/i, '').trim().split(/\s+/).slice(1).join(' '));
      expect(f.signature.split(',').map(s => s.trim()).filter(Boolean)).toEqual(types);
    }
    const nobody = blocks.filter(b => b.grant === null);
    expect(nobody).toHaveLength(1);
    expect(nobody[0].revoke).toEqual(['public', 'anon', 'authenticated']);
    expect(nobody[0].functions.map(f => f.name)).toEqual(['pro_chat_evidence']);
    // every function of the file is in exactly one block
    const listed = blocks.flatMap(b => b.functions.map(f => f.name));
    expect([...listed].sort()).toEqual([...ORDER].sort());
  });

  it('closes both views to app users and opens them to the service role', () => {
    for (const view of ['pro_moderation_queue', 'pro_review_queue']) {
      expect(code(SQL)).toContain(`revoke all on public.${view} from public, anon, authenticated;`);
      expect(code(SQL)).toContain(`grant select on public.${view} to service_role;`);
    }
    expect(code(SQL)).not.toMatch(/grant select on public\.\w+ to (anon|authenticated|public)/);
  });

  it('gives the moderation queue the columns of 4.7 and puts safety reasons first', () => {
    const view = flat(SQL.slice(SQL.indexOf('create or replace view public.pro_moderation_queue'), SQL.indexOf('create or replace view public.pro_review_queue')));
    const select = view.slice(view.indexOf('select') + 6, view.indexOf(' from '));
    const columns = select.split(/,(?![^()]*\))/).map(c => c.trim().replace(/^.* as /, '').replace(/^cr\./, ''));
    expect(columns).toEqual(['id', 'created_at', 'context', 'reason', 'details', 'ref_type', 'ref_id', 'reporter_id', 'reported_user_id', 'evidence',
      'qualified', 'reviewed_at', 'outcome']);
    expect(view).toContain("cr.context in ('pro_profile', 'pro_chat', 'pro_content') and cr.reviewed_at is null");
    expect(view).toContain("order by (cr.reason in ('underage', 'unsafe_meeting', 'unsafe', 'harassment')) desc, cr.created_at");
    const review = flat(SQL.slice(SQL.indexOf('create or replace view public.pro_review_queue')));
    expect(review).toContain('m.stylist_approved_at is null and m.stylist_removed_at is null');
    expect(review).toContain('active_clients');
  });
});

describe('pro migration 8: the report lists and report_swap_content', () => {
  const pick = (sql: string, re: RegExp): string[] => {
    const m = re.exec(sql);
    return m ? words(m[1]) : [];
  };
  const lists = (sql: string) => ({
    context: pick(sql, /content_reports_context_check\s+check \(context in \(([^)]*)\)/),
    reason: pick(sql, /content_reports_reason_check\s+check \(reason in \(([^)]*)\)/),
    refType: pick(sql, /content_reports_ref_type_check\s+check \(ref_type is null or ref_type in \(([^)]*)\)/),
  });

  it('widens the three lists to supersets of every list that came before, with exactly the pro values added', () => {
    const now = lists(SQL);
    const swap = lists(SWAP_MODERATION);
    expect(swap.context.length).toBeGreaterThan(0);
    for (const v of swap.context) {expect(now.context).toContain(v);}
    for (const v of swap.reason) {expect(now.reason).toContain(v);}
    const friend = words(/context in \(([^)]*)\)/.exec(FRIEND_MODERATION)![1]);
    for (const v of friend) {expect(now.context).toContain(v);}
    for (const v of words(/reason in \(([^)]*)\)/.exec(FRIEND_MODERATION)![1])) {expect(now.reason).toContain(v);}
    const foundationRefs = words(/content_reports_ref_type_check\s+check \(ref_type is null or ref_type in \(([^)]*)\)/.exec(SWAP_FOUNDATION)![1]);
    for (const v of foundationRefs) {expect(now.refType).toContain(v);}
    expect(now.context.filter(v => !swap.context.includes(v))).toEqual(['pro_profile', 'pro_chat', 'pro_content']);
    expect(now.reason.filter(v => !swap.reason.includes(v))).toEqual(['underage', 'false_credentials', 'data_misuse', 'unsafe_meeting']);
    expect(now.refType.filter(v => !foundationRefs.includes(v))).toEqual(['connection', 'recommendation', 'appointment', 'invite']);
    expect(code(SQL)).toContain('alter table public.content_reports drop constraint if exists content_reports_context_check;');
    expect(code(SQL)).not.toMatch(/alter table public\.content_reports add column/);        // no column is added
  });

  it('keeps report_user as it was: not redefined, and the sources of the other live functions are untouched', () => {
    for (const name of ['report_user', 'block_user', 'delete_user_account', 'get_friend_closet', 'find_user_by_email', 'is_blocked_between',
      'friend_display_name', 'are_friends', 'swap_fold_text']) {
      expect(code(SQL)).not.toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
    }
    // what this file uses of swap: four of its functions and four of its tables, all inside report_swap_content; the rest of the file
    // reads only the term list
    const swapCalls = [...code(SQL).matchAll(/public\.(swap_\w+)\(/g)].map(m => m[1]);
    expect([...new Set(swapCalls)].sort()).toEqual(['swap_close', 'swap_limit', 'swap_raise', 'swap_resolve_ref']);
    const outside = code(SQL.replace(definition(SQL, 'report_swap_content'), ''));
    expect([...new Set([...outside.matchAll(/public\.(swap\w*)/g)].map(m => m[1]))]).toEqual(['swap_blocked_terms']);
    expect([...new Set([...code(definition(SQL, 'report_swap_content')).matchAll(/public\.(swaps?(?:_\w+)?)\b(?!\()/g)].map(m => m[1]))].sort())
      .toEqual(['swap_items', 'swap_listings', 'swap_messages', 'swaps']);
  });

  it('re-creates report_swap_content with the same signature, return type, language and grants as swap\'s own', () => {
    const header = (def: string) => def.slice(0, def.indexOf('as $$')).replace(/\s+/g, ' ').trim();
    expect(header(definition(SQL, 'report_swap_content'))).toBe(header(definition(SWAP_MODERATION, 'report_swap_content')));
    const swapGrant = grantBlocks(code(SWAP_MODERATION)).find(b => b.functions.some(f => f.name === 'report_swap_content'))!;
    expect(swapGrant.grant).toBe('authenticated');
    expect(swapGrant.revoke).toEqual(['public', 'anon']);
    const mine = grantBlocks(code(SQL)).find(b => b.functions.some(f => f.name === 'report_swap_content'))!;
    expect(mine.grant).toBe('authenticated');
    expect(mine.revoke).toEqual(swapGrant.revoke);
    expect(mine.functions.find(f => f.name === 'report_swap_content')!.signature)
      .toBe(swapGrant.functions.find(f => f.name === 'report_swap_content')!.signature);
  });

  it('changes nothing in report_swap_content but the evidence of a swap chat', () => {
    const body = (def: string) => flat(def.slice(def.indexOf('as $$') + 5));
    const strip = (text: string) => {
      const from = text.indexOf("ctx := 'swap_chat';");
      const to = text.indexOf('end if; insert into public.content_reports');
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      return text.slice(0, from) + '<<CHAT>> ' + text.slice(to);
    };
    const oldBody = strip(body(definition(SWAP_MODERATION, 'report_swap_content')));
    const newBody = strip(body(definition(SQL, 'report_swap_content'))).replace('msgs jsonb; n integer := 30; ', '');
    expect(newBody).toBe(oldBody);
  });

  it('builds that evidence under the byte budget, with the flagged message kept, the literals swap needs and the keys it reads', () => {
    const def = flat(definition(SQL, 'report_swap_content'));
    const chat = def.slice(def.indexOf("ctx := 'swap_chat';"), def.indexOf('end if; insert into public.content_reports'));
    expect(chat).toContain('left(m.body, 300)');
    expect(chat).toContain('pg_column_size(ev || jsonb_build_object(\'messages\', msgs)) <= 18000');
    expect(chat).toContain('m.id = p_message_id or m.id in (select m2.id from public.swap_messages m2 where m2.swap_id = p_ref_id order by m2.id desc limit n)');
    expect(chat).toContain('n := greatest(1, n - 3);');
    for (const key of ["'id', m.id", "'from', case", "'body', left(m.body, 300)", "'code', m.code", "'at', m.created_at"]) {expect(chat).toContain(key);}
    expect(chat).not.toContain("'who'");
    for (const key of ["'status', s.status", "'closedReason', s.closed_reason", "'pairKind', s.pair_kind", "'createdAt', s.created_at", "'items'", "'flaggedMessageId', p_message_id"]) {
      expect(chat).toContain(key);
    }
    expect(def).not.toMatch(/pro_/);                                                          // swap depends on no pro function
  });
});

describe('pro migration 8: report_pro_content', () => {
  const def = definition(SQL, 'report_pro_content');
  const text = flat(def);

  it('is a way out: the safety gate and no other', () => {
    expect(text).toContain("perform public.pro_gate(uid, 'safety');");
    expect(text).not.toMatch(/pro_gate\(uid, '(member|client|stylist)/);
    expect(text.indexOf("pro_gate(uid, 'safety')")).toBeLessThan(text.indexOf('insert into public.content_reports'));
  });

  it('takes the eleven reasons and the four reference types of 6.4, and nothing else', () => {
    const reasons = words(/p_reason not in \(([^)]*)\)/.exec(text)![1]);
    expect(reasons).toEqual(REASONS);
    expect(words(/p_ref_type not in \(([^)]*)\)/.exec(text)![1])).toEqual(['connection', 'recommendation', 'appointment', 'invite']);
    expect(reasons).not.toContain('not_as_described');                                        // that one is swap's
    expect(text).toContain("ctx := case when p_ref_type = 'connection' and p_message_id is not null then 'pro_chat' when p_ref_type in ('connection', 'invite') then 'pro_profile' else 'pro_content' end;");
  });

  it('resolves the reported person on the server, hides a draft from the client, and never hands the app an account id', () => {
    expect(text).toContain("(k.stylist_id = uid or (k.client_id = uid and r.status <> 'draft'))");
    expect(text).toContain('if not found or inv.stylist_id = uid then perform public.pro_raise(\'pro_unavailable\', \'22023\');');
    expect(text).toContain("m.id = p_message_id and m.connection_id = c.id and m.kind = 'text' and m.sender_id = other");
    expect(text).toContain('if other is null then perform public.pro_raise(\'pro_unavailable\', \'22023\');');
    // nothing is returned: the answer is void
    expect(def.slice(0, def.indexOf('as $$'))).toContain('returns void');
    // the evidence names no account: no user id or email column is read into it
    const evidence = text.slice(text.indexOf('if not folded then'), text.indexOf('insert into public.content_reports'));
    const keys = [...evidence.matchAll(/'([A-Za-z0-9]+)',/g)].map(m => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) {expect(k).not.toMatch(/^(email|phone|userId|stylistId|clientId|reporterId|senderId|accountId|path|photoPath)$/i);}
    expect(evidence).not.toMatch(/\b(s|c|rec|appt|inv)\.(user_id|stylist_id|client_id|sender_id)\b(?! =)/);
  });

  it('shares the daily limit with report_user and folds only an identical report, never a serious one', () => {
    expect(text).toContain("created_at > now() - interval '1 day') >= public.pro_limit('reports_day') then perform public.pro_raise('report_rate_limited', '54000');");
    expect(text).toContain("if p_reason not in ('underage', 'unsafe_meeting', 'unsafe', 'harassment') and exists (select 1 from public.content_reports cr where cr.reporter_id = uid and cr.ref_type = p_ref_type and cr.ref_id = p_ref_id and cr.reason = p_reason and coalesce(cr.evidence ->> 'flaggedMessageId', '0') = coalesce(p_message_id::text, '0') and cr.created_at > now() - interval '7 days') then folded := true;");
    expect(text.indexOf('report_rate_limited')).toBeLessThan(text.indexOf('folded := true'));
  });

  it('does not filter the details (a person reporting a scam must be able to quote it), strips control characters, cuts them to 500 characters, and takes the person lock before the limit', () => {
    expect(text).toContain("clean text := left(nullif(regexp_replace(regexp_replace(coalesce(p_details, ''), '[\\u0001-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f]', '', 'g'), '^\\s+|\\s+$', '', 'g'), ''), 500);");
    expect(text).not.toContain("pro_require_text(clean");
    expect(text).not.toMatch(/pro_require_text\([^)]*'details'/);
    expect(text).not.toContain("pro_text_ok(clean");
    expect(text.indexOf('pro_lock_users(uid, other)')).toBeLessThan(text.indexOf('report_rate_limited'));
  });

  it('stores the qualified flag decided now, never for an invite, and counts only qualified reporters toward the hold', () => {
    expect(text).toContain("if p_ref_type <> 'invite' then qualified := public.pro_report_is_qualified(uid, other); end if;");
    expect(text).toContain("'qualified', qualified");
    expect(text).toContain("cr.evidence ->> 'qualified' = 'true') >= public.pro_limit('reports_to_hold_stylist')");
    expect(text).toContain("cr.created_at > now() - make_interval(days => public.pro_limit('report_window_days'))");
    expect(text).toContain("update public.pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now() where user_id = other and (invites_held_at is null or invites_held_by = 'system');");
    expect(text).toContain("cr.context in ('pro_profile', 'pro_chat', 'pro_content')");
  });

  it('builds a chat report with the budgeted helper and every other report from its own fields, guarded by a size check', () => {
    expect(text).toContain('ev := public.pro_chat_evidence(c.id, uid, p_message_id, qualified)');
    expect(text).toContain("if pg_column_size(ev) > public.pro_limit('evidence_bytes') then");
    const helper = flat(definition(SQL, 'pro_chat_evidence'));
    expect(helper).toContain("left(t.body, public.pro_limit('evidence_body_chars'))");
    expect(helper).toContain("exit when pg_column_size(ev) <= public.pro_limit('evidence_bytes') or n <= 1;");
    expect(helper).toContain('m.id = p_flagged or m.id in (select m2.id from public.pro_messages m2 where m2.connection_id = p_connection order by m2.id desc limit n)');
    expect(helper).toContain("'who', case when t.kind = 'system' then 'system' when t.sender_id = p_reporter then 'reporter' else 'reported' end");
    expect(helper).toContain('n := greatest(1, n - 3);');
  });

  it('stops a client\'s own sharing for the four serious reasons, in the same call, and tells the stylist nothing', () => {
    const effect = text.slice(text.indexOf("if have_c and me = 'client' and p_reason in"));
    expect(effect).toContain("p_reason in ('harassment', 'data_misuse', 'unsafe_meeting', 'underage')");
    expect(effect).toContain('for update');
    expect(effect).toContain('delete from public.pro_grant_items where connection_id = c.id and connection_id in (select k.id from public.pro_connections k where k.client_id = uid);');
    expect(effect).toContain("delete from public.pro_grants where connection_id = c.id and scope = 'closet' and connection_id in (select k.id from public.pro_connections k where k.client_id = uid);");
    expect(effect).toContain("insert into public.pro_grant_events (connection_id, scope, event) values (c.id, 'closet', 'revoked');");
    expect(effect).not.toMatch(/pro_messages|last_activity_at/);                                // no system line, the connection does not move
  });
});

describe('pro migration 8: blocks, the list, the export', () => {
  it('blocks in the order that keeps the block out of the old list: the pro row, then the friendship, then the connections', () => {
    const text = flat(definition(SQL, 'block_pro_member'));
    const order = ["pro_gate(uid, 'safety')", '(p_connection is null) = (p_invite is null)', 'pro_lock_users(uid, other)', 'for update;', "pro_rate_check(uid, 'block_day')",
      'insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_pro)', 'on conflict (blocker_id, blocked_id) do nothing',
      'if public.are_friends(uid, other) then perform public.block_user(other); end if;', 'perform public.pro_end_between(uid, other);'];
    const at = order.map(s => text.indexOf(s));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).toContain('values (uid, other, left(who, 40), true)');
    expect(text).not.toMatch(/email|raw_user_meta_data|friend_display_name/);                  // a label, never an email or a derived name
    expect(text).toContain("coalesce(s.display_name, 'Stylist')");
    expect(text).not.toMatch(/pro_gate\(uid, '(member|client|stylist)/);
  });

  it('lists and removes only pro blocks, under an opaque ref, through the safety gate', () => {
    const list = flat(definition(SQL, 'list_pro_blocks'));
    expect(list).toContain("pro_gate(uid, 'safety')");
    expect(list).toContain('b.blocker_id = uid and b.via_pro');
    expect(list).toContain('select b.ref,');
    expect(list).not.toMatch(/blocked_id/);
    const unblock = flat(definition(SQL, 'unblock_pro_member'));
    expect(unblock).toContain("pro_gate(uid, 'safety')");
    expect(unblock).toContain('delete from public.user_blocks where ref = p_ref and blocker_id = uid and via_pro;');
  });

  it('exports the caller\'s own data in the shape of 8.2, through the safety gate, with no code, id or other person\'s words', () => {
    const def = definition(SQL, 'export_my_pro_data');
    const text = flat(def);
    expect(text).toContain("pro_gate(uid, 'safety')");
    const keys = [...text.matchAll(/'([A-Za-z0-9]+)',/g)].map(m => m[1]);
    for (const k of ['settings', 'stylistProfile', 'invites', 'connections', 'adultConfirmedAt', 'stylistTerms', 'clientTerms', 'suspended', 'grantHistory',
      'looks', 'sessions', 'myMessages', 'otherLabel', 'role', 'status', 'startedAt', 'endedAt']) {expect(keys).toContain(k);}
    for (const k of keys) {expect(k).not.toMatch(/^(email|phone|code|userId|stylistId|clientId|accountId|path|photoPath|price|cost|notes|label)$/);}
    expect(text).not.toMatch(/\bi\.code\b|\bu\.email\b|raw_user_meta_data|\bsender_id,|c\.stylist_id,|c\.client_id,/);
    expect(text).toContain("g.kind = 'text' and g.sender_id = uid");                          // only the caller's own messages
    expect(text).toContain("(c.stylist_id = uid or r.status <> 'draft')");                    // a client never receives a draft
    expect(text).toContain("case when c.client_id = uid then jsonb_build_object('grantHistory'");   // the grant history is the client's alone
  });
});

describe('pro migration 8: the admin functions', () => {
  it('turns the feature on only with fifty content terms loaded, and writes one boolean', () => {
    const text = flat(definition(SQL, 'pro_set_enabled'));
    expect(text).toContain("select count(*) from public.swap_blocked_terms where kind = 'content') < 50");
    expect(text).toContain("raise exception 'load at least 50 content terms into swap_blocked_terms first' using errcode = '55000';");
    expect(text).toContain("update public.pro_config set value = to_jsonb(p_on), updated_at = now() where key = 'pro_enabled';");
    expect(text).toContain("pro_raise('invalid_request', '22023', 'on')");
  });

  it('takes the person\'s lock before it decides anything about them', () => {
    for (const name of ['pro_admin_approve_stylist', 'pro_admin_hold_stylist', 'pro_admin_release_stylist', 'pro_admin_suspend', 'pro_admin_unsuspend',
      'pro_admin_remove_stylist', 'pro_admin_restore_stylist']) {
      const text = flat(definition(SQL, name));
      expect(text).toContain('perform public.pro_lock_users(p_user, p_user);');
      expect(text.indexOf('pro_lock_users')).toBeLessThan(text.search(/\b(insert|update|delete)\b/));
    }
  });

  it('keeps a hold on the person, an approval on the person, and a removal on the person, never on the profile row', () => {
    expect(flat(definition(SQL, 'pro_admin_approve_stylist'))).toContain('update public.pro_members set stylist_approved_at = now()');
    const hold = flat(definition(SQL, 'pro_admin_hold_stylist'));
    expect(hold).toContain("values (p_user, now(), 'admin')");
    expect(hold).toContain("invites_held_at = now(), invites_held_by = 'admin'");
    expect(flat(definition(SQL, 'pro_admin_release_stylist'))).toContain('set invites_held_at = null, invites_held_by = null');
    const remove = flat(definition(SQL, 'pro_admin_remove_stylist'));
    expect(remove).toContain('insert into public.pro_members (user_id, stylist_removed_at, stylist_removed_reason)');
    expect(remove).toContain("pro_end_connection(r.id, 'system')");
    expect(remove).toContain('delete from public.pro_invites where stylist_id = p_user;');
    expect(remove).toContain('delete from public.pro_stylists where user_id = p_user;');
    expect(remove).toContain("where reported_user_id = p_user and context in ('pro_profile', 'pro_chat', 'pro_content') and reviewed_at is null");
    expect(flat(definition(SQL, 'pro_admin_restore_stylist'))).toContain('set stylist_removed_at = null, stylist_removed_reason = null');
    const suspend = flat(definition(SQL, 'pro_admin_suspend'));
    expect(suspend).toContain("pro_end_connection(r.id, 'system')");
    expect(suspend).toContain('c.stylist_id = p_user or c.client_id = p_user');
    expect(flat(definition(SQL, 'pro_admin_unsuspend'))).toContain('set suspended_at = null, suspended_reason = null');
  });

  it('counts the backlog of the pro contexts only, and sends a digest that cannot raise, with numbers only', () => {
    const backlog = flat(definition(SQL, 'pro_report_backlog'));
    expect(backlog).toContain("cr.context in ('pro_profile', 'pro_chat', 'pro_content') and cr.reviewed_at is null and cr.created_at < now() - p_older_than");
    const digest = definition(SQL, 'pro_send_report_digest');
    const text = flat(digest);
    expect(text).toContain("execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'swap_report_webhook';");
    expect(text).toContain("url !~ '^https://'");
    // the Vault read, the post and the return are inside one guarded block that answers false
    const guarded = text.slice(text.indexOf('begin execute'));
    expect(guarded).toContain('exception when others then return false; end;');
    expect(guarded.indexOf('net.http_post')).toBeGreaterThan(-1);
    expect(guarded.indexOf('exception when others')).toBeGreaterThan(guarded.indexOf('net.http_post'));
    expect(text).toContain("format('SmartCloset professional accounts: %s report(s) waiting, the oldest %s hour(s). Open the pro_moderation_queue view.', b.waiting, b.oldest_hours)");
    expect(text).toContain('if coalesce(b.waiting, 0) = 0 then return false; end if;');
    expect(text).not.toMatch(/reporter_id|reported_user_id|evidence|details/);                  // numbers only
  });
});

describe('pro migration 8: the rules every file keeps', () => {
  it('gives no UPDATE or DELETE a missing WHERE', () => {
    expect(bareWrites(SQL)).toEqual([]);
  });

  it('uses dynamic SQL for grants only, and for the one read of Vault', () => {
    const body = code(SQL);
    for (const m of body.matchAll(/execute format\('([^']*)'/g)) {expect(m[1]).toMatch(/^(revoke all on function|grant execute on function) %s /);}
    const other = [...body.matchAll(/^\s*execute\s+(?!format\()([^;]*);/gm)].map(m => m[0].replace(/\s+/g, ' ').trim());
    expect(other).toEqual(["execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'swap_report_webhook';"]);
    expect(body).not.toMatch(/execute format\('(update|delete)/i);
  });

  it('raises only the messages of 4.4 with their SQLSTATE, through pro_raise, but for the one switch error', () => {
    const body = code(SQL);
    const used = new Set<string>();
    for (const m of body.matchAll(/pro_raise\('(\w+)',\s*'(\w+)'/g)) {
      used.add(m[1]);
      expect(ERRORS[m[1]]).toBeDefined();
      expect({ message: m[1], state: m[2] }).toEqual({ message: m[1], state: ERRORS[m[1]] });
    }
    // text_not_allowed and pro_rate_limited come from the helpers (pro_require_text, pro_rate_check); the rest are raised here
    for (const needed of ['invalid_report', 'pro_unavailable', 'report_rate_limited', 'invalid_request']) {expect(used.has(needed)).toBe(true);}
    expect([...body.matchAll(/raise exception\s+([^;]*);/g)].map(m => m[1].replace(/\s+/g, ' '))).toEqual(
      ["'load at least 50 content terms into swap_blocked_terms first' using errcode = '55000'"]);
  });

  it('uses only limits and counters that pro_limit defines', () => {
    const defined = new Set([...FOUNDATION.matchAll(/when '(\w+)'\s+then \d+/g)].map(m => m[1]));
    for (const m of code(SQL).matchAll(/pro_limit\('(\w+)'\)/g)) {expect(defined.has(m[1])).toBe(true);}
    const buckets = [...code(SQL).matchAll(/pro_rate_check\(\w+,\s*'(\w+)'\)/g)].map(m => m[1]);
    expect(buckets).toEqual(['block_day']);                                                    // the other counter is the shared daily count of reports
    for (const b of buckets) {expect(defined.has(b)).toBe(true);}
  });

  it('adds no storage policy, no grant to a guest, and no function that an app user could use to read another person\'s data', () => {
    expect(code(SQL)).not.toMatch(/storage\./);
    expect(code(SQL)).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.pro_\w+\s+to\s+(anon|authenticated|public)/i);
    // the returns table lists and jsonb keys of the client functions name no account, email, phone, price or path
    const forbidden = /(^|_)(email|phone|user_id|stylist_id|client_id|owner_id|sender_id|price|cost|notes|path|url|link|storage|secret|token)(_|$)|Path$|Url$/;
    for (const name of CLIENT) {
      const def = definition(SQL, name);
      const columns = /returns table \(([\s\S]*?)\)\s*language/.exec(def)?.[1].split(',').map(c => c.trim().split(/\s+/)[0]) ?? [];
      const keys = [...code(def).matchAll(/'([A-Za-z0-9_]+)',/g)].map(m => m[1]);
      for (const k of [...columns, ...keys]) {if (/^[a-z]+(_[a-z]+)*$|^[a-z]+([A-Z][a-z]+)*$/.test(k)) {expect({ name, k, bad: forbidden.test(k) }).toEqual({ name, k, bad: false });}}
    }
  });

  it('puts nothing about an assistant or its maker in the migration, the scripts or the tests of this stream', () => {
    const banned = new RegExp(['clau' + 'de', 'anthr' + 'opic', 'chat' + 'gpt', 'open' + 'ai', 'copi' + 'lot', 'gem' + 'ini'].join('|'), 'i');
    const files = [
      path.join(dir, FILE),
      ...['p4_edges.sql', 'p5_deletion.sql', 'p6_moderation.sql', 'p7_catalog.sql'].map(f => path.join(testDir, f)),
      path.join(root, 'supabase', 'audit.sql'),
      __filename,
      path.join(__dirname, 'proRulesInStepWithSql.test.ts'),
      path.join(__dirname, 'proServiceInStepWithSql.test.ts'),
      path.join(__dirname, 'proScripts.test.ts'),
    ];
    for (const f of files) {expect([f, banned.test(fs.readFileSync(f, 'utf8'))]).toEqual([f, false]);}
  });
});

describe('supabase/audit.sql (the one check this stream adds)', () => {
  const audit = read('supabase', 'audit.sql');

  it('has a clause of its own for the nine legacy tables and leaves the list of owner tables as it was', () => {
    const owned = audit.slice(audit.indexOf('user_owned_tables as ('), audit.indexOf(') as tablename'));
    expect([...owned.matchAll(/'(\w+)'/g)]).toHaveLength(10);
    expect(owned).not.toContain('message_threads');
    const clause = audit.slice(audit.indexOf('legacy_pro_grants as ('), audit.indexOf('select * from rls_off'));
    expect(clause).toContain('aclexplode(');
    for (const t of ['stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations', 'message_threads', 'messages', 'booking_requests', 'stylist_reviews']) {
      expect(clause).toContain(`'${t}'`);
    }
    expect(clause).toContain("rolname in ('anon', 'authenticated')");
    expect(audit).toContain('union all select * from legacy_pro_grants');
  });
});

describe('the scenarios of this stream', () => {
  const scenarios = ['p4_edges', 'p5_deletion', 'p6_moderation', 'p7_catalog'];

  it('exist, are listed by the runner, and leave the transaction to the runner', () => {
    const runner = read('scripts', 'run-pro-sql-tests.sh');
    const listed = runner.match(/scenarios=\(([^)]*)\)/)![1].trim().split(/\s+/);
    for (const s of scenarios) {
      expect(fs.existsSync(path.join(testDir, `${s}.sql`))).toBe(true);
      expect(listed).toContain(s);
      expect(read('supabase', 'tests', 'pro', `${s}.sql`)).not.toMatch(/^\s*(commit|rollback|begin)\s*;/im);
    }
  });

  it('cover what 9.2 says they cover', () => {
    const p4 = read('supabase', 'tests', 'pro', 'p4_edges.sql');
    for (const topic of ['block_user', 'via_swap', 'block_pro_member', 'Former client', 'Former stylist', 'pro_admin_suspend', 'close_stylist_profile',
      'pro_refresh', 'pro_janitor', 'disable trigger pro_on_member_left', 'churn']) {expect(p4).toContain(topic);}
    const p5 = read('supabase', 'tests', 'pro', 'p5_deletion.sql');
    expect(p5).toContain('delete_user_account()');
    expect(p5).toContain('create or replace function public.pro_on_member_left()');
    const p6 = read('supabase', 'tests', 'pro', 'p6_moderation.sql');
    for (const topic of ['report_swap_content', '\\U0001F600', 'pro_set_enabled', 'pro_report_backlog', 'pro_send_report_digest', 'stylist_profile_removed',
      'export_my_pro_data', 'pro_moderation_queue', 'pro_review_queue']) {expect(p6).toContain(topic);}
    const p7 = read('supabase', 'tests', 'pro', 'p7_catalog.sql');
    expect(p7).toContain('client_functions()');
    expect(p7).toContain('indkey[0]');
  });
});
