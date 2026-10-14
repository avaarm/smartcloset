/**
 * Rules for rating and for brand insights, shown as the collapsible "Rating guidelines" row of the
 * consent sheet (documentation/design/quality-ratings.md, 8.3). Plain data so the wording is
 * reviewed in one place, like communityGuidelines.ts.
 */
export const RATING_GUIDELINES = {
  title: 'Ratings and brand insights',
  rules: [
    'Rate only things you own, from your own experience.',
    'Don’t add ratings that are paid for, traded for something, or from someone who works for the brand.',
    'Don’t rate the same thing over and over, or ask others to.',
    'Ratings are opinions. Be honest: a low score for a poor experience is fine.',
  ],
} as const;
