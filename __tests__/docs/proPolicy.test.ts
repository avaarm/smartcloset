/**
 * The professional accounts (stylists and their clients) side of the public wording: the privacy page and the
 * moderation runbook, read as text. documentation/design/pro-accounts.md sections 3.7, 5, 6.7 and 6.8 are the
 * contract. __tests__/docs/privacyPolicy.test.ts checks the landmarks (the order of sections and rows, the
 * sentences shared with the other features); this file checks what the new section says, that its retention
 * table is the one of 3.7, that the runbook names what the database defines, and that the first release does
 * not promise anything it does not do (no directory, no payment, no verification, no push).
 */
import fs from 'fs';
import path from 'path';
import { PRO_CLIENT_TERMS, PRO_INDEPENDENT_LINE, PRO_STYLIST_TERMS } from '../../src/config/proRules';

const root = path.join(__dirname, '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('docs', 'privacy.html');
const moderation = read('docs', 'MODERATION.md');
const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'));

const decode = (s: string) => s.replace(/&amp;/g, '&');
const visible = (s: string) => decode(s.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Words the repository keeps out of every file, built from pieces so this file does not contain them.
const FORBIDDEN = [['cl', 'aude'], ['anthr', 'opic'], ['co-auth', 'ored-by']].map(p => p.join(''));

const HEADING = 'Working with a stylist (optional)';
const text = visible(html);
const sectionStart = html.indexOf(`<h2>${HEADING}</h2>`);
const sectionHtml = sectionStart < 0 ? '' : html.slice(sectionStart, html.indexOf('<h2>', sectionStart + 1));
const section = visible(sectionHtml);
const infoRow = visible(html.split('</tr>').find(tr => tr.includes(`<td>${HEADING}</td>`)) ?? '');

const cells = (tr: string) => [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => visible(m[1]));
const retentionRows = sectionHtml.split('</tr>').map(cells).filter(c => c.length === 2);
const days = (s: string) => [...s.matchAll(/\b(\d+) days?\b/g)].map(m => Number(m[1]));

describe('docs/privacy.html: working with a stylist', () => {
  it('has its own section between the swaps and the general retention list, and a row in the table', () => {
    expect(sectionStart).toBeGreaterThan(html.indexOf('<h2>Clothing swaps (optional)</h2>'));
    expect(sectionStart).toBeLessThan(html.indexOf('<h2>How long we keep it</h2>'));
    expect(infoRow).toContain(HEADING);
    expect(section.length).toBeGreaterThan(1500);
  });

  it('says the stylists are independent, that nothing about them is checked, and that no payment is taken', () => {
    expect(section).toContain('Independent professionals. Stylists are independent professionals. SmartCloset does not check or vouch for them');
    expect(section).toContain('is not a party to anything you arrange with a stylist');
    expect(section).toContain('SmartCloset never takes payment, adds fees or holds money');
    expect(section).toContain('any fee is agreed directly between you and your stylist, outside the app');
  });

  it('says connecting shares nothing and lists exactly the closet fields of 5.1, and what is never shared', () => {
    expect(section).toContain('Connecting shares nothing.');
    expect(section).toContain('never your account name or email address');
    expect(section).toContain('only if you switch that on for that connection');
    expect(section).toContain('and never your wishlist');
    expect(section).toContain('including pieces you add while sharing is on');
    expect(section).toContain('its cover photo, name, category, subcategory, color, brand, season, pattern, material, materials, size and condition');
    for (const never of ['what you paid or the retail price', 'your notes, tags or label text', 'how often you wear things', 'your outfits', 'your style, body or skin-tone profile', 'your face photo', 'your location', 'your email address or phone number', 'your friends or your swaps']) {
      expect(section).toContain(never);
    }
  });

  it('says what happens to photos: no location or camera details, and a photo can show more than the clothes', () => {
    expect(section).toContain('Photos are sent to the stylist without location or camera details');
    expect(section).toContain('a photo can show more than the clothes');
    expect(section).toContain('especially children');
  });

  it('says who can read a stylist profile, and that the feature sends nothing to an AI service', () => {
    expect(section).toContain("is visible only to someone who holds one of that stylist's invite codes or is connected to them");
    expect(section).toContain('Nothing in this feature is sent to an AI service, and a stylist cannot start one on your pieces');
  });

  it('says what a session tells the other person about where you are: an offset from UTC and never a place', () => {
    expect(section).toContain("A session shows the other person only the time on the proposer's clock and its offset from UTC (for example UTC+1)");
    expect(section).toContain('that is a time, not a place, and no city or region is ever shown');
    expect(infoRow).toContain('the offset from UTC of the device that proposes it (for example UTC+1)');
    expect(`${section} ${infoRow}`).not.toMatch(/time ?zone/i);                       // the zone's name is not shared, so the page does not talk of it
  });

  it('says what a look keeps, that the stylist sees whether and when it was opened, and what an invite label is', () => {
    expect(section).toContain('A look the stylist writes keeps the name and category of each piece they put in it, and nothing else about the piece, until the look or the connection is deleted');
    expect(section).toContain("which includes the names and categories of the pieces in looks they wrote: those stay in the look when you switch sharing off");
    expect(section).toContain('your stylist can see whether and when you opened a look');
    expect(infoRow).toContain('your invite codes, each with an optional private label that only you see');
  });

  it('gives the client the control the design promises, and the limits of it', () => {
    expect(section).toContain('You can switch closet sharing off at any time');
    expect(section).toContain('the stylist loses access straight away');
    expect(section).toContain('Turning it off sends your stylist no message');
    expect(section).toContain('Sharing also ends by itself after 90 days unless you renew it, and when either of you ends the connection');
    expect(section).toContain("We can't take back what a stylist has already seen");
    expect(section).toContain('we cannot stop a screenshot');
    expect(section).toContain('when your closet was last viewed and how many closet pages the stylist looked at in the last 30 days');
    expect(section).toContain('Either of you can end a connection, report the other or block them at any time');
  });

  it('says messages are stored, readable only on a report or to run the service, and not end-to-end encrypted', () => {
    expect(section).toContain('are stored on our servers and are not end-to-end encrypted');
    expect(section).toContain('We read them only if someone reports them or to keep the service running');
    expect(section).toContain('never pay by gift card, cryptocurrency or wire transfer');
  });

  it('says the age rule and that a date of birth is not stored', () => {
    expect(section).toContain('Stylists and clients must be 18 or over');
    expect(section).toContain('not your date of birth');
  });

  it('says what each person keeps when the other deletes their account, and that a block deletes at once', () => {
    expect(section).toContain('your stylist keeps a "Former client" line with the dates for about 90 days');
    expect(section).toContain('your clients keep the looks and session records you already sent them, labeled "Former stylist", for about 90 days, and the messages they sent for about 30 days');
    expect(section).toContain('the looks and sessions of your connections are deleted too');
    expect(section).toContain('Looks you wrote but did not send are deleted.');
    expect(section).toContain('Copies in routine backups are overwritten on their normal schedule');
    expect(retentionRows.map(r => r[0]).join('\n')).toContain('blocks the other (messages, looks, sessions, view counts and sharing history)');
  });

  it('promises nothing the first release does not do', () => {
    const everything = `${section} ${infoRow}`;
    expect(everything).not.toMatch(/\bmarketplace\b|\bdirectory\b|\bpush\b|notification|star rating|\bverified\b|\bcertified\b|\bfeatured\b|top rated|\bpremium\b|\bcheckout\b|\bdeposit\b|\bcommission\b|\bsubscription\b/i);
    // No state of a person or of a connection is advertised: the page names no badge and no rank.
    expect(everything).not.toMatch(/\bapproved\b|\bbadge\b|\brank(ed|ing)?\b/i);
  });

  it('keeps the one contact address in the Contact line at the end and puts none in the section', () => {
    expect(section).not.toMatch(/@/);
    expect(html.match(/mailto:/g)).toHaveLength(1);
  });
});

// documentation/design/pro-accounts.md 3.7, one entry per row of its table, in the order the page shows them.
// Rows without a number say what the design says instead (a block, the next read, either account, the account).
const RETENTION_3_7: { what: RegExp; days: number[]; how?: RegExp; about?: boolean }[] = [
  { what: /^Messages with a stylist or a client$/, days: [30, 180], about: true },
  { what: /^The connection and its looks, sessions and sharing history$/, days: [90], about: true },
  { what: /^The content of a connection that ends because one of you blocks the other/, days: [], how: /^Deleted at once$/ },
  { what: /^Invite codes$/, days: [30], about: true },
  { what: /^Daily counts of closet pages a stylist viewed$/, days: [90], about: true },
  { what: /^Which pieces you share, and until when$/, days: [], how: /removed the next time either of you loads your connections/ },
  { what: /^Counters that limit spam$/, days: [2] },
  { what: /^Reports about a stylist or a client/, days: [], how: /deleted with either account/ },
  { what: /^Your stylist profile, invite codes, sharing settings and the messages you sent$/, days: [], how: /^Deleted when you delete your account$/ },
];

// The page and the terms a person accepts in the app (design Appendix A) must not disagree.
describe('docs/privacy.html: agrees with the in-app terms', () => {
  const termsBody = (terms: typeof PRO_CLIENT_TERMS, heading: string) => terms.sections.find(s => s.heading === heading)?.body ?? '';
  const clientEnds = termsBody(PRO_CLIENT_TERMS, 'When it ends');
  const stylistEnds = termsBody(PRO_STYLIST_TERMS, 'Ending, and deleting');
  const pageDays = new Set(retentionRows.flatMap(r => days(r[1])));

  it('uses the same independence line', () => {
    expect(section).toContain(PRO_INDEPENDENT_LINE.replace(/\.$/, ''));
  });

  it('states the days the terms state, and the same labels for what a person keeps', () => {
    expect(clientEnds).not.toBe('');
    expect(stylistEnds).not.toBe('');
    for (const n of [...clientEnds.matchAll(/about (\d+)/g), ...stylistEnds.matchAll(/about (\d+)/g)].map(m => Number(m[1]))) {
      expect(`${n}: ${pageDays.has(n)}`).toBe(`${n}: true`);
    }
    expect(clientEnds).toContain('"Former stylist"');
    expect(stylistEnds).toContain('"Former stylist"');
    expect(section).toContain('"Former stylist"');
    expect(section).toContain('"Former client"');
  });

  it('says what the terms say about a block, and about the consent a client gives', () => {
    expect(clientEnds).toContain('deleted straight away');
    expect(retentionRows.find(r => /blocks the other/.test(r[0]))?.[1]).toBe('Deleted at once');
    expect(section).toContain('Sharing also ends by itself after 90 days unless you renew it');
    expect(section).toContain("We can't take back what a stylist has already seen");
  });
});

describe('docs/privacy.html: the stylist retention table', () => {
  it('is the table of design section 3.7, row for row, with the same numbers of days', () => {
    expect(retentionRows).toHaveLength(RETENTION_3_7.length);
    RETENTION_3_7.forEach((expected, i) => {
      const [what, how] = retentionRows[i];
      expect(what).toMatch(expected.what);
      expect(days(how)).toEqual(expected.days);
      if (expected.how) {
        expect(how).toMatch(expected.how);
      }
      if (expected.about) {
        expect(how).toContain('about');
      }
    });
  });

  it('is pointed at by the general retention list', () => {
    expect(text).toContain('Working with a stylist — see the table under Working with a stylist.');
  });
});

// The numbers the page and the runbook state, with the sentence that states them. The database is the authority:
// when PDB1's foundation file is in the folder, each is compared with pro_limit() (the same textual shape the
// in-step tests of the other streams parse).
const STATED: { limit: string; value: number; source: 'page' | 'runbook'; says: string }[] = [
  { limit: 'message_retention_days', value: 180, source: 'page', says: 'about 180 days after they were sent' },
  { limit: 'ended_message_retention_days', value: 30, source: 'page', says: 'about 30 days after the connection ends' },
  { limit: 'ended_connection_retention_days', value: 90, source: 'page', says: 'about 90 days after the connection ends' },
  { limit: 'grant_days', value: 90, source: 'page', says: 'ends by itself after 90 days' },
  { limit: 'hold_release_days', value: 7, source: 'runbook', says: 'releases itself after 7 days' },
  { limit: 'report_window_days', value: 14, source: 'runbook', says: 'within 14 days' },
  { limit: 'reports_to_hold_stylist', value: 2, source: 'runbook', says: 'Two different reporters' },
  { limit: 'stylist_clients_probation', value: 3, source: 'runbook', says: 'a limit of 3 active clients and 1 live invite' },
  { limit: 'invites_live_probation', value: 1, source: 'runbook', says: 'a limit of 3 active clients and 1 live invite' },
  { limit: 'stylist_clients', value: 25, source: 'runbook', says: 'to 25 clients and 10 live invites' },
  { limit: 'invites_live', value: 10, source: 'runbook', says: 'to 25 clients and 10 live invites' },
  { limit: 'churn_connections', value: 10, source: 'runbook', says: 'a run of ten connections' },
  { limit: 'churn_hours', value: 48, source: 'runbook', says: 'ended within 48 hours of starting' },
  { limit: 'qualified_reporter_hours', value: 48, source: 'runbook', says: 'at least 48 hours old' },
  { limit: 'qualified_connection_hours', value: 24, source: 'runbook', says: 'a connection of at least 24 hours' },
  { limit: 'qualified_connection_messages', value: 3, source: 'runbook', says: 'at least 3 text messages' },
  { limit: 'evidence_body_chars', value: 300, source: 'runbook', says: 'cut to 300 characters' },
];

const foundation = migrations.find(f => /^\d{14}_pro_foundation\.sql$/.test(f));
const foundationSql = foundation ? read('supabase', 'migrations', foundation) : '';
const sqlLimit = (name: string) => Number(foundationSql.match(new RegExp(`when '${name}'\\s+then (\\d+)`))?.[1]);
// Skipped, and shown as skipped, until the database stream's foundation file exists.
const whenFoundationExists = foundation ? it : it.skip;
const upkeep = migrations.find(f => /^\d{14}_pro_upkeep\.sql$/.test(f));
const upkeepSql = upkeep ? read('supabase', 'migrations', upkeep) : '';
const whenUpkeepExists = upkeep ? it : it.skip;

describe('the numbers the page and the runbook state', () => {
  it('are written where the page and the runbook say them', () => {
    const proRunbook = moderation.slice(moderation.indexOf('\n## Professional accounts\n'));
    for (const s of STATED) {
      expect(`${s.limit}: ${(s.source === 'page' ? section : proRunbook).includes(s.says)}`).toBe(`${s.limit}: true`);
    }
  });

  whenFoundationExists('are the numbers pro_limit() holds', () => {
    for (const s of STATED) {
      expect(`${s.limit}: ${sqlLimit(s.limit)}`).toBe(`${s.limit}: ${s.value}`);
    }
  });

  // The three numbers of the table that are not in pro_limit() are literals of the janitor (design 4.9).
  // Skipped, and shown as skipped, until the upkeep file exists.
  whenUpkeepExists('are the janitor\'s: counters 2 days, closet view counts 90, invite codes 30', () => {
    expect(upkeepSql).toMatch(/pro_rate_counters[\s\S]{0,300}?interval '2 days'/);
    expect(upkeepSql).toMatch(/pro_closet_views[\s\S]{0,300}?(current_date\s*-\s*90|interval '90 days')/);
    expect(upkeepSql).toMatch(/pro_invites[\s\S]{0,600}?interval '30 days'/);
  });
});

// Skipped, and shown as skipped, until the moderation file (PDB3) exists.
const moderationFile = migrations.find(f => /^\d{14}_pro_moderation\.sql$/.test(f));
const moderationSql = moderationFile ? read('supabase', 'migrations', moderationFile) : '';
const whenModerationExists = moderationFile ? it : it.skip;

describe('the runbook names what the moderation file defines', () => {
  whenModerationExists('defines the seven actions, the switch, the digest and the two views', () => {
    const defines = (kind: 'function' | 'view', name: string) =>
      new RegExp(`create (or replace )?${kind} (public\\.)?${name}\\b`, 'i').test(moderationSql);
    const functions = ['pro_admin_approve_stylist', 'pro_admin_hold_stylist', 'pro_admin_release_stylist', 'pro_admin_suspend', 'pro_admin_unsuspend', 'pro_admin_remove_stylist', 'pro_admin_restore_stylist', 'pro_set_enabled', 'pro_send_report_digest'];
    for (const fn of functions) {
      expect(`${fn}: ${defines('function', fn)}`).toBe(`${fn}: true`);
    }
    for (const view of ['pro_moderation_queue', 'pro_review_queue']) {
      expect(`${view}: ${defines('view', view)}`).toBe(`${view}: true`);
    }
  });

  whenModerationExists('refuses the switch below 50 terms, as the runbook says', () => {
    expect(moderationSql).toMatch(/swap_blocked_terms[\s\S]{0,400}?50|50[\s\S]{0,400}?swap_blocked_terms/);
  });
});

// The runbook's professional section runs to the end of the file.
const proStart = moderation.indexOf('\n## Professional accounts\n');
const pro = proStart < 0 ? '' : moderation.slice(proStart);

describe('docs/MODERATION.md: professional accounts', () => {
  it('is the last section, after the swap runbook, and the top of the file points to it', () => {
    expect(proStart).toBeGreaterThan(moderation.indexOf('## What cannot be seen\n'));
    expect(moderation).toContain('Professional accounts (stylists and their clients) have their own section at the end of this file.');
    for (const heading of [
      '### Professional reports: the alert',
      '### Professional reports: the queue',
      '### New stylists: the review queue',
      '### Professional accounts: actions',
      '### Professional accounts: switches',
      '### Professional accounts: filters and the term list',
      '### Professional accounts: what cannot be seen',
    ]) {
      expect(pro).toContain(`${heading}\n`);
    }
  });

  it('names the two views and the seven actions the database defines, and the switch', () => {
    const actions = ['pro_admin_approve_stylist', 'pro_admin_hold_stylist', 'pro_admin_release_stylist', 'pro_admin_suspend', 'pro_admin_unsuspend', 'pro_admin_remove_stylist', 'pro_admin_restore_stylist'];
    for (const fn of actions) {
      expect(pro).toContain(`select ${fn}(`);
    }
    expect(pro).toContain('select * from pro_moderation_queue;');
    expect(pro).toContain('select * from pro_review_queue;');
    expect(pro).toContain('select pro_set_enabled(false);');
    // Nothing else of the admin family is named: a typo or a function that does not exist would fail here.
    const named = new Set([...pro.matchAll(/\bpro_admin_\w+/g)].map(m => m[0]));
    expect([...named].sort()).toEqual([...actions].sort());
    expect(pro).toContain("update content_reports set reviewed_at = now(), outcome = 'suspended' where id = '<report id>';");
  });

  it('tells the reviewer the order to read in, what a report holds and when it counts', () => {
    expect(pro).toContain('Read in this order: `underage`, `unsafe_meeting`, anything that threatens someone, then the rest.');
    expect(pro).toContain('`pro_profile`, `pro_chat` or `pro_content`');
    expect(pro).toContain('the last 30 messages marked reporter, reported or system, with `flaggedMessageId`');
    expect(pro).toContain('`qualified`: true only when');
    expect(pro).toContain('A report made from an invite preview is never qualified.');
    expect(pro).toContain('Never the rest of a client\'s closet, a photo or a storage path.');
    expect(pro).toContain('the reason, the details the reporter wrote, the reported account');
  });

  it('describes the review of new stylists without calling anyone verified', () => {
    expect(pro).toContain('Read the profile text of each one');
    expect(pro).toContain('Approving lifts the limits');
    expect(pro).toContain('clients are never shown it, and nobody in the app is called verified, certified or approved');
    // The only places the words appear are the two sentences that deny them.
    expect(pro).toContain('and nobody is verified:');
    const rest = pro.replace('and nobody is verified:', '').replace('nobody in the app is called verified, certified or approved', '');
    expect(rest).not.toMatch(/\b(verified|certified|featured|top rated)\b/i);
  });

  it('keeps every hold reversible and every suspension a person\'s decision', () => {
    expect(pro).toContain('A hold made by you never expires.');
    expect(pro).toContain('releases itself after 7 days unless you confirm it with `pro_admin_hold_stylist`');
    expect(pro).toContain('That is reversible by you and never suspends or ends anything: suspending a member is always a person\'s decision.');
    expect(pro).toContain('closing and re-creating a profile resets none of them');
    expect(pro).toContain('the person can still stop sharing, end a connection, report, block and export their data while it stands');
  });

  it('only promises 24 hours while someone is told when reports are waiting, and says how to prove the alert', () => {
    expect(pro).toContain('only true while someone is told when reports are waiting');
    expect(pro).toContain('swap_report_webhook');
    expect(pro).toContain("select public.pro_send_report_digest(interval '0 seconds');");
    expect(pro).toContain("select cron.schedule('pro-report-digest', '11 * * * *', $$ select public.pro_send_report_digest(); $$);");
    expect(pro).toContain('reword the 24-hour aim in the app to "as soon as we can"');
  });

  it('keeps the switch behind the reviewed term list, and the ways out working while it is off', () => {
    expect(pro).toContain('turning it on refuses until at least 50 terms are in `swap_blocked_terms`');
    expect(pro).toContain('stop sharing, end a connection, block, report, unblock and export keep working');
  });

  it('says reports go with either account, and what a suspended person can still do', () => {
    expect(pro).toContain('Reports and their evidence are deleted when either account is deleted.');
    expect(pro).toContain('No suppression record is kept. If the owner decides to keep a minimal one, that changes the privacy policy first.');
    expect(pro).toContain('A report never reveals who reported to the reported person.');
    expect(pro).toContain('never the word blocked');
  });

  it('holds no secret, link or address to post to', () => {
    expect(pro).not.toMatch(/https?:\/\//);
    expect(pro).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(pro).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
    expect(pro).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});

describe('the policy and the runbook never name an AI assistant or its maker', () => {
  it('is true of the page', () => {
    for (const word of FORBIDDEN) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });

  it('is true of the runbook', () => {
    for (const word of FORBIDDEN) {
      expect(moderation.toLowerCase()).not.toContain(word);
    }
  });

  it('is true of this file', () => {
    const self = fs.readFileSync(__filename, 'utf8').toLowerCase();
    for (const word of FORBIDDEN) {
      expect(self).not.toContain(word);
    }
  });
});

// Section 6.8: the manifest and the store label take no new data type for this feature, and Info.plist and the
// entitlements take no new permission. The page's own claims rest on this, so it is asserted here and not left
// to a person re-reading the file.
describe('the privacy manifest and the app configuration need no change for professional accounts', () => {
  const plist = read('ios', 'smartcloset', 'PrivacyInfo.xcprivacy');
  const info = read('ios', 'smartcloset', 'Info.plist');
  const entitlements = read('ios', 'smartcloset', 'smartcloset.entitlements');
  const collected = plist.split('<key>NSPrivacyCollectedDataTypes</key>')[1]?.split('<key>NSPrivacyTracking</key>')[0] ?? '';
  const entries = [...collected.matchAll(/<dict>([\s\S]*?)<\/dict>/g)].map(m => ({
    type: m[1].match(/<key>NSPrivacyCollectedDataType<\/key>\s*<string>(\w+)<\/string>/)?.[1],
    linked: m[1].match(/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>/)?.[1],
    tracking: m[1].match(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/)?.[1],
    purposes: [...(m[1].match(/<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '').matchAll(/<string>(\w+)<\/string>/g)].map(p => p[1]),
  }));

  it('already declares the types 6.8 relies on, linked, not for tracking, for app functionality', () => {
    // Name (the chosen name), EmailsOrTextMessages (messages), OtherUserContent (profile text, looks),
    // PhotosorVideos (shared closet pieces).
    for (const t of ['Name', 'EmailsOrTextMessages', 'OtherUserContent', 'PhotosorVideos']) {
      const entry = entries.find(e => e.type === `NSPrivacyCollectedDataType${t}`);
      expect(`${t}: ${JSON.stringify(entry)}`).toBe(`${t}: ${JSON.stringify({
        type: `NSPrivacyCollectedDataType${t}`, linked: 'true', tracking: 'false', purposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      })}`);
    }
  });

  it('asks for no phone number, contacts, calendar, microphone, push or background mode', () => {
    for (const key of ['NSPrivacyCollectedDataTypePhoneNumber', 'NSPrivacyCollectedDataTypeContacts', 'NSPrivacyCollectedDataTypeDeviceID']) {
      expect(plist).not.toContain(key);
    }
    for (const key of ['NSContactsUsageDescription', 'NSCalendarsUsageDescription', 'NSMicrophoneUsageDescription', 'NSUserTrackingUsageDescription', 'UIBackgroundModes']) {
      expect(info).not.toContain(key);
    }
    expect(entitlements).not.toContain('aps-environment');
  });
});
