/**
 * What members say about a brand: the one cross-member read (get_brand_insight), plus the "something looks
 * wrong" report. The server answers only with thresholded, rounded numbers; this file still treats every byte of
 * the answer as untrusted and keeps only what it recognises.
 *
 * Reads never throw (Loaded). Answers are remembered in memory for six hours per brand key and shared between
 * callers that ask at the same time; errors, offline and guest answers are never remembered. Nothing touches
 * supabase or storage at import time, and nothing is logged.
 */

import { supabase } from '../config/supabase';
import {
  COMFORT_TAGS,
  HOLDS_UP_TAGS,
  INSIGHT_REPORT_REASONS,
  TOUCH_TAGS,
  type InsightReportReason,
} from '../config/ratingVocabulary';
import type { BrandInsight, BrandInsightOk, Loaded, NBucket } from '../types/rating';
import { brandKeyRaw } from '../utils/brandKey';
import { getAuthUserId } from './authUser';
import { isOfflineError, isRpcMissing, rpcErrorMessage } from './rpcErrors';

const READ_FAILED = 'Couldn’t load what members say.';
const REPORT_FAILED = 'Couldn’t send that. Check your connection and try again.';

/** How long an answer is kept, and how many brands are kept (the oldest goes first). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_BRANDS = 200;

/** The server files a brand under a key of 2 to 40 characters; a shorter one has no key and nothing to look up. */
const usableBrandKey = (brand: unknown): string | null => {
  const key = typeof brand === 'string' ? brandKeyRaw(brand) : null;
  return key !== null && key.length >= 2 ? key : null;
};

// ─── Reading the answer ──────────────────────────────────────────────────────

const N_BUCKETS: readonly NBucket[] = ['under_10', '10-24', '25-99', '100+'];
const MAX_TRAITS = 4;
const MAX_SLICES_PER_KIND = 6;
/** Slice keys are category names and canonical fibres: short, lower case, no markup. */
const SLICE_KEY_RE = /^[a-z0-9][a-z0-9 _-]{0,39}$/;
const AS_OF_RE = /^\d{4}-\d{2}-\d{2}$/;

const TRAIT_TAGS: Record<BrandInsightOk['traits'][number]['group'], readonly string[]> = {
  touch: TOUCH_TAGS,
  comfort: COMFORT_TAGS,
  holds_up: HOLDS_UP_TAGS,
};
const SLICE_KINDS: readonly BrandInsightOk['slices'][number]['kind'][] = ['category', 'material'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inRange = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

/** A score from 1 to 5. */
const scoreOf = (value: unknown): number | undefined => inRange(value, 1, 5);
/** A percentage from 0 to 100. */
const pctOf = (value: unknown): number | undefined => inRange(value, 0, 100);

const bucketOf = (value: unknown): NBucket | undefined =>
  typeof value === 'string' ? N_BUCKETS.find(bucket => bucket === value) : undefined;

const parseItem = (raw: unknown): BrandInsightOk['item'] => {
  const item: BrandInsightOk['item'] = {};
  if (!isRecord(raw)) return item;
  const feel = scoreOf(raw.feel);
  const comfort = scoreOf(raw.comfort);
  const holdsUp = scoreOf(raw.holds_up);
  const again = pctOf(raw.would_buy_again_pct);
  if (feel !== undefined) item.feel = feel;
  if (comfort !== undefined) item.comfort = comfort;
  if (holdsUp !== undefined) item.holdsUp = holdsUp;
  if (again !== undefined) item.wouldBuyAgainPct = again;
  if (isRecord(raw.fit)) {
    const runsSmall = pctOf(raw.fit.runs_small);
    const trueToSize = pctOf(raw.fit.true_to_size);
    const runsLarge = pctOf(raw.fit.runs_large);
    // Three shares that do not make a whole would draw a bar that says something the data does not.
    if (
      runsSmall !== undefined && trueToSize !== undefined && runsLarge !== undefined &&
      Math.abs(runsSmall + trueToSize + runsLarge - 100) < 0.01
    ) {
      item.fit = { runsSmall, trueToSize, runsLarge };
    }
  }
  return item;
};

const parseBrand = (raw: unknown): BrandInsightOk['brand'] => {
  const brand: BrandInsightOk['brand'] = {};
  if (!isRecord(raw)) return brand;
  const quality = scoreOf(raw.quality);
  const fitConsistency = scoreOf(raw.fit_consistency);
  const value = scoreOf(raw.value);
  if (quality !== undefined) brand.quality = quality;
  if (fitConsistency !== undefined) brand.fitConsistency = fitConsistency;
  if (value !== undefined) brand.value = value;
  return brand;
};

/** Known groups and known tags of that group only, each once, at most four. */
const parseTraits = (raw: unknown): BrandInsightOk['traits'] => {
  const traits: BrandInsightOk['traits'] = [];
  if (!Array.isArray(raw)) return traits;
  for (const entry of raw) {
    if (traits.length >= MAX_TRAITS) break;
    if (!isRecord(entry)) continue;
    const group = (Object.keys(TRAIT_TAGS) as Array<keyof typeof TRAIT_TAGS>).find(g => g === entry.group);
    const pct = pctOf(entry.pct);
    if (!group || pct === undefined || typeof entry.tag !== 'string' || !TRAIT_TAGS[group].includes(entry.tag)) continue;
    const tag = entry.tag;
    if (traits.some(t => t.group === group && t.tag === tag)) continue;
    traits.push({ group, tag, pct });
  }
  return traits;
};

/** At most six rows of each kind, in the order the server gave them. */
const parseSlices = (raw: unknown): BrandInsightOk['slices'] => {
  const slices: BrandInsightOk['slices'] = [];
  if (!Array.isArray(raw)) return slices;
  const perKind: Record<string, number> = {};
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const kind = SLICE_KINDS.find(k => k === entry.kind);
    const nBucket = bucketOf(entry.n_bucket);
    const overall = scoreOf(entry.overall);
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (!kind || !nBucket || overall === undefined || !SLICE_KEY_RE.test(key)) continue;
    if ((perKind[kind] ?? 0) >= MAX_SLICES_PER_KIND) continue;
    if (slices.some(s => s.kind === kind && s.key === key)) continue;
    const slice: BrandInsightOk['slices'][number] = { kind, key, nBucket, overall };
    const feel = scoreOf(entry.feel);
    const holdsUp = scoreOf(entry.holds_up);
    if (feel !== undefined) slice.feel = feel;
    if (holdsUp !== undefined) slice.holdsUp = holdsUp;
    slices.push(slice);
    perKind[kind] = (perKind[kind] ?? 0) + 1;
  }
  return slices;
};

