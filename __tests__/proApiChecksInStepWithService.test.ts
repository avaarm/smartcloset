/**
 * scripts/pro-api-checks.mjs (documentation/design/pro-accounts.md 9.4) cannot run in Jest or on a machine without
 * Docker, so everything that can be proved without a stack is proved here: that it calls every client function with
 * argument names the SQL declares and proService.ts sends, that its tables, versions and shapes are the ones the
 * migrations and src/ hold, that it refuses any address that is not a local stack, that its dry run really reads the
 * files (a doctored copy of the migrations fails it), and that its photo fixtures are accepted, and cleaned, by the
 * same code the pro-photo function runs. Its first run on a local stack is the lead's gate P4.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { stripJpegMetadata } from '../supabase/functions/_shared/jpegMetadata';
import { stripPngMetadata } from '../supabase/functions/_shared/pngMetadata';

jest.mock('../src/config/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() } }));
import * as proService from '../src/services/proService';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../src/config/proRules';

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'pro-api-checks.mjs');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const scriptText = fs.readFileSync(script, 'utf8');
const proFiles = fs.readdirSync(migrationsDir).filter(f => /^\d{14}_pro_.*\.sql$/.test(f)).sort();
const proSql = proFiles.map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

type Finding = { ok: boolean; what: string };
type Call = { helper: string; actor: string; fn: string; args: string[]; group: string };
type DryRun = { clean: boolean; findings: Finding[]; plan: { groups: string[]; calls: Call[]; byGroup: Record<string, number> }; migrations: string[] };

// The module is ES, the tests are not: functions of the script are called in a child Node process.
const inModule = (code: string, env: Record<string, string> = {}): any => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import * as m from ${JSON.stringify(pathToFileURL(script).href)};\n${code}`], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env },
  });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
};
const dryRun = (extra: string[] = []): { status: number | null; report: DryRun } => {
  const r = spawnSync(process.execPath, [script, '--dry-run', '--json', ...extra], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
  return { status: r.status, report: JSON.parse(r.stdout) };
};

// ─── an independent reading of the SQL and of proService.ts ──────────────────

// The text between a parenthesis and its partner, and the commas that sit at the top level of it (a default such as
// `now()` or a type such as `numeric(10, 2)` has commas and parentheses of its own).
const balanced = (text: string, open: number): string => {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return '';
};
const topLevel = (list: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(list.slice(from));
  return parts.map(s => s.trim()).filter(Boolean);
};
const sqlFunctions = (sql: string): Record<string, { params: string[]; required: string[] }> => {
  const out: Record<string, { params: string[]; required: string[] }> = {};
  for (const m of sql.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)) {
    const entries = topLevel(balanced(sql, m.index! + m[0].length - 1));
    out[m[1]] = {
      params: entries.map(e => e.split(/\s+/)[0]),
      required: entries.filter(e => !/\bdefault\b/i.test(e)).map(e => e.split(/\s+/)[0]),
    };
  }
  return out;
};
const grantedTo = (sql: string, role: string): string[] => {
  const names: string[] = [];
  for (const block of sql.match(/\bdo\s+\$\$[\s\S]*?\$\$\s*;/gi) ?? []) {
    if (!new RegExp(`grant execute on function %s to ${role}'`).test(block)) continue;
    for (const m of block.matchAll(/'public\.([a-z_0-9]+)\(/g)) names.push(m[1]);
  }
  return [...new Set(names)].sort();
};
const keysOfLiteral = (src: string, open: number): string[] => {
  const keys: string[] = [];
  let depth = 0;
  let quote = '';
  let expectKey = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === quote && src[i - 1] !== '\\') quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; if (depth === 1 && ch === '{') expectKey = true; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) break; continue; }
    if (ch === ',' && depth === 1) { expectKey = true; continue; }
    if (expectKey && depth === 1 && /[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][\w]*/.exec(src.slice(i));
      if (m) {
        keys.push(m[0]);
        i += m[0].length - 1;
        expectKey = false;
      }
    }
  }
  return keys;
};
const serviceCalls = (): Record<string, string[]> => {
  const source = fs.readFileSync(path.join(root, 'src', 'services', 'proService.ts'), 'utf8');
  const out: Record<string, string[]> = {};
  for (const m of source.matchAll(/\bcall(?:<[^>]*>)?\(\s*'([a-z0-9_]+)'\s*(,\s*\{)?/g)) {
    const keys = m[2] ? keysOfLiteral(source, m.index! + m[0].length - 1) : [];
    out[m[1]] = [...new Set([...(out[m[1]] ?? []), ...keys])];
  }
  return out;
};

describe('the dry run', () => {
  const { status, report } = dryRun();
  const calls = report.plan.calls;

  it('is clean against the migrations in the repository, and needs no environment', () => {
    const failing = report.findings.filter(f => !f.ok).map(f => f.what);
    expect({ status, failing }).toEqual({ status: 0, failing: [] });
    expect(report.clean).toBe(true);
    expect(report.migrations).toHaveLength(8);
  });

  it('reads every call out of the plan, in named groups, and finds nothing it cannot read', () => {
    expect(calls.length).toBeGreaterThan(250);
    expect(report.plan.groups.length).toBeGreaterThanOrEqual(20);
    expect(report.findings[0].what).toMatch(/calls in \d+ groups were read from the plan/);
    // Every use of a plan helper between the markers was understood: none is computed.
    const between = scriptText.slice(scriptText.search(/^\s*\/\/ ---- steps begin ----\s*$/m), scriptText.search(/^\s*\/\/ ---- steps end ----\s*$/m));
    const withoutComments = between.replace(/\/\/[^\n]*/g, '');
    const uses = [...withoutComments.matchAll(/(?<![\w$.])(ok|fails|refused|result)\(/g)].length;
    expect(calls).toHaveLength(uses);
  });

  it('calls every client function of 4.6 as a signed-in person, and every one is granted to authenticated', () => {
    const granted = grantedTo(proSql, 'authenticated').filter(f => f !== 'report_swap_content');
    expect(granted).toHaveLength(36);
    const called = new Set(calls.filter(c => c.helper !== 'refused' && c.actor !== 'anon' && c.actor !== 'service').map(c => c.fn));
    expect(granted.filter(f => !called.has(f))).toEqual([]);
  });

  it('calls every service-role function with the service key, and they are granted to nobody else', () => {
    const serviceOnly = grantedTo(proSql, 'service_role');
    expect(serviceOnly).toHaveLength(12);
    const called = new Set(calls.filter(c => c.actor === 'service').map(c => c.fn));
    expect(serviceOnly.filter(f => !called.has(f))).toEqual([]);
    const toUsers = new Set([...grantedTo(proSql, 'authenticated'), ...grantedTo(proSql, 'anon')]);
    expect(serviceOnly.filter(f => toUsers.has(f))).toEqual([]);
  });

  it('sends only argument names the SQL declares, with the p_ prefix, and every required one', () => {
    const sql = sqlFunctions(proSql);
    const problems: string[] = [];
    for (const c of calls) {
      const def = sql[c.fn];
      if (!def) { problems.push(`${c.fn} is not defined`); continue; }
      for (const a of c.args) if (!a.startsWith('p_') || !def.params.includes(a)) problems.push(`${c.fn}: ${a} is not an argument`);
      for (const r of def.required) if (!c.args.includes(r)) problems.push(`${c.fn}: ${r} is required and not sent (${c.group})`);
    }
    expect(problems).toEqual([]);
  });

  it('sends every argument proService.ts can send (a name the service uses but the script never does is untested)', () => {
    const fromService = serviceCalls();
    const byFn: Record<string, Set<string>> = {};
    for (const c of calls) {
      byFn[c.fn] = byFn[c.fn] ?? new Set<string>();
      for (const a of c.args) byFn[c.fn].add(a);
    }
    const missing: string[] = [];
    for (const [fn, args] of Object.entries(fromService)) {
      if (!byFn[fn]) { missing.push(`${fn} is never called`); continue; }
      for (const a of args) if (!byFn[fn].has(a)) missing.push(`${fn}.${a}`);
    }
    expect(Object.keys(fromService).length).toBeGreaterThanOrEqual(35);
    expect(missing).toEqual([]);
    // and the service sends nothing the SQL does not declare (the same comparison from the other side)
    const sql = sqlFunctions(proSql);
    for (const [fn, args] of Object.entries(fromService)) for (const a of args) expect(sql[fn]?.params).toContain(a);
  });

  it('expects a long list of precise failures (about thirty is the floor of 9.4)', () => {
    const failures = calls.filter(c => c.helper === 'fails');
    expect(failures.length).toBeGreaterThanOrEqual(60);
    expect(new Set(failures.map(c => c.fn)).size).toBeGreaterThanOrEqual(25);
  });

  it('lists the fifteen pro tables and nine legacy tables the migrations create and revoke', () => {
    const created = [...fs.readFileSync(path.join(migrationsDir, proFiles.find(f => /_pro_foundation/.test(f))!), 'utf8')
      .matchAll(/create table if not exists public\.(pro_[a-z_]+)/g)].map(m => m[1]).sort();
    const lib = inModule('console.log(JSON.stringify({ pro: m.PRO_TABLES.map(t => t.name), legacy: m.LEGACY_TABLES.map(t => t.name) }))');
    expect(created).toHaveLength(15);
    expect([...lib.pro].sort()).toEqual(created);
    const lockdown = fs.readFileSync(path.join(migrationsDir, proFiles.find(f => /_pro_lockdown/.test(f))!), 'utf8');
    expect([...lib.legacy].sort()).toEqual([...lockdown.match(/array\[([^\]]*)\]/)![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort());
    expect(lib.legacy).toHaveLength(9);
  });
});

describe('the constants of the script', () => {
  const lib = inModule(`console.log(JSON.stringify({
    versions: [m.STYLIST_TERMS_VERSION, m.CLIENT_TERMS_VERSION, m.SHARE_TEXT_VERSION],
    shapes: m.SHAPES, client: Object.keys(m.CLIENT_PROBES), service: Object.keys(m.SERVICE_ONLY_PROBES),
  }))`);

  it('sends the versions of this build', () => {
    expect(lib.versions).toEqual([PRO_STYLIST_TERMS_VERSION, PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION]);
  });

  it('expects the keys proService.ts reads (a grant also carries its scope, which the service sets and does not read)', () => {
    const columns = proService.PRO_RPC_COLUMNS;
    for (const [fn, keys] of Object.entries(columns)) {
      const expected: string[] = lib.shapes[fn];
      expect(expected).toBeDefined();
      expect([...expected].filter(k => !(k === 'scope' && /grant/.test(fn))).sort()).toEqual([...keys].sort());
    }
    const named = Object.keys(lib.shapes).filter(k => !k.includes(':'));
    expect(named.filter(k => !(k in columns) && k !== 'pro_report_backlog')).toEqual([]);
  });

  it('probes exactly the 36 client functions of 4.6', () => {
    expect(lib.client).toHaveLength(36);
    expect([...lib.client].sort()).toEqual(grantedTo(proSql, 'authenticated').filter(f => f !== 'report_swap_content'));
    expect([...lib.service].sort()).toEqual(grantedTo(proSql, 'service_role'));
  });
});

describe('the two readings of a function signature agree on the hard cases', () => {
  const sql = [
    'create or replace function public.f(p_a uuid, p_b timestamptz default now(), p_c numeric(10, 2) default 0, p_d text[] default \'{}\')',
    'returns table (x integer, y text) language sql as $$ select 1, \'a\' $$;',
  ].join('\n');

  it('read a default with parentheses, a type with a comma, an array default and a table result', () => {
    expect(sqlFunctions(sql)).toEqual({ f: { params: ['p_a', 'p_b', 'p_c', 'p_d'], required: ['p_a'] } });
    const fromScript = inModule('console.log(JSON.stringify(m.parseSqlFunctions(process.env.SQL)))', { SQL: sql });
    expect(fromScript).toHaveLength(1);
    expect(fromScript[0].params).toEqual([
      { name: 'p_a', hasDefault: false }, { name: 'p_b', hasDefault: true }, { name: 'p_c', hasDefault: true }, { name: 'p_d', hasDefault: true },
    ]);
    expect(fromScript[0].columns).toEqual(['x', 'y']);
  });
});

describe('a doctored copy of the migrations fails the dry run, so it really reads them', () => {
  const doctored = (change: (file: string, text: string) => string): { status: number | null; failing: string[] } => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-api-dry-'));
    try {
      for (const f of fs.readdirSync(migrationsDir)) {
        const text = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
        fs.writeFileSync(path.join(dir, f), /_pro_/.test(f) ? change(f, text) : text);
      }
      const { status, report } = dryRun(['--migrations', dir]);
      return { status, failing: report.findings.filter(x => !x.ok).map(x => x.what) };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it('notices an argument that was renamed', () => {
    const r = doctored((f, t) => t.replace('create or replace function public.create_pro_invite(p_client_ref uuid', 'create or replace function public.create_pro_invite(p_ref uuid'));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/create_pro_invite has no argument p_client_ref/);
  });

  it('notices a required argument that was added', () => {
    const r = doctored((f, t) => t.replace('create or replace function public.get_pro_status()', 'create or replace function public.get_pro_status(p_extra uuid)'));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/get_pro_status needs p_extra/);
  });

  it('notices a client function that lost its grant', () => {
    const r = doctored((f, t) => t.replace("    'public.list_pro_blocks()',\n", ''));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/not granted to authenticated.*list_pro_blocks/);
  });

  it('notices an admin function that an app user may execute', () => {
    const r = doctored((f, t) => (/_pro_moderation/.test(f) ? `${t}\ngrant execute on function public.pro_admin_suspend(uuid, text) to authenticated;\n` : t));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/granted to app users: pro_admin_suspend/);
  });

  it('notices a function that was renamed away', () => {
    const r = doctored((f, t) => t.replace(/public\.get_pro_thread\(/g, 'public.get_thread_of_pro('));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/get_pro_thread/);
  });

  it('notices a changed terms version', () => {
    const r = doctored((f, t) => t.replace("('client_terms_version',  '\"2026-10\"'::jsonb)", "('client_terms_version',  '\"2027-01\"'::jsonb)"));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/client_terms_version: the migrations seed 2027-01/);
  });

  it('notices a table that is no longer revoked or no longer exists', () => {
    const r = doctored((f, t) => t.replace("'stylist_reviews'", "'stylist_reviews_old'"));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/legacy tables differ/);
  });

  it('notices an overloaded function', () => {
    const r = doctored((f, t) => (/_pro_connections/.test(f) ? `${t}\ncreate or replace function public.end_pro_connection(p_connection uuid, p_note text) returns void language sql as $$ select 1 $$;\n` : t));
    expect(r.status).toBe(1);
    expect(r.failing.join('\n')).toMatch(/overloaded or defined twice: end_pro_connection/);
  });
});

