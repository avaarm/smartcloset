/**
 * Reading the label sewn into a garment.
 *
 * A photo goes to Google Cloud Vision once through the ai-proxy (the same 'vision' route as photo analysis), the
 * temporary copy of the photo is deleted straight away, and the words Vision found are handed to the local parser.
 * Nothing is uploaded to storage and only the sanitised transcription is ever kept (clothing_items.tag_text).
 *
 * Photos are read one at a time, never in parallel, and one scan never overlaps another: a request is counted by
 * the proxy before it is validated, so this file validates first and never retries a limit or a 4xx on its own.
 */

import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Platform } from 'react-native';
import type { TagOcr, TagRead, TagReadFailure, TagReadResult } from '../types/tag';
import { TAG_MODEL_FALLBACK_ENABLED, TAG_OCR_FEATURE } from '../config/ratingFlags';
import { discardTempImage, readImageAsBase64 } from '../platform/fileSystem';
import { groundModelRead } from '../utils/tagGrounding';
import { isClean, mergeReads, parseTagText } from '../utils/tagParser';
import { sanitizeTranscription } from '../utils/tagTranscription';
import { callAiProxy, classifyAiError } from './aiProxy';
import { readTagWithModel } from './tagModel';

/** A garment's fabric, care and size are often on different tags, so a scan takes up to this many photos. */
export const MAX_TAG_PHOTOS = 3;
/** Median height of a word box, in pixels of the 2048 px photo, below which the tag is too small or blurry. Provisional until the real tags confirm it. */
export const MIN_WORD_HEIGHT_PX = 14;
/** The median is only trusted with at least this many word boxes. */
export const MIN_WORD_BOXES = 5;
/** Mean word confidence below which the read is flagged low-legibility by the parser (nothing is then shown as Read). Provisional. */
export const LOW_LEGIBILITY_CONFIDENCE = 0.6;
/** A call with no answer by now has failed: a hung request must not keep the spinner going for good. */
export const TAG_CALL_TIMEOUT_MS = 25000;
/** Joins the text of two photos; the parser starts a fresh part at each one. */
export const PHOTO_SEPARATOR = '\n---\n';

/** What the picker is asked for (copied here; there is no shared helper). */
export const TAG_PHOTO_OPTIONS = {
  mediaType: 'photo',
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 0.9,
  saveToPhotos: false,
  includeBase64: false,
} as const;

// ─── Taking the photo ───────────────────────────────────────────────────────

export type TagPhotoPick =
  | { status: 'ok'; uri: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'unavailable' };

