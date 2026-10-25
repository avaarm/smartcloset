/**
 * The numbers, lists and versions that the client keeps in src/config/proRules.ts must say what the database says
 * (documentation/design/pro-accounts.md 4.3): a limit the app shows that the server does not enforce, or the other way
 * round, is a bug that every suite would otherwise miss. This reads the pro migrations as text, the way
 * swapMigrations.test.ts does, and compares them with the client's constants.
 */
import fs from 'fs';
import path from 'path';
import {
  PRO_ALIAS_RANGE, PRO_CLIENT_TERMS_VERSION, PRO_DURATION, PRO_LANGUAGES_MAX, PRO_LIMITS, PRO_RATING_RANGE, PRO_REPORT_REASONS, PRO_UTC_OFFSET_RANGE,
  PRO_SERVICES, PRO_SERVICES_MAX, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION, PRO_SYSTEM_LINES, PRO_TEXT_LIMITS,
} from '../src/config/proRules';
import { PRO_ERROR_CODES } from '../src/services/proErrors';
import { readPro } from '../supabase/tests/pro/migrationFiles';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
// Found by name, not by digits: the release renames the pro files (pro-accounts.md 3.1, 11.1 P3).
const [FOUNDATION, UPKEEP, PROFILES, CONNECTIONS, SHARING, WORK, MODERATION] =
  (['foundation', 'upkeep', 'profiles_invites', 'connections', 'sharing', 'work', 'moderation'] as const).map(n => readPro(n));
const FRIEND_MODERATION = fs.readFileSync(path.join(dir, '20261006000000_friend_moderation.sql'), 'utf8');
const ALL = [FOUNDATION, UPKEEP, PROFILES, CONNECTIONS, SHARING, WORK, MODERATION].join('\n');

const code = (sql: string): string => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
const words = (list: string): string[] => [...list.matchAll(/'(\w+)'/g)].map(m => m[1]);

