/**
 * The API layer in front of the database refuses any UPDATE or DELETE that has no WHERE clause ("UPDATE requires a
 * WHERE clause"). A direct SQL session, which is how the migration and scenario scripts run, accepts them, so a
 * function that does this passes every database test and then fails for every app call. This reads each migration
 * and fails on a bare UPDATE or DELETE, so the mistake is found here and not on a phone.
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const heldDir = path.join(__dirname, '..', 'supabase', 'held');

/** Drops what sits inside parentheses, so a WHERE inside a sub-select does not count as the statement's own. */
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

/** Statements like `update x set ...` / `delete from x` with no WHERE of their own. */
export const bareWrites = (sql: string): string[] => {
  const text = sql.replace(/--[^\n]*/g, '');
  const found: string[] = [];
  const start = /\b(update\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?\w+)?\s+set\b|delete\s+from\s+[\w."]+)/gi;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    if (/\bdo\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue; // ON CONFLICT DO UPDATE SET
    const end = text.indexOf(';', m.index);
    const statement = text.slice(m.index, end === -1 ? undefined : end);
    if (!/\bwhere\b/i.test(topLevel(statement))) found.push(statement.replace(/\s+/g, ' ').trim().slice(0, 90));
  }
  return found;
};

describe('bareWrites (the check itself)', () => {
  it('finds a bare update and a bare delete', () => {
    expect(bareWrites('update public.t set a = 1;')).toHaveLength(1);
    expect(bareWrites('delete from public.t;')).toHaveLength(1);
  });
  it('accepts a WHERE, a conflict update, and a WHERE that only sits in a sub-select as not enough', () => {
    expect(bareWrites('update public.t set a = 1 where id;')).toEqual([]);
    expect(bareWrites('insert into t values (1) on conflict (id) do update set a = 2;')).toEqual([]);
    expect(bareWrites('update public.t set a = (select b from u where u.id = 1);')).toHaveLength(1);
  });
});

describe('supabase migrations', () => {
  const files = [
    ...fs.readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => path.join(dir, f)),
    ...(fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter(f => f.endsWith('.sql')).map(f => path.join(heldDir, f)) : []),
  ];
  it.each(files.map(f => [path.basename(f), f]))('%s has no UPDATE or DELETE without a WHERE', (_name, file) => {
    expect(bareWrites(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});
