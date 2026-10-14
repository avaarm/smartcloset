/**
 * The consents and quota migration: recorded, versioned permissions and a daily counter. Reads the migration
 * as text, like itemSizeConditionMigration.test.ts. The behaviour itself (stale text refused, reconsent, the
 * quota) is exercised on a scratch PostgreSQL by the stream's report, not here.
 */
import fs from 'fs';
import path from 'path';
import { RATINGS_POLICY_VERSION } from '../src/config/ratingVocabulary';

const sql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'migrations', '20261014000200_consents_and_quota.sql'),
  'utf8',
);
const code = sql.replace(/--.*$/gm, '');

/** The text of one function: from its create to the closing `$$;`. */
const fn = (name: string): string => {
  const start = code.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const open = code.indexOf('$$', start);
  return code.slice(start, code.indexOf('$$;', open + 2) + 3);
};

const TABLES = ['consent_purposes', 'user_consents', 'usage_counters'];

describe('consents and quota migration: tables', () => {
  it('creates three tables, each only if missing', () => {
    expect(code.match(/create table\b/gi)).toHaveLength(3);
    expect(code.match(/create table if not exists public\.\w+/gi)).toHaveLength(3);
    for (const t of TABLES) expect(code).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
  });

  it.each(TABLES)('locks %s down: row-level security on, nothing granted to the public roles', table => {
    expect(code).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
    expect(code).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`));
  });

  it('grants a table to nobody except select on a member\'s own consent rows', () => {
    const grants = code.match(/grant [^;]*on public\.(consent_purposes|user_consents|usage_counters)[^;]*;/gi);
    expect(grants).toEqual(['grant select on public.user_consents to authenticated;']);
    expect(code).toMatch(/create policy "own consents" on public\.user_consents\s+for select to authenticated\s+using \(auth\.uid\(\) = user_id\);/);
    expect(code.match(/create policy/gi)).toHaveLength(1);
  });

  it('leaves usage_counters with no policy at all (only hit_quota touches it)', () => {
    expect(code).not.toMatch(/policy[^;]*on public\.usage_counters/i);
    expect(code).not.toMatch(/policy[^;]*on public\.consent_purposes/i);
  });

  it('cascades every member column from auth.users', () => {
    const userColumns = code.match(/\buser_id\s+uuid\b[^,\n]*/g) ?? [];
    expect(userColumns).toHaveLength(2);
    for (const column of userColumns) {
      expect(column).toMatch(/not null references auth\.users\(id\) on delete cascade/);
    }
    // and nothing else points at auth.users
    expect(code.match(/references auth\.users/g)).toHaveLength(2);
    expect(code.match(/references auth\.users\(id\) on delete cascade/g)).toHaveLength(2);
  });

  it('keeps one answer per member and purpose, and one counter per member, day and bucket', () => {
    expect(code).toMatch(/primary key \(user_id, purpose\)/);
    expect(code).toMatch(/primary key \(user_id, day, bucket\)/);
    expect(code).toMatch(/purpose\s+text not null references public\.consent_purposes\(purpose\)/);
  });

  it('caps the text it stores', () => {
    expect(code).toMatch(/char_length\(current_version\) between 1 and 40/);
    expect(code).toMatch(/char_length\(policy_version\) between 1 and 40/);
    expect(code).toMatch(/purpose ~ '\^\[a-z\]\[a-z_\]\{2,39\}\$'/);
    expect(code).toMatch(/bucket ~ '\^\[a-z\]\[a-z_\]\{2,39\}\$'/);
  });

  it('seeds the one purpose, asking for an adult and a fresh answer when the wording changes', () => {
    expect(code).toMatch(
      /insert into public\.consent_purposes \(purpose, requires_adult, current_version, reconsent, description\)\s+values \('share_ratings', true, 'ratings-2026-10', true,/,
    );
    expect(code).toMatch(/on conflict \(purpose\) do nothing;/);
    // the other columns default to the cautious values
    expect(code).toMatch(/requires_adult boolean not null default false/);
    expect(code).toMatch(/reconsent\s+boolean not null default false/);
  });

  it('seeds the wording version the app carries', () => {
    const seeded = code.match(/values \('share_ratings', true, '([^']+)', true,/)![1];
    expect(seeded).toBe(RATINGS_POLICY_VERSION);
  });
});

describe('consents and quota migration: functions', () => {
  const functions = Array.from(code.matchAll(/create or replace function public\.(\w+)\(/g), m => m[1]);

  it('defines exactly the four functions, each as security definer with a fixed search path', () => {
    expect(functions.sort()).toEqual(['consent_in_force', 'get_my_consents', 'hit_quota', 'set_consent']);
    for (const name of functions) {
      const body = fn(name);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
    }
  });

  it('keeps hit_quota and consent_in_force away from every client role', () => {
    expect(code).toMatch(/revoke all on function public\.hit_quota\(uuid, text, integer\) from public, anon, authenticated;/);
    expect(code).toMatch(/revoke all on function public\.consent_in_force\(uuid, text\) from public, anon, authenticated;/);
    expect(code).not.toMatch(/grant execute on function public\.(hit_quota|consent_in_force)/);
  });

  it('lets only signed-in members call set_consent and get_my_consents', () => {
    expect(code).toMatch(/revoke all on function public\.get_my_consents\(\) from public, anon;\s+grant execute on function public\.get_my_consents\(\) to authenticated;/);
    expect(code).toMatch(
      /revoke all on function public\.set_consent\(text, boolean, text, boolean, boolean\) from public, anon;\s+grant execute on function public\.set_consent\(text, boolean, text, boolean, boolean\) to authenticated;/,
    );
  });

  it('follows every function with its revoke', () => {
    for (const name of functions) {
      const after = code.slice(code.indexOf(fn(name)) + fn(name).length);
      expect(after).toMatch(new RegExp(`^\\s*revoke all on function public\\.${name}\\(`));
    }
  });

  it('grants execute only on the two member-facing functions', () => {
    const grants = Array.from(code.matchAll(/grant execute on function public\.(\w+)/g), m => m[1]);
    expect(grants.sort()).toEqual(['get_my_consents', 'set_consent']);
  });

  it('refuses a granting call that does not name the wording in force, and stores the server\'s own version', () => {
    const body = fn('set_consent');
    expect(body).toContain("raise exception 'stale_consent_text' using errcode = '22023';");
    expect(body).toMatch(/if p_granted and btrim\(p_policy_version\) <> v_current then/);
    // the version written is the server's, never the caller's
    const insert = body.slice(body.indexOf('insert into public.user_consents'), body.indexOf('handler :='));
    expect(insert).toMatch(/values \(uid, p_purpose, p_granted, v_current,/);
    expect(insert).toMatch(/policy_version = excluded\.policy_version/);
    expect(insert).not.toMatch(/p_policy_version/);
  });

  it('needs an adult confirmation where the purpose asks for one, and records when', () => {
    const body = fn('set_consent');
    expect(body).toContain("raise exception 'adult_required' using errcode = '22023';");
    expect(body).toMatch(/if p_granted and needs_adult and not coalesce\(p_adult, false\) then/);
    expect(body).toMatch(/case when p_granted and needs_adult then now\(\) end/);
  });

  it('checks everything before it spends a use of the daily allowance, and spends it before it writes', () => {
    const body = fn('set_consent');
    const at = (text: string) => {
      const i = body.indexOf(text);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    expect(at("'not_authenticated'")).toBeLessThan(at("'invalid_consent'"));
    expect(at("'invalid_consent'")).toBeLessThan(at("'invalid_purpose'"));
    expect(at("'invalid_purpose'")).toBeLessThan(at("'stale_consent_text'"));
    expect(at("'stale_consent_text'")).toBeLessThan(at("'adult_required'"));
    expect(at("'adult_required'")).toBeLessThan(at('hit_quota'));
    expect(at('hit_quota')).toBeLessThan(at('insert into public.user_consents'));
    expect(body).toContain("hit_quota(uid, 'consent_change', 10)");
    expect(body).toContain("raise exception 'rate_limited' using errcode = '54000';");
  });

  it('works only for the signed-in member', () => {
    for (const name of ['set_consent', 'get_my_consents']) {
      const body = fn(name);
      expect(body).toMatch(/uid uuid := auth\.uid\(\);/);
      expect(body).toContain("raise exception 'not_authenticated' using errcode = '28000';");
    }
    expect(fn('get_my_consents')).toMatch(/left join public\.user_consents c on c\.purpose = p\.purpose and c\.user_id = uid/);
  });

  it('hands the feature its own handler by name, only when one exists', () => {
    const body = fn('set_consent');
    expect(body).toContain("handler := 'on_consent_changed_' || p_purpose;");
    expect(body).toContain("to_regprocedure('public.' || handler || '(uuid,boolean,boolean)') is not null");
    expect(body).toContain("execute format('select public.%I($1, $2, $3)', handler) using uid, p_granted, coalesce(p_include_existing, false);");
  });

  it('reports an answer given to older wording as needs_reconsent, and counts it as not agreed', () => {
    const read = fn('get_my_consents');
    expect(read).toMatch(/needs_reconsent boolean/);
    expect(read).toMatch(/coalesce\(c\.granted and p\.reconsent and c\.policy_version <> p\.current_version, false\)/);
    const inForce = fn('consent_in_force');
    expect(inForce).toMatch(/c\.granted\s+and \(not p\.reconsent or c\.policy_version = p\.current_version\)/);
  });

  it('counts a use, reports whether it was within the limit, and tidies old counters', () => {
    const body = fn('hit_quota');
    expect(body).toMatch(/if p_user is null then\s+return false;/);
    expect(body).toMatch(/delete from public\.usage_counters\s+where user_id = p_user and day < \(\(now\(\) at time zone 'utc'\)::date - 7\);/);
    expect(body).toMatch(/on conflict \(user_id, day, bucket\)\s+do update set count = public\.usage_counters\.count \+ 1/);
    expect(body).toMatch(/return c <= p_limit;/);
  });
});

describe('consents and quota migration: scope', () => {
  it('can run twice', () => {
    expect(code.match(/create or replace function/g)).toHaveLength(4);
    expect(code).toMatch(/drop policy if exists "own consents" on public\.user_consents;/);
    expect(code).toMatch(/on conflict \(purpose\) do nothing/);
  });

  it('drops only the one policy it re-creates', () => {
    const drops = code.match(/\bdrop\b[^;]*;/gi);
    expect(drops).toEqual(['drop policy if exists "own consents" on public.user_consents;']);
  });

  it('changes no existing table', () => {
    expect(code).not.toMatch(/clothing_items/i);
    expect(code).not.toMatch(/alter table(?! public\.(consent_purposes|user_consents|usage_counters) enable row level security)/i);
    expect(code).not.toMatch(/\bcreate (trigger|view|index|type|extension|schema)\b/i);
  });

  it('writes no row except the seed', () => {
    expect(code.match(/\binsert into\b/gi)).toHaveLength(3);   // the seed, set_consent's upsert, hit_quota's upsert
    expect(code).not.toMatch(/\btruncate\b/i);
  });

  it('carries no secret or key', () => {
    expect(sql).not.toMatch(/api[_-]?key|secret|token|password/i);
  });
});