describe('proRules.ts and the pro migrations', () => {
  it('state the same limits, by name and by number', () => {
    const sql = Object.fromEntries([...FOUNDATION.matchAll(/when '(\w+)'\s+then (\d+)/g)].map(m => [m[1], Number(m[2])]));
    expect(Object.keys(sql)).toHaveLength(49);
    expect(sql).toEqual({ ...PRO_LIMITS });
  });

  it('state the same terms and consent text versions as the rows the server is seeded with', () => {
    const seed = (key: string) => new RegExp(`\\('${key}',\\s+'"([^"]+)"'::jsonb\\)`).exec(FOUNDATION)![1];
    expect(seed('stylist_terms_version')).toBe(PRO_STYLIST_TERMS_VERSION);
    expect(seed('client_terms_version')).toBe(PRO_CLIENT_TERMS_VERSION);
    expect(seed('share_text_version')).toBe(PRO_SHARE_TEXT_VERSION);
  });

  it('bound the text the same way, field by field', () => {
    const f = code(FOUNDATION);
    const t = PRO_TEXT_LIMITS;
    expect(f).toContain(`char_length(display_name) between ${t.display_name_min} and ${t.display_name_max}`);
    expect(f).toContain(`check (char_length(headline) <= ${t.headline})`);
    expect(f).toContain(`check (char_length(bio) <= ${t.bio})`);
    expect(f).toContain(`check (char_length(rates_text) <= ${t.rates})`);
    expect(f).toContain(`check (client_alias is null or char_length(client_alias) <= ${t.alias_max})`);
    expect(f).toContain(`check (label is null or char_length(label) <= ${t.label})`);
    expect(f).toContain(`check (stylist_label is null or char_length(stylist_label) <= ${t.display_name_max})`);
    expect(f).toContain(`check (char_length(place) <= ${t.place})`);
    expect(f).toContain(`check (char_length(note) <= ${t.session_note})`);
    expect(f).toContain(`check (char_length(body) <= ${t.message})`);                          // pro_messages
    expect(f).toContain(`char_length(title) between 1 and ${t.look_title}`);
    expect(f).toContain(`check (char_length(body) <= ${t.look_body})`);                        // pro_recommendations
    expect(f).toContain(`check (client_comment is null or char_length(client_comment) <= ${t.comment})`);
    // the functions enforce the same numbers before the table does
    expect(code(PROFILES)).toContain(`pro_clean_name(p_display_name, ${t.display_name_min}, ${t.display_name_max})`);
    expect(code(PROFILES)).toContain(`char_length(hl) > ${t.headline}`);
    expect(code(PROFILES)).toContain(`char_length(bi) > ${t.bio}`);
    expect(code(PROFILES)).toContain(`char_length(rt) > ${t.rates}`);
    expect(code(PROFILES)).toContain(`pro_clean_name(p_label, 0, ${t.label})`);
    expect(code(PROFILES)).toContain(`pro_clean_name(p_alias, ${t.alias_min}, ${t.alias_max})`);
    expect(code(CONNECTIONS)).toContain(`pro_clean_name(p_alias, ${t.alias_min}, ${t.alias_max})`);
    expect(code(WORK)).toContain(`pro_clean_name(p_title, 1, ${t.look_title})`);
    expect(code(WORK)).toContain(`char_length(bdy) > ${t.look_body}`);
    // report details: the function cuts to 500 and the table of friend reports checks 500
    expect(code(MODERATION)).toContain(`'^\\s+|\\s+$', '', 'g'), ''), ${t.report_details})`);   // the details are trimmed, then cut
    expect(code(FRIEND_MODERATION)).toContain(`char_length(details) <= ${t.report_details}`);
    expect({ min: PRO_ALIAS_RANGE.min, max: PRO_ALIAS_RANGE.max }).toEqual({ min: t.alias_min, max: t.alias_max });
  });

  it('offer the same closed list of services, the same most services and the same most languages', () => {
    const ids = PRO_SERVICES.map(s => s.id);
    const table = words(/services <@ array\[([^\]]*)\]/.exec(code(FOUNDATION))![1]);
    expect(table).toEqual(ids);
    expect(words(/pro_clean_list\(p_services,\s*array\[([^\]]*)\]/.exec(code(PROFILES))![1])).toEqual(ids);
    expect(code(FOUNDATION)).toContain(`cardinality(services) between 1 and ${PRO_SERVICES_MAX}`);
    expect(code(PROFILES)).toContain(`'in_person_sessions'], ${PRO_SERVICES_MAX})`);
    expect(code(FOUNDATION)).toContain(`cardinality(languages) <= ${PRO_LANGUAGES_MAX}`);
    expect(code(PROFILES)).toContain(`pro_clean_list(p_languages, null, ${PRO_LANGUAGES_MAX})`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(PRO_SERVICES_MAX);
  });

  it('use the same length of a session, the same rating scale and the same number of pieces in a look', () => {
    const f = code(FOUNDATION);
    expect(f).toContain(`duration_minutes between ${PRO_DURATION.min} and ${PRO_DURATION.max} and duration_minutes % ${PRO_DURATION.step} = 0`);
    expect(f).toContain(`client_rating between ${PRO_RATING_RANGE.min} and ${PRO_RATING_RANGE.max}`);
    expect(f).toContain(`position between 1 and ${PRO_LIMITS.items_per_look}`);
    expect(code(WORK)).toContain(`p_rating < ${PRO_RATING_RANGE.min} or p_rating > ${PRO_RATING_RANGE.max}`);
    expect(code(WORK)).toMatch(/p_duration_minutes[^;]*% 15/);
  });

  it('use the same range of offsets from UTC for a session, in the table and in the function that takes it', () => {
    const { min, max, step } = PRO_UTC_OFFSET_RANGE;
    expect(code(FOUNDATION)).toContain(`utc_offset_minutes between ${min} and ${max} and utc_offset_minutes % ${step} = 0`);
    expect(code(WORK)).toContain(`p_utc_offset_minutes < ${min} or p_utc_offset_minutes > ${max} or p_utc_offset_minutes % ${step} <> 0`);
  });

  it('take the same reasons for a report, and the table accepts each of them', () => {
    const reasons = PRO_REPORT_REASONS.map(r => r.value);
    const inFunction = words(/p_reason not in \(([^)]*)\)/.exec(code(MODERATION).slice(code(MODERATION).indexOf('function public.report_pro_content')))![1]);
    expect([...inFunction].sort()).toEqual([...reasons].sort());
    const table = words(/content_reports_reason_check check \(reason in \(([^)]*)\)/.exec(code(MODERATION))![1]);
    for (const r of reasons) {expect(table).toContain(r);}
    expect(reasons).toHaveLength(11);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('show the same grey lines in a thread as the server writes into one', () => {
    const written = [...new Set([...code(ALL).matchAll(/\(connection_id, kind, code\) values \([^()]*'system',\s*'(\w+)'\)/g)].map(m => m[1]))].sort();
    expect(written).toEqual(Object.keys(PRO_SYSTEM_LINES).sort());
  });

  it('know every error the server raises, and say the same SQLSTATE every time it is raised', () => {
    const raised = new Map<string, Set<string>>();
    for (const m of code(ALL).matchAll(/pro_raise\('(\w+)',\s*'(\w+)'/g)) {
      if (!raised.has(m[1])) {raised.set(m[1], new Set());}
      raised.get(m[1])!.add(m[2]);
    }
    expect(raised.size).toBeGreaterThan(30);
    for (const [message, states] of raised) {
      expect({ message, known: PRO_ERROR_CODES.includes(message as never) }).toEqual({ message, known: true });
      expect({ message, states: [...states] }).toEqual({ message, states: [[...states][0]] });
    }
    // every code the client knows is raised somewhere, but invite_invalid, which the two invite lookups return as a result
    const unraised = PRO_ERROR_CODES.filter(c => !raised.has(c));
    expect(unraised).toEqual(['invite_invalid']);
    expect(code(PROFILES)).toContain("jsonb_build_object('valid', false, 'error', 'invite_invalid')");
  });

  it('keep every counter the SQL checks a name that pro_limit defines, with a window in its name', () => {
    const defined = new Set(Object.keys(PRO_LIMITS));
    for (const m of code(ALL).matchAll(/pro_limit\('(\w+)'\)/g)) {expect(defined.has(m[1])).toBe(true);}
    for (const m of code(ALL).matchAll(/pro_rate_check\(\w+,\s*'(\w+)'\)/g)) {
      expect(defined.has(m[1])).toBe(true);
      expect(m[1]).toMatch(/_(min|hour|day)$/);
    }
  });
});
