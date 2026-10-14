/**
 * The caller's own ratings of pieces and brands (item_ratings, brand_ratings), through the server functions in
 * supabase/migrations/20261014000300_quality_ratings.sql. Nothing here reads another member's data; that is
 * brandInsightService.
 *
 * Reads never throw: they answer with a Loaded state that says why there is no value (guest, unavailable,
 * offline, error). Writes throw Error(friendly message). A guest, or an item id that is not a cloud id, never
 * reaches the network. Nothing touches supabase at import time and nothing is logged.
 */

import { supabase } from '../config/supabase';
import {
  BUY_AGAIN,
  COMFORT_TAGS,
  FIT_VERDICTS,
  HOLDS_UP_TAGS,
  MAX_TAGS_PER_GROUP,
  NOTE_MAX_LENGTH,
  TOUCH_TAGS,
  type Score,
} from '../config/ratingVocabulary';
import type {
  BrandRating,
  BrandRatingInput,
  ContributionBlocked,
  ItemRating,
  ItemRatingInput,
  Loaded,
  MyBrandSummary,
  RatingCounts,
  RatingsExport,
  SaveRatingResult,
} from '../types/rating';
import { brandKeyRaw } from '../utils/brandKey';
import { getAuthUserId } from './authUser';
import { getConsents } from './consentService';
import { isOfflineError, isRpcMissing, rpcErrorMessage } from './rpcErrors';

const READ_FAILED = 'Couldn’t load your rating.';
const SAVE_FAILED = 'Couldn’t save your rating. Check your connection and try again.';
const REMOVE_FAILED = 'Couldn’t remove that. Check your connection and try again.';
const STOP_FAILED = 'Couldn’t stop sharing your ratings. Check your connection and try again.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A cloud id. The demo closet of a guest uses short local ids, which no server function can answer for. */
const isCloudId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);

/** The server files a brand under a key of 2 to 40 characters; anything shorter has no key and nothing to look up. */
const hasBrandKey = (brand: unknown): brand is string => {
  const key = typeof brand === 'string' ? brandKeyRaw(brand) : null;
  return key !== null && key.length >= 2;
};

// ─── Validation of what comes back ───────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const scoreOrNull = (value: unknown): Score | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? (value as Score) : null;

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;

/** Known tags only, each once, at most the allowed number. */
const tagsOf = <T extends string>(list: readonly T[], value: unknown): T[] => {
  const out: T[] = [];
  if (!Array.isArray(value)) return out;
  for (const entry of value) {
    const tag = oneOf(list, entry);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS_PER_GROUP) break;
  }
  return out;
};

const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

const BLOCKED: readonly ContributionBlocked[] = ['not_worn', 'no_brand', 'no_consent'];

/**
 * One item rating row (the jsonb of get_my_item_rating, or a selected row of item_ratings) in app form.
 * Null when the row cannot stand for a rating at all (no overall score), so a bad row cannot crash a screen.
 */
const toItemRating = (row: unknown, fallbackItemId?: string): ItemRating | null => {
  if (!isRecord(row)) return null;
  const overall = scoreOrNull(row.overall);
  const itemId = typeof row.item_id === 'string' && row.item_id !== '' ? row.item_id : fallbackItemId;
  if (overall === null || !itemId) return null;
  const note = typeof row.note === 'string' && row.note.trim() !== '' ? Array.from(row.note).slice(0, NOTE_MAX_LENGTH).join('') : null;
  const wears = row.wears_at_rating;
  return {
    itemId,
    overall,
    touch: scoreOrNull(row.touch),
    touchTags: tagsOf(TOUCH_TAGS, row.touch_tags),
    comfort: scoreOrNull(row.comfort),
    comfortTags: tagsOf(COMFORT_TAGS, row.comfort_tags),
    holdsUp: scoreOrNull(row.holds_up),
    holdsUpTags: tagsOf(HOLDS_UP_TAGS, row.holds_up_tags),
    fit: oneOf(FIT_VERDICTS, row.fit),
    wouldBuyAgain: oneOf(BUY_AGAIN, row.would_buy_again),
    note,
    contributed: row.contributed === true,
    wearsAtRating: typeof wears === 'number' && Number.isInteger(wears) && wears >= 0 ? wears : 0,
    createdAt: stringOr(row.created_at, ''),
    updatedAt: stringOr(row.updated_at, ''),
  };
};

