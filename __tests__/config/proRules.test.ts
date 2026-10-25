/**
 * The wording and numbers other code relies on (documentation/design/pro-accounts.md 4.3, 7.5, Appendix A). The
 * numbers are compared with the database by proRulesInStepWithSql.test.ts; the wording is compared with the
 * policy page by the policy tests.
 */
import fs from 'fs';
import path from 'path';
import * as rules from '../../src/config/proRules';
import {
  looksLikePaymentTalk,
  PRO_ALIAS_RANGE,
  PRO_BLOCK_EXPLANATION,
  PRO_CLIENT_TERMS,
  PRO_CLIENT_TERMS_VERSION,
  PRO_CLOSED_BY_ME,
  PRO_CLOSED_BY_THEM,
  PRO_CONNECT_NOTE,
  PRO_GUIDELINES,
  PRO_GUIDELINES_ENFORCEMENT,
  PRO_INDEPENDENT_LINE,
  PRO_LANGUAGES,
  PRO_LIMITS,
  PRO_NO_PAYMENT_LINE,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_PAYMENT_WARNING,
  PRO_PHOTO_TTL_SECONDS,
  PRO_PICKER_REMINDER,
  PRO_POLL_MS,
  PRO_QUICK_REPLIES,
  PRO_REPORT_REASONS,
  PRO_REPORT_THANKS,
  PRO_SAFETY_ONLY_NOTE,
  PRO_SAFETY_TIPS,
  PRO_SERVER_BEHIND_MESSAGE,
  PRO_SERVICES,
  PRO_SHARE_ALL_HINT,
  PRO_SHARE_CONSENT,
  PRO_SHARE_TEXT_VERSION,
  PRO_SHARING_STOPPED_NOTE,
  PRO_STYLIST_BANNER,
  PRO_STYLIST_TERMS,
  PRO_STYLIST_TERMS_VERSION,
  PRO_SUSPENDED_MESSAGE,
  PRO_SYSTEM_LINES,
  PRO_TEXT_LIMITS,
  PRO_UPDATE_REQUIRED_MESSAGE,
  PRO_CLOSET_ASK_HINT,
  PRO_SAFETY_ELSEWHERE_NOTE,
  PRO_UTC_OFFSET_RANGE,
  proClosetNotShared,
  proClosetNotSharedTitle,
  proShareConsent,
} from '../../src/config/proRules';
import { SUPPORT_EMAIL } from '../../src/config/legal';

/** Every string the module exports as copy: constants, list items and the parts of the terms (not functions). */
const copyStrings = (): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const [name, value] of Object.entries(rules)) {
    if (/VERSION$/.test(name) || name.endsWith('_FUNCTION')) continue;
    walk(value);
  }
  return out;
};