/**
 * The raw jsonb of get_brand_insight in app form. Unknown or malformed fields are dropped, numbers are range
 * checked (scores 1 to 5, percentages 0 to 100), lists are capped (4 traits, 6 slices per kind), and anything that
 * is not a recognisable answer is `insufficient`. A score without a usable number or a member-count bucket is not
 * shown: a number with no stated basis would mislead.
 */
export const parseBrandInsight = (raw: unknown): BrandInsight => {
  if (!isRecord(raw)) return { status: 'insufficient' };
  if (raw.status === 'unavailable') return { status: 'unavailable' };
  if (raw.status !== 'ok') return { status: 'insufficient' };
  const score = scoreOf(raw.score);
  const nBucket = bucketOf(raw.n_bucket);
  if (score === undefined || nBucket === undefined) return { status: 'insufficient' };
  return {
    status: 'ok',
    nBucket,
    score,
    // Missing on the rare answer served while another call is recomputing the brand; the screen does not need it.
    asOf: typeof raw.as_of === 'string' && AS_OF_RE.test(raw.as_of) ? raw.as_of : '',
    item: parseItem(raw.item),
    brand: parseBrand(raw.brand),
    traits: parseTraits(raw.traits),
    slices: parseSlices(raw.slices),
  };
};

// ─── Reading with a memory ───────────────────────────────────────────────────

interface CacheEntry { at: number; result: Loaded<BrandInsight> }
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Loaded<BrandInsight>>>();
/** Bumped when the memory is cleared, so an answer that was on its way then is not stored after the clear. */
let generation = 0;

const failed = (error: unknown): Loaded<never> => {
  if (isRpcMissing(error)) return { state: 'unavailable' };
  if (isOfflineError(error)) return { state: 'offline' };
  return { state: 'error', message: rpcErrorMessage(error, READ_FAILED, 'insight') };
};

const remember = (key: string, result: Loaded<BrandInsight>): void => {
  cache.delete(key);
  cache.set(key, { at: Date.now(), result });
  while (cache.size > CACHE_MAX_BRANDS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const fetchInsight = async (brand: string): Promise<Loaded<BrandInsight>> => {
  try {
    const { data, error } = await supabase.rpc('get_brand_insight', { p_brand: brand });
    if (error) return failed(error);
    return { state: 'ok', value: parseBrandInsight(data) };
  } catch (error) {
    return failed(error);
  }
};

/**
 * What members say about a brand. A guest gets `guest`; text with no usable brand key is `insufficient` without a
 * call. Answers (including "not enough ratings" and "paused", and a server that does not have the function yet)
 * are remembered for six hours per brand key, so "Zara" and "ZARA" share one; errors and offline never are.
 */
export const loadBrandInsight = async (brand: string): Promise<Loaded<BrandInsight>> => {
  try {
    if (!(await getAuthUserId())) return { state: 'guest' };
    const key = usableBrandKey(brand);
    if (!key) return { state: 'ok', value: { status: 'insufficient' } };

    const hit = cache.get(key);
    if (hit) {
      const age = Date.now() - hit.at;
      if (age >= 0 && age < CACHE_TTL_MS) return hit.result;
      cache.delete(key);
    }

    const pending = inFlight.get(key);
    if (pending) return pending;

    const startedIn = generation;
    const request: Promise<Loaded<BrandInsight>> = fetchInsight(brand).then(result => {
      if (inFlight.get(key) === request) inFlight.delete(key);
      if (startedIn === generation && (result.state === 'ok' || result.state === 'unavailable')) remember(key, result);
      return result;
    });
    inFlight.set(key, request);
    return request;
  } catch (error) {
    return failed(error);
  }
};

/** Forgets every remembered answer and every call on its way (for example when the person signs out). */
export const clearBrandInsightCache = (): void => {
  cache.clear();
  inFlight.clear();
  generation += 1;
};

// ─── Reporting ───────────────────────────────────────────────────────────────

/** "Something look wrong?" Throws Error(friendly message). */
export const reportBrandInsight = async (brand: string, reason: InsightReportReason): Promise<void> => {
  const fail = (error: unknown): Error => new Error(rpcErrorMessage(error, REPORT_FAILED, 'report'));
  if (!(await getAuthUserId())) throw fail({ code: '28000' });
  // The server refuses these too; there is no point asking.
  if (!usableBrandKey(brand) || !INSIGHT_REPORT_REASONS.includes(reason)) throw fail({ message: 'invalid_report' });
  let error: unknown = null;
  try {
    const res = await supabase.rpc('report_brand_insight', { p_brand: brand, p_reason: reason });
    error = res.error;
  } catch (thrown) {
    error = thrown ?? new Error('failed');
  }
  if (error) throw fail(error);
};