/** One brand rating (the brand_rating object of get_my_brand_summary, or a selected row of brand_ratings). */
const toBrandRating = (row: unknown): BrandRating | null => {
  if (!isRecord(row)) return null;
  const overall = scoreOrNull(row.overall);
  const label = typeof row.brand_label === 'string' ? row.brand_label.trim() : '';
  if (overall === null || label === '') return null;
  return {
    brandLabel: label,
    overall,
    quality: scoreOrNull(row.quality),
    fitConsistency: scoreOrNull(row.fit_consistency),
    value: scoreOrNull(row.value),
    contributed: row.contributed === true,
    updatedAt: stringOr(row.updated_at, ''),
  };
};

const EMPTY_BRAND_SUMMARY: MyBrandSummary = { itemsRated: 0, avgOverall: null, brandRating: null, canRateBrand: false };

const toBrandSummary = (data: unknown): MyBrandSummary | null => {
  if (!isRecord(data)) return null;
  const rated = data.items_rated;
  const avg = data.avg_overall;
  return {
    itemsRated: typeof rated === 'number' && Number.isInteger(rated) && rated >= 0 ? rated : 0,
    avgOverall: typeof avg === 'number' && Number.isFinite(avg) && avg >= 1 && avg <= 5 ? avg : null,
    brandRating: toBrandRating(data.brand_rating),
    canRateBrand: data.can_rate_brand === true,
  };
};

/**
 * The first row of a save function's answer. A request to contribute is never refused: when it cannot count,
 * `blocked` says why and the rating is saved privately. A row that is missing or unreadable is reported as
 * private, never as counting.
 */
const toSaveResult = (data: unknown): SaveRatingResult => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) return { contributed: false, blocked: null, updatedAt: '' };
  const blocked = oneOf(BLOCKED, row.contribution_blocked);
  return {
    contributed: row.contributed === true && blocked === null,
    blocked,
    updatedAt: stringOr(row.updated_at, ''),
  };
};

// ─── Failures ────────────────────────────────────────────────────────────────

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : '';
};

/** A table the migration has not created yet: Postgres 42P01 or PostgREST PGRST205. */
const isTableMissing = (error: unknown): boolean => {
  const code = codeOf(error);
  if (code === '42P01' || code === 'PGRST205') return true;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && /could not find the table/i.test(message);
};

const readFailed = (error: unknown): Loaded<never> => {
  if (isRpcMissing(error) || isTableMissing(error)) return { state: 'unavailable' };
  if (isOfflineError(error)) return { state: 'offline' };
  return { state: 'error', message: rpcErrorMessage(error, READ_FAILED, 'rating') };
};

const writeError = (error: unknown, fallback: string): Error => new Error(rpcErrorMessage(error, fallback, 'rating'));

/** Writes need a signed-in person. */
const requireSignedIn = async (fallback: string): Promise<void> => {
  if (!(await getAuthUserId())) throw writeError({ code: '28000' }, fallback);
};

/** Writes about one item also need a cloud id; a local demo id has no row on the server to change. */
const requireCloudItem = async (itemId: string, fallback: string): Promise<void> => {
  await requireSignedIn(fallback);
  if (!isCloudId(itemId)) throw writeError({ message: 'item_not_found' }, fallback);
};

/** Calls a server function for its side effect and throws a friendly Error when it fails. */
const callWrite = async (fn: string, args: Record<string, unknown> | undefined, fallback: string): Promise<unknown> => {
  let result: { data: unknown; error: unknown };
  try {
    result = await (args ? supabase.rpc(fn, args) : supabase.rpc(fn));
  } catch (thrown) {
    throw writeError(thrown ?? new Error('failed'), fallback);
  }
  if (result.error) throw writeError(result.error, fallback);
  return result.data;
};

// ─── Item ratings ────────────────────────────────────────────────────────────

/** The caller's rating of one item; `ok` with null when the item is not rated yet. */
export const loadMyItemRating = async (itemId: string): Promise<Loaded<ItemRating | null>> => {
  try {
    if (!(await getAuthUserId()) || !isCloudId(itemId)) return { state: 'guest' };
    const { data, error } = await supabase.rpc('get_my_item_rating', { p_item_id: itemId });
    if (error) return readFailed(error);
    if (data === null) return { state: 'ok', value: null };
    const rating = toItemRating(data, itemId);
    return rating ? { state: 'ok', value: rating } : { state: 'error', message: READ_FAILED };
  } catch (error) {
    return readFailed(error);
  }
};

