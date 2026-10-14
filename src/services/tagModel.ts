/**
 * Client side of the optional model step for reading a tag (Phase 4, switched off by TAG_MODEL_FALLBACK_ENABLED).
 *
 * When the local parser leaves a tag unclean, the words Vision found (never the photo) can go to a text model that
 * sorts out multilingual blocks and scrambled line order. The route it calls ('openai-tag') is not deployed in this
 * build, so a call comes back as "unknown provider" and the caller keeps the local result. Nothing here is trusted:
 * the answer is rebuilt from a whitelist, and groundModelRead later checks every number and word against the OCR text.
 */

import type { ModelTagRead, TagFlag, TagPart } from '../types/tag';
import { CARE_PHRASES } from '../utils/careNames';
import { FIBRES } from '../utils/materialNames';
import { TAG_FLAGS, TAG_PARTS } from '../utils/tagGrounding';
import { sanitizeTranscription } from '../utils/tagTranscription';
import { callAiProxy } from './aiProxy';

/** The route accepts 20 to 3000 characters of text; asking with less would only spend a unit of the daily allowance. */
export const MIN_MODEL_TEXT = 20;
const MAX_MODEL_TEXT = 3000;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;

const MAX_GROUPS = 6;
const MAX_FIBERS_PER_GROUP = 8;
const MAX_CARE = 12;
const MAX_LANGUAGES = 6;
const MAX_SIZES = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const clipOrNull = (value: unknown, max: number): string | null => clip(value, max) || null;

const QUALIFIERS: ReadonlyArray<'organic' | 'recycled'> = ['organic', 'recycled'];
const WHERE_SEEN: ReadonlyArray<'neck_label' | 'care_tag' | 'hang_tag'> = ['neck_label', 'care_tag', 'hang_tag'];

/**
 * The model's answer as it may be used: only known keys, known enum values and capped strings survive. Anything
 * else is dropped, an unknown fibre becomes "other" with the printed word kept, and an unknown part becomes
 * "other", which is never shown as Read. Null when the answer is not an object at all.
 */
export const cleanModelRead = (raw: unknown): ModelTagRead | null => {
  if (!isRecord(raw)) return null;

  const composition: ModelTagRead['composition'] = [];
  for (const entry of Array.isArray(raw.composition) ? raw.composition.slice(0, MAX_GROUPS) : []) {
    if (!isRecord(entry)) continue;
    const part: TagPart = (TAG_PARTS as readonly string[]).includes(entry.part as string) ? (entry.part as TagPart) : 'other';
    const fibers: ModelTagRead['composition'][number]['fibers'] = [];
    for (const row of Array.isArray(entry.fibers) ? entry.fibers.slice(0, MAX_FIBERS_PER_GROUP) : []) {
      if (!isRecord(row)) continue;
      const named = clip(row.fiber, 40).toLowerCase();
      const percent =
        typeof row.percent === 'number' && Number.isFinite(row.percent) && row.percent >= 0 && row.percent <= 100
          ? row.percent
          : null;
      fibers.push({
        fiber: FIBRES.includes(named) ? named : 'other',
        as_printed: clip(row.as_printed, 40),
        percent,
        qualifier: QUALIFIERS.find(q => q === row.qualifier) ?? null,
        evidence: clip(row.evidence, 80),
      });
    }
    composition.push({ part, part_label: clipOrNull(entry.part_label, 30), fibers });
  }

  const care: string[] = [];
  for (const phrase of Array.isArray(raw.care) ? raw.care : []) {
    if (typeof phrase === 'string' && CARE_PHRASES.includes(phrase) && !care.includes(phrase) && care.length < MAX_CARE) {
      care.push(phrase);
    }
  }

  let size: ModelTagRead['size'] = null;
  if (isRecord(raw.size)) {
    const all = (Array.isArray(raw.size.all) ? raw.size.all : [])
      .map(s => clip(s, 20))
      .filter(s => s !== '')
      .slice(0, MAX_SIZES);
    size = { primary: clipOrNull(raw.size.primary, 20), all };
  }

  let brand: ModelTagRead['brand'] = null;
  const brandRaw = raw.brand;
  if (isRecord(brandRaw)) {
    brand = {
      name: clipOrNull(brandRaw.name, 60),
      where_seen: WHERE_SEEN.find(w => w === brandRaw.where_seen) ?? null,
    };
  }

  const flags: TagFlag[] = [];
  for (const flag of Array.isArray(raw.flags) ? raw.flags : []) {
    if ((TAG_FLAGS as readonly string[]).includes(flag) && !flags.includes(flag as TagFlag)) flags.push(flag as TagFlag);
  }

  const languages: string[] = [];
  for (const lang of Array.isArray(raw.languages) ? raw.languages : []) {
    if (typeof lang === 'string' && /^[a-z]{2}$/.test(lang) && !languages.includes(lang) && languages.length < MAX_LANGUAGES) {
      languages.push(lang);
    }
  }

  return {
    readable: raw.readable === true,
    composition,
    care,
    origin: clipOrNull(raw.origin, 60),
    size,
    brand,
    languages,
    flags,
  };
};

/**
 * A second opinion on a tag's words from the text model, or null on any failure: no connection, the person's
 * "not now", a daily limit, a refusal, a 5xx, or the route not being there ("unknown provider"). The caller then
 * simply keeps the local read, so nothing here ever shows an error.
 */
export const readTagWithModel = async (ocrText: string, locale?: string): Promise<ModelTagRead | null> => {
  try {
    // The words, not the photo, and without lines that can name a person or a place (the route cleans them again).
    const text = sanitizeTranscription(typeof ocrText === 'string' ? ocrText : '').slice(0, MAX_MODEL_TEXT);
    if (text.length < MIN_MODEL_TEXT) return null;
    const payload: { ocrText: string; locale?: string } = { ocrText: text };
    if (typeof locale === 'string' && LOCALE.test(locale)) payload.locale = locale;
    const response = await callAiProxy<{ read?: unknown }>('openai-tag', payload);
    return cleanModelRead(isRecord(response) ? response.read : null);
  } catch {
    return null;
  }
};
