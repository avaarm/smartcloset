/**
 * Community guidelines and report options for the Friends feature
 * (App Review guideline 1.2). Kept as plain data so the screens stay short and
 * the wording is easy to review in one place.
 */
import { SUPPORT_EMAIL } from './legal';

export const COMMUNITY_GUIDELINES = {
  title: 'Community guidelines',
  intro:
    'Friends is for sharing your closet with people you know. To keep it safe and respectful:',
  rules: [
    'Be yourself. Don’t impersonate someone else or use a misleading name.',
    'No objectionable content: nothing hateful, harassing, sexual, violent or illegal, in names, requests or closet photos.',
    'Only add people you know. Don’t send unwanted or repeated requests.',
    'Only share items and photos that are yours.',
  ],
  enforcement:
    'We review reports and may remove content or suspend accounts that break these rules. You can report or block anyone from their friend request or closet. Blocking is private; they aren’t told.',
  contact: `Questions or urgent concerns? Email ${SUPPORT_EMAIL}.`,
} as const;

/** One line shown before sending or accepting a request. */
export const CLOSET_SHARING_NOTICE =
  'Once you’re friends, you can both see the items in each other’s closets (not wishlists). You can remove or block them at any time.';

/** Second line of the same prompt: the rules everyone agrees to by friending. */
export const GUIDELINES_NOTICE =
  'By continuing you agree to follow our community guidelines: no harassment or objectionable content.';

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or unwanted requests' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** Where the reported person was seen; stored with the report for context. */
export type ReportContext = 'friend_request' | 'friend_closet' | 'profile';

/** Matches the content_reports.details limit in the database. */
export const MAX_REPORT_DETAILS = 500;