/** Trimmed, null when empty, cut to the limit by characters (not code units) so an emoji is never split. */
const cleanNote = (note: string | null | undefined): string | null => {
  if (typeof note !== 'string') return null;
  const trimmed = note.trim();
  if (trimmed === '') return null;
  return Array.from(trimmed).slice(0, NOTE_MAX_LENGTH).join('');
};

/**
 * A full replace: every field sent overwrites the stored one, which is why the rating sheet always sends everything
 * it has. `contribute` is true, false, or null when omitted (the server keeps the stored choice, private on a first
 * save). A request to contribute never rejects the save; `blocked` says why it could not count.
 */
export const saveItemRating = async (itemId: string, input: ItemRatingInput): Promise<SaveRatingResult> => {
  await requireCloudItem(itemId, SAVE_FAILED);
  const data = await callWrite(
    'save_item_rating',
    {
      p_item_id: itemId,
      p_overall: input.overall,
      p_touch: input.touch ?? null,
      p_touch_tags: input.touchTags ?? [],
      p_comfort: input.comfort ?? null,
      p_comfort_tags: input.comfortTags ?? [],
      p_holds_up: input.holdsUp ?? null,
      p_holds_up_tags: input.holdsUpTags ?? [],
      p_fit: input.fit ?? null,
      p_would_buy_again: input.wouldBuyAgain ?? null,
      p_note: cleanNote(input.note),
      p_contribute: typeof input.contribute === 'boolean' ? input.contribute : null,
      p_only_if_new: input.createOnly === true,
    },
    SAVE_FAILED,
  );
  return toSaveResult(data);
};

export const deleteItemRating = async (itemId: string): Promise<void> => {
  await requireCloudItem(itemId, REMOVE_FAILED);
  await callWrite('delete_item_rating', { p_item_id: itemId }, REMOVE_FAILED);
};

// ─── Brand ratings ───────────────────────────────────────────────────────────

/** The caller's own pieces of one brand, their average, their brand rating and whether they may rate the brand. */
export const loadMyBrandSummary = async (brand: string): Promise<Loaded<MyBrandSummary>> => {
  try {
    if (!(await getAuthUserId())) return { state: 'guest' };
    // The server answers an empty summary for text with no brand key; skip the trip.
    if (!hasBrandKey(brand)) return { state: 'ok', value: { ...EMPTY_BRAND_SUMMARY } };
    const { data, error } = await supabase.rpc('get_my_brand_summary', { p_brand: brand });
    if (error) return readFailed(error);
    const summary = toBrandSummary(data);
    return summary ? { state: 'ok', value: summary } : { state: 'error', message: READ_FAILED };
  } catch (error) {
    return readFailed(error);
  }
};

/** Allowed for a brand the person owns something from, or one they have already rated. */
export const saveBrandRating = async (
  brand: string,
  input: BrandRatingInput,
): Promise<{ contributed: boolean; blocked: ContributionBlocked | null }> => {
  await requireSignedIn(SAVE_FAILED);
  if (!hasBrandKey(brand)) throw writeError({ message: 'invalid_brand' }, SAVE_FAILED);
  const data = await callWrite(
    'save_brand_rating',
    {
      p_brand: brand,
      p_overall: input.overall,
      p_quality: input.quality ?? null,
      p_fit_consistency: input.fitConsistency ?? null,
      p_value: input.value ?? null,
      p_contribute: typeof input.contribute === 'boolean' ? input.contribute : null,
    },
    SAVE_FAILED,
  );
  const { contributed, blocked } = toSaveResult(data);
  return { contributed, blocked };
};

export const deleteBrandRating = async (brand: string): Promise<void> => {
  await requireSignedIn(REMOVE_FAILED);
  // The server deletes nothing for text with no brand key; skip the trip.
  if (!hasBrandKey(brand)) return;
  await callWrite('delete_brand_rating', { p_brand: brand }, REMOVE_FAILED);
};

// ─── Sharing and deleting everything ─────────────────────────────────────────

/** Every contribution stops counting at once; the ratings stay, privately. */
export const withdrawContributions = async (): Promise<void> => {
  await requireSignedIn(STOP_FAILED);
  await callWrite('withdraw_contributions', undefined, STOP_FAILED);
};

/** Deletes every item and brand rating of the caller. The answer to the consent question is kept. */
export const deleteAllMyRatings = async (): Promise<void> => {
  await requireSignedIn(REMOVE_FAILED);
  await callWrite('delete_all_my_ratings', undefined, REMOVE_FAILED);
};