describe('the script only ever runs against a local stack', () => {
  const run = (url?: string, extra: Record<string, string> = {}) => spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...(url === undefined ? {} : { SUPABASE_URL: url }), SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...extra },
    timeout: 20000,
  });
  const refusal = (url?: string, extra: Record<string, string> = {}) => {
    const r = run(url, extra);
    return { url, status: r.status, refused: /refusing to run/.test(r.stderr), output: r.stdout };
  };

  it('refuses a remote host, wherever "localhost" or "127.0.0.1" also appears in the text', () => {
    for (const url of [
      'https://db.invalid',
      'https://xyz.supabase.co',
      'http://localhost.invalid:54321',
      'http://127.0.0.1.invalid:54321',
      'http://db.invalid:54321/127.0.0.1',
      'http://db.invalid:54321?host=127.0.0.1',
      'http://db.invalid:54321#localhost',
      'http://localhost:pw@db.invalid:54321',
    ]) expect(refusal(url)).toEqual({ url, status: 1, refused: true, output: '' });
  });

  it('refuses a URL that carries credentials, a path, a query, or is not an http address', () => {
    for (const url of [
      'http://user:pw@127.0.0.1:54321',
      'http://127.0.0.1@db.invalid:54321',
      'http://127.0.0.1:54321/rest/v1',
      'http://127.0.0.1:54321?x=1',
      'ftp://127.0.0.1:54321',
      'not a url',
      '127.0.0.1:54321',
    ]) expect(refusal(url)).toEqual({ url, status: 1, refused: true, output: '' });
  });

  it('refuses to run without a URL', () => {
    const r = run(undefined);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SUPABASE_URL');
  });

  it('refuses the production project, even when it is named as allowed', () => {
    const host = ['ipgndphqbuftuxstoitk', 'supabase', 'co'].join('.');
    expect(refusal(`https://${host}`, { PRO_API_ALLOW_REMOTE: host })).toEqual({ url: `https://${host}`, status: 1, refused: true, output: '' });
  });

  it('refuses a remote branch unless its host is spelled out, over https, and says it is a branch', () => {
    const host = 'abcdefgh.branch.example';
    expect(refusal(`https://${host}`).refused).toBe(true);
    expect(refusal(`https://${host}`, { PRO_API_ALLOW_REMOTE: 'other.example' }).refused).toBe(true);
    expect(refusal(`http://${host}`, { PRO_API_ALLOW_REMOTE: host }).refused).toBe(true);
    const verdicts = inModule(`console.log(JSON.stringify([
      m.checkTarget(${JSON.stringify(`https://${host}`)}, { PRO_API_ALLOW_REMOTE: ${JSON.stringify(host)} }),
    ]))`);
    expect(verdicts[0]).toMatchObject({ ok: true, local: false });
  });

  it('lets local addresses through its check (the check alone is run, nothing connects)', () => {
    const urls = ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321', 'https://localhost:54321/'];
    const verdicts = inModule(`console.log(JSON.stringify(${JSON.stringify(urls)}.map(u => m.checkTarget(u, {}))))`);
    expect(verdicts.map((v: any) => [v.ok, v.local])).toEqual(urls.map(() => [true, true]));
  });

  it('needs the keys, and says so', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SUPABASE_URL: 'http://127.0.0.1:1' }, timeout: 20000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('SUPABASE_ANON_KEY');
  });

  it('is written to be run by hand: executable, with a shebang, and nothing that runs on import', () => {
    expect(() => fs.accessSync(script, fs.constants.X_OK)).not.toThrow();
    expect(scriptText.startsWith('#!/usr/bin/env node')).toBe(true);
    // importing it (as the child processes above do) neither calls main nor touches the network
    expect(inModule('console.log(JSON.stringify(typeof m.checkTarget))')).toBe('function');
  });
});

describe('what the script is allowed to do', () => {
  it('uses only built-in modules (no new dependency)', () => {
    const imports = [...scriptText.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
    expect(imports.length).toBeGreaterThan(4);
    expect(imports.filter(i => !i.startsWith('node:'))).toEqual([]);
  });

  it('names the production project once, in the guard, and nothing else that identifies a project', () => {
    expect(scriptText.match(/ipgndphqbuftuxstoitk/g)).toHaveLength(1);
    expect(scriptText).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
  });

  it('makes no network call in its dry run', () => {
    const start = scriptText.indexOf('// ─── Reading this file and the migrations (--dry-run)');
    const end = scriptText.indexOf('// ─── The run ─');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(scriptText.slice(start, end)).not.toMatch(/\bfetch\(|\bsend\(|rpcRaw\(|\brest\(|https?\.request/);
  });

  it('puts its settings back when interrupted, and registers that only when run, never on import', () => {
    const at = scriptText.indexOf('async function main()');
    expect(at).toBeGreaterThan(-1);
    expect(scriptText.slice(at)).toMatch(/process\.once\('SIGINT'/);
    expect(scriptText.slice(at)).toMatch(/process\.once\('SIGTERM'/);
    expect(scriptText.slice(0, at)).not.toMatch(/process\.(once|on)\(/);
  });

  it('never writes without a filter, except in the one canary that proves the guard', () => {
    expect([...scriptText.matchAll(/bareWrite\(/g)]).toHaveLength(2);                // the two canary calls and nothing else
    expect(scriptText).toContain("if ((method === 'PATCH' || method === 'DELETE') && !query) throw");
  });

  it('names no assistant or maker, in the script, this test or the live test', () => {
    const words = new RegExp(['clau' + 'de', 'anthro' + 'pic', 'open' + 'ai', 'chat' + 'gpt', 'copi' + 'lot', 'gem' + 'ini'].join('|'), 'i');
    for (const text of [scriptText, fs.readFileSync(__filename, 'utf8'), fs.readFileSync(path.join(root, '__tests__', 'live', 'proServiceLive.test.ts'), 'utf8')]) {
      expect(text).not.toMatch(words);
    }
  });

  it('has no emoji in its text (the four-byte character it plants is written as an escape)', () => {
    expect(scriptText).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(scriptText).toContain('\\u{1F600}');
  });
});

describe('the photo fixtures', () => {
  const lib = inModule(`
    const jpeg = m.buildGeotaggedJpeg();
    const png = m.buildTextPng();
    console.log(JSON.stringify({ jpeg: jpeg.toString('base64'), png: png.toString('base64'), jpegBefore: m.jpegFindings(jpeg), pngBefore: m.pngFindings(png) }));
  `);

  it('carry the metadata the checks look for, so a check that finds none can fail', () => {
    expect(lib.jpegBefore).toEqual(expect.arrayContaining(['Exif', 'comment', 'bytes after the end of the image']));
    expect(lib.pngBefore).toEqual(expect.arrayContaining(['tEXt chunk', 'tIME chunk', 'bytes after IEND']));
    const raw = Buffer.from(lib.jpeg, 'base64');
    expect(raw.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);
    expect(raw.includes(Buffer.from([0x88, 0x25]))).toBe(true);                         // the GPS pointer tag
  });

  it('are accepted by the code the pro-photo function runs, which leaves nothing the checks flag', () => {
    const cleanedJpeg = stripJpegMetadata(new Uint8Array(Buffer.from(lib.jpeg, 'base64')));
    const cleanedPng = stripPngMetadata(new Uint8Array(Buffer.from(lib.png, 'base64')));
    expect(cleanedJpeg.ok).toBe(true);
    expect(cleanedPng.ok).toBe(true);
    const after = inModule(`
      const jpeg = Buffer.from(process.env.JPEG, 'base64');
      const png = Buffer.from(process.env.PNG, 'base64');
      console.log(JSON.stringify({ jpeg: m.jpegFindings(jpeg), png: m.pngFindings(png) }));
    `, {
      JPEG: Buffer.from((cleanedJpeg as any).bytes).toString('base64'),
      PNG: Buffer.from((cleanedPng as any).bytes).toString('base64'),
    });
    expect(after).toEqual({ jpeg: [], png: [] });
  });

  it('are flagged by the checks when the function does not clean them', () => {
    const after = inModule(`
      const jpeg = Buffer.from(process.env.JPEG, 'base64');
      const trimmed = jpeg.subarray(0, jpeg.length - 21);
      console.log(JSON.stringify({ untouched: m.jpegFindings(jpeg), onlyTrailingGone: m.jpegFindings(trimmed) }));
    `, { JPEG: lib.jpeg });
    expect(after.untouched.length).toBeGreaterThan(0);
    expect(after.onlyTrailingGone).toEqual(expect.arrayContaining(['Exif', 'comment']));
  });
});

describe('the leak scan every answer goes through', () => {
  const ids = ['a0000000-0000-4000-8000-00000000000a'];
  const scan = (body: unknown, allowPaths = false): string[] =>
    inModule(`console.log(JSON.stringify(m.findLeaks(JSON.parse(process.env.BODY), { ids: ${JSON.stringify(ids)}, mails: ['ann@example.test'], allowPaths: ${allowPaths} })))`, { BODY: JSON.stringify(body) });

  it('passes an ordinary answer', () => {
    expect(scan({ connectionId: 'c1', otherLabel: 'Ann Styles', note: 'Intro call', ratesText: 'From $80 per session', items: [{ name: 'Blue blazer' }] })).toEqual([]);
  });

  it('catches an account id, an email, a private column and a storage path', () => {
    expect(scan({ x: `owner ${ids[0]}` })).toHaveLength(1);
    expect(scan({ x: 'mail ann@example.test' })).toHaveLength(1);
    expect(scan([{ name: 'Coat', cost: 120 }, { name: 'Hat', notes: 'private' }, { retailer: 'Zara store' }])).toEqual(
      expect.arrayContaining(['the key cost', 'the key notes', 'the key retailer']));
    expect(scan({ cover_photo_path: `${ids[0]}/test.jpg` })).toEqual(expect.arrayContaining(['the key cover_photo_path (a photo path)']));
  });

  it('lets the client\'s own photo path through when told it is the client, and still nothing else', () => {
    expect(scan({ cover_photo_path: `${ids[0]}/test.jpg`, photoPath: `${ids[0]}/test.png` }, true)).toEqual([]);
    expect(scan({ cover_photo_path: `${ids[0]}/test.jpg`, cost: 5 }, true)).toEqual(['the key cost']);
  });

  it('does not mind a path key that is empty (a stylist reads null there)', () => {
    expect(scan({ photoPath: null, cover_photo_path: null })).toEqual([]);
  });
});