const requestAndroidCamera = async (): Promise<boolean> => {
  // PermissionsAndroid has no web counterpart, so it is only looked up on Android.
  const { PermissionsAndroid } = require('react-native');
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

/**
 * Opens the camera or the photo library for one tag photo. The system camera has no overlay, so the coaching
 * comes before this call. Never throws; a denied permission and a missing camera are told apart so the sheet can
 * say what to do.
 */
export const pickTagPhoto = async (source: 'camera' | 'library'): Promise<TagPhotoPick> => {
  try {
    if (source === 'camera' && Platform.OS === 'android' && !(await requestAndroidCamera())) {
      return { status: 'denied' };
    }
    const result =
      source === 'camera'
        ? await launchCamera({ ...TAG_PHOTO_OPTIONS })
        : await launchImageLibrary({ ...TAG_PHOTO_OPTIONS, selectionLimit: 1 });
    if (result.didCancel) return { status: 'cancelled' };
    if (result.errorCode) return { status: result.errorCode === 'permission' ? 'denied' : 'unavailable' };
    const uri = result.assets?.[0]?.uri;
    return uri ? { status: 'ok', uri } : { status: 'cancelled' };
  } catch {
    return { status: 'unavailable' };
  }
};

// ─── Reading the words ──────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object';

/**
 * The words, word-box heights and mean confidence out of one Vision answer (the element of `responses`).
 * Text is the full-text annotation when there is one, else the first text annotation, else empty.
 */
export const extractOcr = (raw: unknown): TagOcr => {
  const one: any = isRecord(raw) && Array.isArray(raw.responses) ? raw.responses[0] : raw;
  const full = isRecord(one) ? one.fullTextAnnotation : undefined;
  const annotations: any[] = isRecord(one) && Array.isArray(one.textAnnotations) ? one.textAnnotations : [];

  let text = '';
  if (isRecord(full) && typeof full.text === 'string' && full.text !== '') text = full.text;
  else if (isRecord(annotations[0]) && typeof annotations[0].description === 'string') text = annotations[0].description;

  const wordHeights: number[] = [];
  for (const word of annotations.slice(1)) {
    const vertices = isRecord(word) && isRecord(word.boundingPoly) ? word.boundingPoly.vertices : undefined;
    if (!Array.isArray(vertices) || vertices.length === 0) continue;
    const ys = vertices.map((v: any) => (isRecord(v) && typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : 0));
    wordHeights.push(Math.max(...ys) - Math.min(...ys));
  }

  let sum = 0;
  let count = 0;
  const pages: any[] = isRecord(full) && Array.isArray(full.pages) ? full.pages : [];
  for (const page of pages) {
    for (const block of isRecord(page) && Array.isArray(page.blocks) ? page.blocks : []) {
      for (const paragraph of isRecord(block) && Array.isArray(block.paragraphs) ? block.paragraphs : []) {
        for (const word of isRecord(paragraph) && Array.isArray(paragraph.words) ? paragraph.words : []) {
          if (isRecord(word) && typeof word.confidence === 'number' && Number.isFinite(word.confidence)) {
            sum += word.confidence;
            count += 1;
          }
        }
      }
    }
  }

  const locale = annotations[0]?.locale;
  const ocr: TagOcr = { text, wordHeights, meanConfidence: count > 0 ? sum / count : null };
  if (typeof locale === 'string' && locale !== '') ocr.locale = locale;
  return ocr;
};

const median = (values: number[]): number => {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** A letter or digit in any script the parser reads; marks and punctuation do not count as text. */
const ALNUM = /[0-9A-Za-zÀ-ɏͰ-ӿ֐-ۿ぀-鿿가-힯]/;

const isTooSmall = (ocr: TagOcr): boolean =>
  ocr.wordHeights.length >= MIN_WORD_BOXES && median(ocr.wordHeights) < MIN_WORD_HEIGHT_PX;

// ─── Failures ───────────────────────────────────────────────────────────────

/** No usable connection, including a call that never answered. */
const looksOffline = (message: string): boolean =>
  message.startsWith('session_unavailable') ||
  /network request failed|failed to fetch|fetch failed|timed? ?out|ai_timeout|econnreset|socket|offline/i.test(message);

/** Which sentence the person should see for a failed call (see the table in the design). Never retried here. */
export const classifyTagFailure = (error: unknown): TagReadFailure => {
  const kind = classifyAiError(error);
  if (kind === 'signed_out') return 'signed_out';
  if (kind === 'consent') return 'consent';
  const message = typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message : '';
  if (/\b429\b/.test(message) && /daily limit/i.test(message)) return 'daily_limit';
  if (looksOffline(message)) return 'offline';
  return 'failed';
};

class VisionError extends Error {}

/** `promise`'s result, or a rejection if it has not settled within `ms`. The request itself is left to finish. */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ai_timeout: no answer after ${ms / 1000}s`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

// ─── The scan ───────────────────────────────────────────────────────────────

/** An earlier photo of the same scan, already read: a second side is parsed together with the first. */
export interface ReadTagPrior {
  /** The sanitised transcription of the earlier photos (TagRead.transcription). */
  text: string;
  /** How many photos that text came from. */
  photos: number;
  /** The earlier read was flagged low-legibility; that must not be lost by a clearer second photo. */
  lowLegibility?: boolean;
}

export interface ReadTagOptions {
  category?: string;
  onProgress?: (phase: 'reading' | 'structuring') => void;
  prior?: ReadTagPrior;
}

const failed = (reason: TagReadFailure, text?: string): TagReadResult => {
  const transcription = text ? sanitizeTranscription(text) : '';
  return transcription ? { ok: false, reason, transcription } : { ok: false, reason };
};

const scan = async (photoUris: string[], opts: ReadTagOptions = {}): Promise<TagReadResult> => {
  const prior = opts.prior && typeof opts.prior.text === 'string' ? opts.prior : undefined;
  const room = Math.max(0, MAX_TAG_PHOTOS - (prior?.photos ?? 0));
  const requested = (Array.isArray(photoUris) ? photoUris : []).filter(uri => typeof uri === 'string' && uri !== '');
  const uris = requested.slice(0, room);
  // Photos that will not be read are still temporary copies of a tag; none of them is left behind.
  await Promise.all(requested.slice(room).map(uri => discardTempImage(uri)));
  // Nothing to read: no usable photo at all, or the scan already holds its three.
  if (uris.length === 0) return failed(requested.length > 0 ? 'failed' : 'no_text', prior?.text);

  opts.onProgress?.('reading');

  const photos: TagOcr[] = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    try {
      const content = await readImageAsBase64(uri);
      const response = await withTimeout(
        callAiProxy<any>('vision', {
          requests: [{ image: { content }, features: [{ type: TAG_OCR_FEATURE }] }],
        }),
        TAG_CALL_TIMEOUT_MS,
      );
      const answer = response?.responses?.[0];
      // Vision answers 200 with an error inside when it could not read one image.
      if (!isRecord(answer) || answer.error) throw new VisionError('vision_image_error');
      photos.push(extractOcr(answer));
    } catch (error) {
      await Promise.all(uris.slice(i + 1).map(rest => discardTempImage(rest)));
      return failed(classifyTagFailure(error), [prior?.text, ...photos.map(p => p.text)].filter(Boolean).join(PHOTO_SEPARATOR));
    } finally {
      await discardTempImage(uri);
    }
  }

  const withText = photos.filter(p => ALNUM.test(p.text));
  const allText = [prior?.text, ...withText.map(p => p.text)].filter((t): t is string => !!t && t.trim() !== '').join(PHOTO_SEPARATOR);
  if (withText.length === 0) return failed('no_text');
  // Only when every photo that has words is small or blurry: one good photo is enough to go on.
  if (withText.every(isTooSmall)) return failed('too_small', allText);

  // The least legible photo decides: one blurry side must not be hidden by a clear one.
  const confidences = photos.map(p => p.meanConfidence).filter((c): c is number => c !== null);
  const meanConfidence = prior?.lowLegibility ? 0 : confidences.length > 0 ? Math.min(...confidences) : null;

  let read: TagRead = parseTagText(allText, { category: opts.category, ocr: { meanConfidence } });
  if (!read.readable) return failed('no_text', allText);

  if (TAG_MODEL_FALLBACK_ENABLED && !isClean(read)) {
    opts.onProgress?.('structuring');
    try {
      const locale = withText.map(p => p.locale).find(Boolean);
      const model = await withTimeout(readTagWithModel(allText, locale), TAG_CALL_TIMEOUT_MS);
      if (model) read = mergeReads(read, groundModelRead(model, allText));
    } catch {
      // The local read stands; the second opinion is never worth an error message.
    }
  }

  return { ok: true, read };
};

const run = async (photoUris: string[], opts?: ReadTagOptions): Promise<TagReadResult> => {
  try {
    return await scan(photoUris, opts);
  } catch {
    return { ok: false, reason: 'failed' };
  }
};

// One scan at a time: a second call waits for the first, so two scans never share the proxy's per-minute allowance.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Reads the tag in `photoUris` (at most MAX_TAG_PHOTOS in all, counting `opts.prior`), in order. Resolves, never
 * rejects. Each photo's temporary file is deleted after it is read, on every path.
 */
export const readTag = (photoUris: string[], opts?: ReadTagOptions): Promise<TagReadResult> => {
  const result = queue.then(
    () => run(photoUris, opts),
    () => run(photoUris, opts),
  );
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};