// ─── Counts and export (plain selects under row-level security) ──────────────

type RatingTable = 'item_ratings' | 'brand_ratings';

/** A head-only count of the caller's rows; `notContributing` counts the ones that do not add to brand insights. */
const countRows = async (table: RatingTable, userId: string, notContributing: boolean): Promise<number> => {
  const column = table === 'item_ratings' ? 'item_id' : 'brand_key';
  let query = supabase.from(table).select(column, { count: 'exact', head: true }).eq('user_id', userId);
  if (notContributing) query = query.eq('contributed', false);
  const { count, error } = await query;
  if (error) throw error;
  if (typeof count !== 'number' || count < 0) throw new Error('no count');
  return count;
};

/**
 * How many item and brand ratings the person has, and how many of both together are not contributing (the "past
 * ratings" the consent sheet can offer to add).
 */
export const loadMyRatingCounts = async (): Promise<Loaded<RatingCounts>> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return { state: 'guest' };
    const [items, brands, itemsPrivate, brandsPrivate] = await Promise.all([
      countRows('item_ratings', userId, false),
      countRows('brand_ratings', userId, false),
      countRows('item_ratings', userId, true),
      countRows('brand_ratings', userId, true),
    ]);
    return { state: 'ok', value: { items, brands, notContributing: itemsPrivate + brandsPrivate } };
  } catch (error) {
    return readFailed(error);
  }
};

const EXPORT_PAGE = 500;
/** 10,000 rows is far beyond any closet; the bound only stops a misbehaving response from looping. */
const EXPORT_MAX_PAGES = 20;

const ITEM_EXPORT_COLUMNS =
  'item_id, overall, touch, touch_tags, comfort, comfort_tags, holds_up, holds_up_tags, fit, would_buy_again, note, contributed, created_at, updated_at';
const BRAND_EXPORT_COLUMNS = 'brand_label, overall, quality, fit_consistency, value, contributed, updated_at';

/** Every row of the caller's table, a page at a time so a long list is not cut at the server's row limit. */
const readAllRows = async (table: RatingTable, columns: string, orderBy: string, userId: string): Promise<unknown[]> => {
  const rows: unknown[] = [];
  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const from = page * EXPORT_PAGE;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .order(orderBy)
      .range(from, from + EXPORT_PAGE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('unreadable');
    rows.push(...data);
    if (data.length < EXPORT_PAGE) break;
  }
  return rows;
};

/** A section that fails comes back empty; the others are kept. */
const orEmpty = async <T>(work: () => Promise<T[]>): Promise<T[]> => {
  try {
    return await work();
  } catch {
    return [];
  }
};

/** The caller's own ratings (notes included) and consent answers for the backup file. Never throws. */
export const exportMyRatings = async (): Promise<RatingsExport> => {
  const empty = (): RatingsExport => ({ itemRatings: [], brandRatings: [], consents: [] });
  try {
    const userId = await getAuthUserId();
    if (!userId) return empty();
    const [itemRatings, brandRatings, consents] = await Promise.all([
      orEmpty(async () => {
        const rows = await readAllRows('item_ratings', ITEM_EXPORT_COLUMNS, 'item_id', userId);
        return rows.flatMap((row): RatingsExport['itemRatings'] => {
          const r = toItemRating(row);
          // Listed field by field: a field added to ItemRating later is not exported until someone decides it should be.
          return r ? [{
            itemId: r.itemId, overall: r.overall, touch: r.touch, touchTags: r.touchTags, comfort: r.comfort,
            comfortTags: r.comfortTags, holdsUp: r.holdsUp, holdsUpTags: r.holdsUpTags, fit: r.fit,
            wouldBuyAgain: r.wouldBuyAgain, note: r.note, contributed: r.contributed, createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }] : [];
        });
      }),
      orEmpty(async () => {
        const rows = await readAllRows('brand_ratings', BRAND_EXPORT_COLUMNS, 'brand_key', userId);
        return rows.flatMap(row => {
          const rating = toBrandRating(row);
          return rating ? [rating] : [];
        });
      }),
      orEmpty(async () => {
        const loaded = await getConsents();
        if (loaded.state !== 'ok') return [];
        return loaded.value.map(c => ({
          purpose: c.purpose,
          granted: c.granted,
          policyVersion: c.policyVersion,
          decidedAt: c.decidedAt,
        }));
      }),
    ]);
    return { itemRatings, brandRatings, consents };
  } catch {
    return empty();
  }
};
