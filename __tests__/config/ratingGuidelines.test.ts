/**
 * The rating guidelines shown in the consent sheet (documentation/design/quality-ratings.md, 8.3): the four
 * rules from the design, written plainly, with the typographic apostrophe the rest of the app uses.
 */
import { RATING_GUIDELINES } from '../../src/config/ratingGuidelines';

describe('RATING_GUIDELINES', () => {
  it('has the title and the four rules of the design', () => {
    expect(RATING_GUIDELINES.title).toBe('Ratings and brand insights');
    expect(RATING_GUIDELINES.rules).toEqual([
      'Rate only things you own, from your own experience.',
      'Don’t add ratings that are paid for, traded for something, or from someone who works for the brand.',
      'Don’t rate the same thing over and over, or ask others to.',
      'Ratings are opinions. Be honest: a low score for a poor experience is fine.',
    ]);
  });

  it('rules the paid, traded and affiliated kinds of rating out', () => {
    const text = RATING_GUIDELINES.rules.join(' ');
    expect(text).toMatch(/paid for/);
    expect(text).toMatch(/traded/);
    expect(text).toMatch(/works for the brand/);
  });

  it('uses the typographic apostrophe and complete sentences', () => {
    for (const rule of RATING_GUIDELINES.rules) {
      expect(rule).not.toContain("'");
      expect(rule.endsWith('.')).toBe(true);
      expect(rule.length).toBeLessThanOrEqual(120);
    }
  });

  it('contains none of the strings other screens assert are absent', () => {
    const all = [RATING_GUIDELINES.title, ...RATING_GUIDELINES.rules].join('\n');
    expect(all).not.toMatch(/Brand:|Color: |Material: /);
    expect(all.startsWith('From ')).toBe(false);
  });
});