describe('the three versions', () => {
  it('are the first release’s, as zero-padded year-month, so comparing them as text orders them', () => {
    expect([PRO_STYLIST_TERMS_VERSION, PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION]).toEqual(['2026-10', '2026-10', '2026-10']);
    for (const v of [PRO_STYLIST_TERMS_VERSION, PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION]) {
      expect(v).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
    expect('2026-09' < '2026-10' && '2026-10' < '2026-11' && '2026-12' < '2027-01').toBe(true);
  });
});

describe('PRO_LIMITS', () => {
  it('has the 49 names of 4.3, in snake_case, each a whole positive number', () => {
    const names = Object.keys(PRO_LIMITS);
    expect(names).toHaveLength(49);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    for (const value of Object.values(PRO_LIMITS)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('keeps the values other copy and rules are written around', () => {
    expect(PRO_LIMITS).toMatchObject({
      invite_expiry_days: 7, grant_days: 90, grant_warn_days: 7, stylist_clients: 25, stylist_clients_probation: 3, invites_live: 10,
      invites_live_probation: 1, client_connections: 5, items_per_look: 12, grant_items_max: 500, closet_page_size: 60,
      closet_pages_connection_day: 200, closet_page_day: 600, photo_day: 3000, invite_lookup_hour: 10, message_min: 6, message_hour: 60,
      message_day: 300, appointment_lead_minutes: 60, appointment_max_days_ahead: 180, appointments_open_per_connection: 5,
      drafts_per_connection: 30, reports_to_hold_stylist: 2, report_window_days: 14, hold_release_days: 7,
      ended_message_retention_days: 30, ended_connection_retention_days: 90, message_retention_days: 180, evidence_bytes: 18000, evidence_body_chars: 300,
    });
  });

  it('is consistent with itself: probation is smaller than approval, counters nest, a page fits the daily page caps', () => {
    expect(PRO_LIMITS.stylist_clients_probation).toBeLessThan(PRO_LIMITS.stylist_clients);
    expect(PRO_LIMITS.invites_live_probation).toBeLessThan(PRO_LIMITS.invites_live);
    expect(PRO_LIMITS.message_min).toBeLessThan(PRO_LIMITS.message_hour);
    expect(PRO_LIMITS.message_hour).toBeLessThan(PRO_LIMITS.message_day);
    expect(PRO_LIMITS.closet_pages_connection_day).toBeLessThan(PRO_LIMITS.closet_page_day);
    expect(PRO_LIMITS.grant_warn_days).toBeLessThan(PRO_LIMITS.grant_days);
    expect(PRO_LIMITS.ended_message_retention_days).toBeLessThan(PRO_LIMITS.ended_connection_retention_days);
    expect(PRO_LIMITS.evidence_bytes).toBeLessThan(20000);   // the content_reports check
  });

  it('is what the banner says about new stylists', () => {
    expect(PRO_STYLIST_BANNER).toBe(`New stylists start with a limit of ${PRO_LIMITS.stylist_clients_probation} clients and ${PRO_LIMITS.invites_live_probation} live invite.`);
  });

  it('is what the terms say about how long things last', () => {
    const text = JSON.stringify([PRO_CLIENT_TERMS, PRO_STYLIST_TERMS, PRO_SHARE_CONSENT]);
    expect(text).toContain(`${PRO_LIMITS.grant_days} days`);
    expect(text).toContain(`about ${PRO_LIMITS.ended_connection_retention_days} days`);
    expect(text).toContain(`messages about ${PRO_LIMITS.ended_message_retention_days}`);
  });
});

describe('text lengths', () => {
  it('are the table constraints of 3.4', () => {
    expect(PRO_TEXT_LIMITS).toEqual({
      display_name_min: 2, display_name_max: 40, headline: 80, bio: 500, rates: 120, alias_min: 2, alias_max: 30, label: 40, place: 120,
      session_note: 280, message: 500, look_title: 80, look_body: 1000, comment: 500, report_details: 500,
    });
  });

  it('give the range of a client’s chosen name', () => {
    expect(PRO_ALIAS_RANGE).toEqual({ min: 2, max: 30 });
  });
});

describe('the closed lists', () => {
  it('has the seven services of 3.4, with unique ids and labels a person can read', () => {
    expect(PRO_SERVICES.map(s => s.id)).toEqual([
      'wardrobe_audit', 'personal_shopping', 'outfit_styling', 'color_analysis', 'event_styling', 'virtual_sessions', 'in_person_sessions',
    ]);
    expect(PRO_SERVICES.map(s => s.label)).toEqual([
      'Wardrobe audit', 'Personal shopping', 'Outfit styling', 'Color analysis', 'Event styling', 'Virtual sessions', 'In-person sessions',
    ]);
    expect(new Set(PRO_SERVICES.map(s => s.label)).size).toBe(7);
  });

  it('has about twenty languages, each a unique two-letter lowercase code with a unique label', () => {
    expect(PRO_LANGUAGES.length).toBeGreaterThanOrEqual(15);
    expect(PRO_LANGUAGES.length).toBeLessThanOrEqual(25);
    for (const l of PRO_LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2}$/);
      expect(l.label.length).toBeGreaterThan(2);
    }
    expect(new Set(PRO_LANGUAGES.map(l => l.code)).size).toBe(PRO_LANGUAGES.length);
    expect(new Set(PRO_LANGUAGES.map(l => l.label)).size).toBe(PRO_LANGUAGES.length);
  });

  it('offers a reason for every report the server accepts, once, with a label a person can read', () => {
    expect(PRO_REPORT_REASONS.map(r => r.value).sort()).toEqual([
      'data_misuse', 'false_credentials', 'harassment', 'impersonation', 'inappropriate', 'other', 'scam', 'spam', 'underage', 'unsafe', 'unsafe_meeting',
    ]);
    for (const r of PRO_REPORT_REASONS) expect(r.label.length).toBeGreaterThan(5);
    expect(new Set(PRO_REPORT_REASONS.map(r => r.label)).size).toBe(PRO_REPORT_REASONS.length);
    expect(PRO_REPORT_REASONS[PRO_REPORT_REASONS.length - 1].value).toBe('other');
  });

  it('has the quick replies, the guidelines and the safety tips of Appendix A, each once', () => {
    expect(PRO_QUICK_REPLIES).toEqual(['Thanks!', 'Sounds good', 'Can we find another time?', "I'll update my closet"]);
    expect(PRO_GUIDELINES).toHaveLength(5);
    expect(PRO_SAFETY_TIPS).toHaveLength(5);
    for (const list of [PRO_QUICK_REPLIES, PRO_GUIDELINES, PRO_SAFETY_TIPS]) expect(new Set(list).size).toBe(list.length);
  });
});

describe('the terms', () => {
  it('have the eight sections of Appendix A, in order', () => {
    expect(PRO_STYLIST_TERMS.title).toBe('Stylist terms');
    expect(PRO_STYLIST_TERMS.sections.map(s => s.heading)).toEqual([
      'You are independent', 'Adults, and honesty', "Your clients' information", 'No payments in SmartCloset', 'Conduct',
      'Reports and enforcement', 'Ending, and deleting', 'Contact',
    ]);
    expect(PRO_CLIENT_TERMS.title).toBe('Client terms');
    expect(PRO_CLIENT_TERMS.sections.map(s => s.heading)).toEqual([
      'Independent professionals', 'You decide what to share', 'No payments', 'Adults only', 'Conduct and safety', 'When it ends',
      'Reports and enforcement', 'Contact',
    ]);
    for (const s of [...PRO_STYLIST_TERMS.sections, ...PRO_CLIENT_TERMS.sections]) {
      expect(s.body.length).toBeGreaterThan(15);
      expect(s.body).toBe(s.body.trim());
    }
  });

  it('say how to reach support, and leave no placeholder', () => {
    for (const terms of [PRO_STYLIST_TERMS, PRO_CLIENT_TERMS]) {
      const contact = terms.sections[terms.sections.length - 1];
      expect(contact.body).toBe(`Questions or urgent concerns: ${SUPPORT_EMAIL}.`);
      expect(JSON.stringify(terms)).not.toMatch(/<support email>|<name>/);
    }
  });

  it('say the promises the policy page makes: independent, no payments, adults, no tolerance, deletion', () => {
    const stylist = JSON.stringify(PRO_STYLIST_TERMS);
    const client = JSON.stringify(PRO_CLIENT_TERMS);
    expect(stylist).toMatch(/independent professional/);
    expect(stylist).toMatch(/does not take payments, hold money or add fees/);
    expect(stylist).toMatch(/Never ask for gift cards, cryptocurrency or wire transfers/);
    expect(stylist).toMatch(/You are 18 or older/);
    expect(stylist).toMatch(/Do not offer hair, makeup, skin, body-shaping, medical, dietary or weight-loss services/);
    expect(stylist).toMatch(/use it to train any model/);
    expect(stylist).toMatch(/We do not tolerate it/);
    expect(stylist).toMatch(/as soon as we can/);
    expect(stylist).toMatch(/If you delete your account, they keep them for the same time, labeled \\"Former stylist\\"/);
    expect(stylist).toMatch(/If you close your stylist profile, your clients are disconnected and keep the looks and session records you already sent for about 90 days\./);
    expect(client).toMatch(/Stylists on SmartCloset are independent/);
    expect(client).toMatch(/SmartCloset takes no payment/);
    expect(client).toMatch(/Never pay by gift card, cryptocurrency or wire transfer/);
    expect(client).toMatch(/You are 18 or older/);
    expect(client).toMatch(/never your wishlist/);
    expect(client).toMatch(/If you delete your account, the looks and sessions of your connections are deleted/);
    expect(client).toMatch(/If you block a stylist, the looks, sessions and messages of that connection are deleted straight away/);
    expect(client).toMatch(/as soon as we can/);
  });

  it('tell the client about people and children, about pieces added while sharing is on, and about photos showing more than the clothes', () => {
    const client = PRO_CLIENT_TERMS.sections[1].body;
    expect(client).toContain('Do not share pieces whose photos show people, especially children');
    expect(client).toContain('including any you add while sharing is on');
    expect(client).toContain('a photo can show more than the clothes');
    expect(client).toContain("We can't take back what they have already seen");
  });

  it('tell the stylist the same about photos, and not to keep or pass on what they see', () => {
    const stylist = PRO_STYLIST_TERMS.sections[2].body;
    expect(stylist).toContain('A photo can show more than clothes');
    expect(stylist).toContain('if you see people, children or private details in one, do not keep, copy or share it');
    expect(stylist).toContain('Screenshots are covered by this rule');
  });
});

describe('the closet consent', () => {
  it('says what a stylist sees, what they never see, the 90 days, and that it cannot be taken back', () => {
    expect(PRO_SHARE_CONSENT).toMatch(/^Let <name> see my closet\./);
    expect(PRO_SHARE_CONSENT).toContain('the photo, name, type, color, brand, season, pattern, material, size and condition of the pieces you share');
    expect(PRO_SHARE_CONSENT).toContain('They won\'t see your wishlist, what you paid, your notes, tags, how often you wear things, or anything else');
    expect(PRO_SHARE_CONSENT).toContain('Sharing ends after 90 days unless you renew it, and you can turn it off at any time');
    expect(PRO_SHARE_CONSENT).toContain("We can't take back what your stylist has already seen");
  });

  it('tells the client about pieces added while sharing is on, about people and children, and about photos showing more than the clothes', () => {
    expect(PRO_SHARE_CONSENT).toContain('If you choose all your pieces, this includes pieces you add while sharing is on');
    expect(PRO_SHARE_CONSENT).toContain('Photos can show more than the clothes');
    expect(PRO_SHARE_CONSENT).toContain("don't share pieces whose photos show people, especially children, or rooms and other private details");
    expect(PRO_SHARE_ALL_HINT).toBe('Includes pieces you add while sharing is on.');
    expect(PRO_PICKER_REMINDER).toBe("Don't pick pieces whose photos show people, especially children.");
  });

  it('puts the stylist’s name in the one place that stands for it, whatever the name contains', () => {
    expect(proShareConsent('Ann Lee')).toMatch(/^Let Ann Lee see my closet\. They will see/);
    expect(proShareConsent('Ann Lee')).not.toContain('<name>');
    expect(proShareConsent("$& O'Neil $1")).toMatch(/^Let \$& O'Neil \$1 see my closet\./);
    expect(PRO_SHARE_CONSENT.match(/<name>/g)).toHaveLength(1);
  });
});

describe('the lines that make promises', () => {
  it('say what Appendix A says', () => {
    expect(PRO_NO_PAYMENT_LINE).toBe('Payment is arranged directly between you and your stylist. SmartCloset does not take payments, add fees or guarantee any service.');
    expect(PRO_INDEPENDENT_LINE).toBe('Stylists are independent professionals. SmartCloset does not check or vouch for them.');
    expect(PRO_CONNECT_NOTE).toBe('Nothing is shared when you connect. You choose what to share afterwards.');
    expect(PRO_SHARING_STOPPED_NOTE).toBe('We have stopped sharing your closet with them.');
    expect(PRO_SAFETY_ONLY_NOTE).toBe('You can still stop sharing, end a connection, report or block while this is paused.');
    expect(PRO_GUIDELINES_ENFORCEMENT).toContain("Blocking is private; they aren't told.");
    expect(PRO_REPORT_THANKS).toContain("They won't be told it was you.");
    expect(PRO_BLOCK_EXPLANATION).toContain("They won't be told.");
  });

  it('word an ended connection and the grey lines of a thread the same neutral way', () => {
    expect(PRO_CLOSED_BY_ME).toBe('You ended this connection.');
    expect(PRO_CLOSED_BY_THEM).toBe('This connection has ended.');
    expect(PRO_SYSTEM_LINES).toEqual({ connected: "You're connected.", ended: 'This connection has ended.', sharing_on: 'Closet sharing is on.' });
    for (const text of [PRO_CLOSED_BY_THEM, ...Object.values(PRO_SYSTEM_LINES)]) expect(text).not.toMatch(/block|report|suspend/i);
  });

  it('tells people how to reach support', () => {
    expect(JSON.stringify(PRO_CLIENT_TERMS)).toContain(SUPPORT_EMAIL);
    expect(JSON.stringify(PRO_STYLIST_TERMS)).toContain(SUPPORT_EMAIL);
  });
});

describe('payment talk', () => {
  it.each([
    'Can I venmo you?', 'PayPal works', 'send me the money first', 'a gift card instead', 'Cash App?', 'Zelle me', 'pay by Bitcoin', 'by wire transfer',
    'Western Union is fine', 'MoneyGram', 'I only take crypto', 'a cashier’s check', "a cashier's cheque", 'an iTunes card', 'I will overpay you', 'refund the difference',
  ])('flags %j', text => {
    expect(looksLikePaymentTalk(text)).toBe(true);
  });

  it('leaves ordinary talk alone, including the quick replies and every guideline', () => {
    for (const text of [...PRO_QUICK_REPLIES, 'I love the blazer', 'Meet at the café at 5?', 'It fits a medium', 'Can we do 3pm Friday?', 'Cryptic clue, but yes', 'Thanks for the look']) {
      expect(looksLikePaymentTalk(text)).toBe(false);
    }
  });

  it('warns with the safety tip about never paying by gift card, cryptocurrency or wire transfer', () => {
    expect(PRO_PAYMENT_WARNING).toBe("Never pay by gift card, cryptocurrency or wire transfer. SmartCloset doesn't handle payments.");
  });
});

describe('messages kept in step', () => {
  it('the paused, not-deployed, update and server-behind lines are plain and distinct', () => {
    const all = [PRO_PAUSED_MESSAGE, PRO_NOT_DEPLOYED_MESSAGE, PRO_UPDATE_REQUIRED_MESSAGE, PRO_SERVER_BEHIND_MESSAGE, PRO_SUSPENDED_MESSAGE];
    expect(new Set(all).size).toBe(all.length);
    for (const m of all) expect(m).not.toMatch(/[_]|\b\d{4}-\d{2}\b/);
    expect(PRO_UPDATE_REQUIRED_MESSAGE).toBe('Update SmartCloset to keep using professional features.');
    expect(PRO_SERVER_BEHIND_MESSAGE).toBe('Professional features are being updated. Please try again soon.');
  });
});

describe('timing', () => {
  it('polls an open thread every 15 seconds and keeps a request memo for ten minutes at most', () => {
    expect(PRO_POLL_MS).toBe(15000);
    expect(PRO_PHOTO_TTL_SECONDS).toBe(600);
  });
});

describe('every word a person reads', () => {
  it('has no commerce wording: Book, Pay now, Buy, Checkout, Deposit, Premium, Featured, Verified, Certified, Top rated', () => {
    const strings = copyStrings();
    expect(strings.length).toBeGreaterThan(80);
    for (const text of strings) {
      expect(text).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    }
  });

  it('claims no rating, badge or approval by SmartCloset', () => {
    for (const text of copyStrings()) {
      expect(text).not.toMatch(/\b(stars?|rated|ranked|approved by smartcloset|vetted|trusted)\b/i);
    }
  });

  it('is spelled the American way', () => {
    for (const text of copyStrings()) {
      expect(text).not.toMatch(/colour|favourite|centre|licence|organis|labelled|behaviour|neighbour/i);
    }
  });

  it('uses plain quotes and apostrophes, as Appendix A does', () => {
    for (const text of copyStrings()) {
      expect(text).not.toMatch(/[‘’“”]/);
    }
  });

  it('names no assistant and no maker of one', () => {
    const words = [['cl', 'aude'], ['anthr', 'opic']].map(p => p.join(''));
    for (const text of copyStrings()) {
      for (const w of words) expect(text.toLowerCase()).not.toContain(w);
    }
  });
});

describe('the files of the contract', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const FILES = [
    'src/types/pro.ts', 'src/types/proRoutes.ts', 'src/config/proRules.ts', 'src/services/proErrors.ts', 'src/services/proService.ts',
    'src/services/proPhotoUrls.ts', 'src/services/proEntry.ts', 'src/utils/proFormat.ts', 'src/hooks/useProAccess.ts', 'src/hooks/useProBadge.ts',
    '__tests__/services/proService.test.ts', '__tests__/services/proErrors.test.ts', '__tests__/services/proPhotoUrls.test.ts',
    '__tests__/services/proEntry.test.ts', '__tests__/utils/proFormat.test.ts', '__tests__/hooks/useProAccess.test.tsx',
    '__tests__/hooks/useProBadge.test.tsx', '__tests__/config/proRules.test.ts',
  ];
  const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');

  it('exist', () => {
    for (const file of FILES) expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });

  it('name no assistant and no maker of one', () => {
    const words = [['cl', 'aude'], ['anthr', 'opic'], ['co-auth', 'ored-by']].map(p => p.join(''));
    for (const file of FILES) for (const w of words) expect([file, read(file).toLowerCase().includes(w)]).toEqual([file, false]);
  });

  it('never write to the console, and keep nothing on the device except through a function', () => {
    for (const file of FILES.filter(f => f.startsWith('src/'))) {
      expect([file, /console\./.test(code(file))]).toEqual([file, false]);
      expect([file, /AsyncStorage|localStorage|sessionStorage|\.channel\(/.test(code(file))]).toEqual([file, false]);
    }
  });

  it('have no navigation call, no key named nav or screen, and no emoji', () => {
    for (const file of FILES.filter(f => f.startsWith('src/'))) {
      expect([file, /\.navigate\(|\b(nav|screen):/.test(code(file))]).toEqual([file, false]);
      expect([file, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(read(file))]).toEqual([file, false]);
    }
  });

  it('start no timer, request or subscription when imported', () => {
    // Nothing at module scope but declarations: no top-level call other than the ones that build constants.
    for (const file of FILES.filter(f => f.startsWith('src/'))) {
      expect([file, /^(setTimeout|setInterval|fetch|supabase\.|await )/m.test(code(file))]).toEqual([file, false]);
    }
  });
});

describe('the closet-not-shared line (7.8, A.4)', () => {
  it('is spelled one way, with an ASCII apostrophe, with a name and without', () => {
    expect(proClosetNotShared('Ana')).toBe("Ana hasn't shared their closet. You can ask them in a message.");
    expect(proClosetNotShared()).toBe("They haven't shared their closet. You can ask them in a message.");
    expect(proClosetNotSharedTitle('Ana')).toBe("Ana hasn't shared their closet");
    expect(proClosetNotSharedTitle()).toBe("They haven't shared their closet");
    expect(PRO_CLOSET_ASK_HINT).toBe('You can ask them in a message.');
    expect(`${proClosetNotShared('Ana')} ${proClosetNotShared()}`).not.toMatch(/[\u2018\u2019]/);
  });

  it('is the line proErrorMessage gives for closet_not_shared', () => {
    const { proErrorMessage, ProError } = jest.requireActual('../../src/services/proErrors');
    expect(proErrorMessage(new ProError('closet_not_shared'))).toBe(proClosetNotShared());
  });
});

describe('the note for the tabs that list no connection', () => {
  it('points to the Clients tab and keeps to the words of PRO_SAFETY_ONLY_NOTE', () => {
    expect(PRO_SAFETY_ELSEWHERE_NOTE).toBe('You can still stop sharing, end a connection, report or block from the Clients tab.');
    expect(PRO_SAFETY_ELSEWHERE_NOTE).not.toBe(PRO_SAFETY_ONLY_NOTE);
  });
});

describe('the offset from UTC a session carries', () => {
  it('is the range of real zones, in quarter hours, as the database checks it', () => {
    expect(PRO_UTC_OFFSET_RANGE).toEqual({ min: -720, max: 840, step: 15 });
  });
});
