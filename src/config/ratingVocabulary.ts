export type Score = 1 | 2 | 3 | 4 | 5;
export const SCORES: readonly Score[] = [1, 2, 3, 4, 5];

export const TOUCH_TAGS = ['soft', 'silky', 'buttery', 'smooth', 'crisp', 'structured', 'stretchy', 'thick', 'lightweight', 'fuzzy', 'scratchy', 'stiff'] as const;
export const COMFORT_TAGS = ['breathable', 'warm', 'cooling', 'cozy', 'easy_to_move_in', 'restrictive', 'clingy', 'itchy', 'sweaty', 'heavy'] as const;
export const HOLDS_UP_TAGS = ['washes_well', 'seams_hold', 'color_stays', 'keeps_shape', 'pills', 'fades', 'shrinks', 'loses_shape', 'snags', 'wrinkles_easily'] as const;
export const FIT_VERDICTS = ['runs_small', 'true_to_size', 'runs_large'] as const;
export const BUY_AGAIN = ['yes', 'maybe', 'no'] as const;
export const INSIGHT_REPORT_REASONS = ['looks_manipulated', 'inaccurate', 'other'] as const;

export type TouchTag = (typeof TOUCH_TAGS)[number];
export type ComfortTag = (typeof COMFORT_TAGS)[number];
export type HoldsUpTag = (typeof HOLDS_UP_TAGS)[number];
export type FitVerdict = (typeof FIT_VERDICTS)[number];
export type BuyAgain = (typeof BUY_AGAIN)[number];
export type InsightReportReason = (typeof INSIGHT_REPORT_REASONS)[number];

export const MAX_TAGS_PER_GROUP = 4;
export const NOTE_MAX_LENGTH = 500;
/** Wears needed before "how it is holding up" is offered (the server enforces it too). */
export const MIN_WEARS_FOR_HOLDS_UP = 3;
/** Wear counts at which the item card nudges (section 3.7). */
export const NUDGE_WEARS = [3, 10] as const;
/** Version of the consent text shown in the consent sheet; sent to set_consent(). Keep equal to consent_purposes.current_version (a test compares it with the migration's seed; the server refuses any other value with stale_consent_text). */
export const RATINGS_POLICY_VERSION = 'ratings-2026-10';

export const OVERALL_LABELS: Record<Score, string> = { 1: 'Poor', 2: 'Fair', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
export const TOUCH_LABELS: Record<Score, string> = { 1: 'Rough', 2: 'A bit rough', 3: 'Neutral', 4: 'Soft', 5: 'Lovely to touch' };
export const COMFORT_LABELS: Record<Score, string> = { 1: 'Uncomfortable', 2: 'Not very comfortable', 3: 'Fine', 4: 'Comfortable', 5: 'Comfortable all day' };
export const HOLDS_UP_LABELS: Record<Score, string> = { 1: 'Fell apart', 2: 'Showing wear', 3: 'Holding up okay', 4: 'Holding up well', 5: 'Like new' };
export const BRAND_SCALE_ENDS = {
  overall: ['Poor', 'Excellent'],
  quality: ['Poor quality', 'Excellent quality'],
  fitConsistency: ['Sizes vary a lot', 'Sizes are always the same'],
  value: ['Not worth the price', 'Worth the price'],
} as const;

export const TAG_LABELS: Record<TouchTag | ComfortTag | HoldsUpTag, string> = {
  soft: 'Soft', silky: 'Silky', buttery: 'Buttery', smooth: 'Smooth', crisp: 'Crisp', structured: 'Structured',
  stretchy: 'Stretchy', thick: 'Thick', lightweight: 'Lightweight', fuzzy: 'Fuzzy', scratchy: 'Scratchy', stiff: 'Stiff',
  breathable: 'Breathable', warm: 'Warm', cooling: 'Cooling', cozy: 'Cozy', easy_to_move_in: 'Easy to move in',
  restrictive: 'Restrictive', clingy: 'Clingy', itchy: 'Itchy', sweaty: 'Sweaty', heavy: 'Heavy',
  washes_well: 'Washes well', seams_hold: 'Seams hold', color_stays: 'Color stays', keeps_shape: 'Keeps shape',
  pills: 'Pills', fades: 'Fades', shrinks: 'Shrinks', loses_shape: 'Loses shape', snags: 'Snags', wrinkles_easily: 'Wrinkles easily',
};
export const FIT_LABELS: Record<FitVerdict, string> = { runs_small: 'Runs small', true_to_size: 'True to size', runs_large: 'Runs large' };
export const BUY_AGAIN_LABELS: Record<BuyAgain, string> = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
export const BUCKET_LABELS = {
  under_10: 'Based on fewer than 10 members',
  '10-24': 'Based on 10 to 24 members',
  '25-99': 'Based on 25 to 99 members',
  '100+': 'Based on 100 or more members',
} as const;
