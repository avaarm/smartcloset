/** The swap wording and numbers that other code relies on. The numbers are compared with the database by swapRulesInStepWithSql.test.ts. */
import {
  looksLikePaymentTalk,
  SWAP_ALIAS_PATTERN,
  SWAP_COMMUNITY_SCAN_NOTICE,
  SWAP_GUIDELINES,
  SWAP_NOT_DEPLOYED_MESSAGE,
  SWAP_PAUSED_MESSAGE,
  SWAP_PHOTO_TTL_SECONDS,
  SWAP_QUICK_REPLIES,
  SWAP_REPORT_REASONS,
  SWAP_SAFETY_TIPS,
  SWAP_SERVER_BEHIND_MESSAGE,
  SWAP_TERMS,
  SWAP_TERMS_VERSION,
  SWAP_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/swapRules';
import { SUPPORT_EMAIL } from '../../src/config/legal';
import { swapErrorMessage } from '../../src/services/swapErrors';

describe('SWAP_TERMS_VERSION', () => {
  // useSwapAccess decides which side is older by comparing the two strings, which only works for zero-padded year-month.
  it('is a zero-padded year-month, so comparing it as text orders versions correctly', () => {
    expect(SWAP_TERMS_VERSION).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect('2026-09' < '2026-10' && '2026-10' < '2026-11' && '2026-12' < '2027-01').toBe(true);
  });
});

describe('aliases', () => {
  it.each(['Ann', 'Velvet Otter', 'otter_99', 'a.b-c', 'A'.repeat(20)])('accepts %s', alias => {
    expect(SWAP_ALIAS_PATTERN.test(alias)).toBe(true);
  });

  it.each(['Al', '', ' Otter', 'Otter ', '-Otter', 'A'.repeat(21), '<b>Otter</b>', 'Otter@home', 'Otter\nTwo'])('rejects %j', alias => {
    expect(SWAP_ALIAS_PATTERN.test(alias)).toBe(false);
  });
});

describe('payment talk', () => {
  it.each(['Can I venmo you?', 'PayPal works', 'send me the money first', 'a gift card instead', 'Cash App?', 'Zelle me', 'pay by Bitcoin'])('flags %j', text => {
    expect(looksLikePaymentTalk(text)).toBe(true);
  });

  it('leaves ordinary swap talk alone, including the quick replies', () => {
    for (const text of [...SWAP_QUICK_REPLIES, 'I love the blazer', 'Meet at the café at 5?', 'It fits a medium']) {
      expect(looksLikePaymentTalk(text)).toBe(false);
    }
  });
});

describe('copy that makes promises', () => {
  const text = JSON.stringify([SWAP_TERMS, SWAP_GUIDELINES, SWAP_SAFETY_TIPS]);

  it('keeps the terms to the six sections the policy page matches', () => {
    expect(SWAP_TERMS.sections.map(s => s.heading)).toEqual([
      'What swaps are', 'What others can see', 'Rules', 'Messages', 'Reports and enforcement', 'Your photos',
    ]);
  });

  it('says what the policy page says about messages, photos and money', () => {
    expect(text).toMatch(/not end-to-end encrypted/);
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/No money, deposits or gift cards/);
    expect(SWAP_COMMUNITY_SCAN_NOTICE).toMatch(/even if you turned off AI photo analysis/);
    expect(SWAP_COMMUNITY_SCAN_NOTICE).toMatch(/friends only are never sent to Google/);
  });

  it('tells people how to reach support', () => {
    expect(SWAP_GUIDELINES.contact).toContain(SUPPORT_EMAIL);
  });

  it('offers a reason for every report the database accepts, with a label a person can read', () => {
    expect(new Set(SWAP_REPORT_REASONS.map(r => r.value)).size).toBe(SWAP_REPORT_REASONS.length);
    for (const r of SWAP_REPORT_REASONS) expect(r.label.length).toBeGreaterThan(5);
  });
});

describe('messages kept in step with the error wording', () => {
  it('says the same thing as swapErrorMessage for a paused server and a server without swaps', () => {
    expect(swapErrorMessage({ message: 'swaps_disabled' }, 'x')).toBe(SWAP_PAUSED_MESSAGE);
    expect(swapErrorMessage({ message: 'x', code: 'PGRST202' }, 'x')).toBe(SWAP_NOT_DEPLOYED_MESSAGE);
  });

  it('the two version messages are plain and distinct', () => {
    expect(SWAP_UPDATE_REQUIRED_MESSAGE).not.toBe(SWAP_SERVER_BEHIND_MESSAGE);
    for (const m of [SWAP_UPDATE_REQUIRED_MESSAGE, SWAP_SERVER_BEHIND_MESSAGE, SWAP_PAUSED_MESSAGE, SWAP_NOT_DEPLOYED_MESSAGE]) {
      expect(m).not.toMatch(/[_]|\b\d{4}-\d{2}\b/);
    }
  });
});

describe('photo links', () => {
  it('are short lived', () => {
    expect(SWAP_PHOTO_TTL_SECONDS).toBeGreaterThan(120);
    expect(SWAP_PHOTO_TTL_SECONDS).toBeLessThanOrEqual(600);
  });
});
