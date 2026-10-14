import type { Score, TouchTag, ComfortTag, HoldsUpTag, FitVerdict, BuyAgain, InsightReportReason } from '../config/ratingVocabulary';

export type { InsightReportReason };

/** The result of any read that can fail without being an error worth shouting about. */
export type Loaded<T> =
  | { state: 'ok'; value: T }
  | { state: 'guest' }                       // signed out, or an id that is not a cloud id
  | { state: 'unavailable' }                 // the server function does not exist yet (migration not applied)
  | { state: 'offline' }
  | { state: 'error'; message?: string };    // message is already friendly (for example the daily limit)

export interface ItemRatingInput {
  overall: Score;
  touch?: Score | null;
  touchTags?: TouchTag[];
  comfort?: Score | null;
  comfortTags?: ComfortTag[];
  holdsUp?: Score | null;
  holdsUpTags?: HoldsUpTag[];
  fit?: FitVerdict | null;
  wouldBuyAgain?: BuyAgain | null;
  note?: string | null;
  /**
   * true: ask for this rating to count toward brand insights; false: stop it counting; omitted: keep what is
   * stored (a first save is private). A request is never refused: when it cannot count (no agreement in force,
   * no brand, not worn) the rating is saved privately and SaveRatingResult.blocked says why. The rating sheet
   * always sends true or false; only the one-tap star omits it.
   */
  contribute?: boolean;
  /** One-tap star only: create the rating, but change nothing when one already exists (sent as p_only_if_new). */
  createOnly?: boolean;
}

export interface ItemRating {
  itemId: string;
  overall: Score;
  touch: Score | null;
  touchTags: TouchTag[];
  comfort: Score | null;
  comfortTags: ComfortTag[];
  holdsUp: Score | null;
  holdsUpTags: HoldsUpTag[];
  fit: FitVerdict | null;
  wouldBuyAgain: BuyAgain | null;
  note: string | null;
  contributed: boolean;
  wearsAtRating: number;
  createdAt: string;
  updatedAt: string;
}

export type ContributionBlocked = 'not_worn' | 'no_brand' | 'no_consent';
export interface SaveRatingResult {
  contributed: boolean;
  blocked: ContributionBlocked | null;
  updatedAt: string;
}

export interface BrandRatingInput {
  overall: Score;
  quality?: Score | null;
  fitConsistency?: Score | null;
  value?: Score | null;
  /** Same three states as ItemRatingInput.contribute. Counting needs a worn piece of the brand. */
  contribute?: boolean;
}
export interface BrandRating {
  brandLabel: string;
  overall: Score;
  quality: Score | null;
  fitConsistency: Score | null;
  value: Score | null;
  contributed: boolean;
  updatedAt: string;
}
export interface MyBrandSummary {
  itemsRated: number;
  avgOverall: number | null;
  brandRating: BrandRating | null;
  canRateBrand: boolean;
}

export type NBucket = 'under_10' | '10-24' | '25-99' | '100+';
export interface BrandInsightOk {
  status: 'ok';
  nBucket: NBucket;
  score: number;
  asOf: string;                              // YYYY-MM-DD
  // item, brand, traits and slices are filled with {} / [] by parseBrandInsight when the server omits them
  // (it does for a score below 10 members: headline only, in half-point steps).
  item: {
    feel?: number; comfort?: number; holdsUp?: number; wouldBuyAgainPct?: number;
    fit?: { runsSmall: number; trueToSize: number; runsLarge: number };   // whole numbers in steps of 5 that add up to 100
  };
  brand: { quality?: number; fitConsistency?: number; value?: number };
  traits: { group: 'touch' | 'comfort' | 'holds_up'; tag: string; pct: number }[];
  slices: { kind: 'category' | 'material'; key: string; nBucket: NBucket; overall: number; feel?: number; holdsUp?: number }[];
}
export type BrandInsight = BrandInsightOk | { status: 'insufficient' } | { status: 'unavailable' };

export interface RatingCounts { items: number; brands: number; notContributing: number }

/** The optional `ratings` section of a backup file. */
export interface RatingsExport {
  itemRatings: Array<Omit<ItemRating, 'wearsAtRating'>>;
  brandRatings: BrandRating[];
  consents: { purpose: string; granted: boolean | null; policyVersion: string | null; decidedAt: string | null }[];
}
