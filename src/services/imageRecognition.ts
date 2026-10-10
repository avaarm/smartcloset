/**
 * Image recognition service for clothing analysis.
 *
 * Reads a photo with Google Cloud Vision (labels, object localisation, pixel
 * colours, logos, text) and a vision model (a semantic read of the item), both
 * through the ai-proxy, and fuses them in recognitionFusion. Returns an empty
 * result tagged with why when no analysis could run.
 */

import { ClothingCategory } from '../types/clothing';
import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';
import { callAiProxy, classifyAiError, classifyAiErrors, type AiFailure } from './aiProxy';
import { ensureAiConsent } from './aiConsent';
import {
  analyzeVision,
  buildVisionContext,
  fuseRecognition,
  normalizeAiAnswer,
  parseAiContent,
  type AiAnswer,
  type VisionAnalysis,
} from './recognitionFusion';
import { CATEGORY_NOUN } from '../utils/clothingCategories';

// Define pattern types for clothing
export type PatternType = 'solid' | 'striped' | 'plaid' | 'floral' | 'polka_dot' | 'graphic' | 'other';

// Types for the AI image recognition service
export interface DetectedColor {
  name: string;
  /** sRGB hex (e.g. "#8B2131") for UI swatches. */
  hex: string;
  /** 0..1 - how prominent this colour is on the item; the first entry is the primary colour. */
  weight: number;
}

/** Kind of price detected on a tag/receipt — lets the caller prefer sale over original. */
export type PriceKind = 'sale' | 'original' | 'plain';

export interface DetectedPrice {
  /** Original matched string, e.g. "$198.00" or "€ 128,50". */
  raw: string;
  /** Numeric value parsed with locale awareness. */
  amount: number;
  /** ISO currency code, e.g. "USD" / "EUR". Defaults to USD when only symbol present. */
  currency: string;
  /** "sale" | "original" | "plain" — inferred from nearby words (sale/was/now/original/retail/msrp). */
  kind: PriceKind;
}

export interface RecognitionResult {
  category?: ClothingCategory;
  /** Specific sub-category keyword like "handbag", "jeans", "sneaker" — used for name auto-fill. */
  subtype?: string;
  brand?: string;
  occasion?: string;
  /** Primary color name of the ITEM (e.g. "burgundy"), never of the floor or backdrop — backwards compat with existing consumers. */
  color?: string;
  /** Up to 4 colours of the item, most likely first, each with a hex for its swatch. */
  colors?: DetectedColor[];
  pattern?: PatternType;
  material?: string;
  /** Structured prices OCR'd from the image (tags, receipts, screenshots). */
  prices?: DetectedPrice[];
  confidence: {
    category?: number;
    brand?: number;
    occasion?: number;
    color?: number;
    pattern?: number;
    material?: number;
  };
  /** Vision labels about the item (floor/wall/table labels are left out), most certain first. */
  rawLabels?: string[];
  /** True when the result came from a real Vision API call, false for mock fallback. */
  isReal?: boolean;
  /** Why there is no real result (only set when isReal is false), so the UI can explain it kindly. */
  unavailableReason?: AiFailure;
  /** Vision WEB_DETECTION bestGuessLabel — Google's reverse-image-search guess (e.g. "bottega veneta cassette bag"). */
  bestGuess?: string;
  /** Top WEB_DETECTION webEntities, ordered by score. Useful for brand/model inference. */
  webEntities?: string[];
  /** Suitable seasons from the vision model's semantic analysis. */
  season?: string[];
  /** Style descriptors from the vision model (e.g. ["streetwear", "minimalist"]). */
  style?: string[];
  /** Gender targeting from the vision model — "men" | "women" | "unisex". */
  gender?: string;
  /** One-sentence natural-language description from the vision model. */
  description?: string;
  /** True when the vision model's analysis was applied on top of (or instead of) Google Vision. */
  gpt4Enhanced?: boolean;
}

// ─── Main analysis function ─────────────────────────────────────────────────

const VISION_FEATURES = [
  { type: 'LABEL_DETECTION', maxResults: 30 },
  { type: 'OBJECT_LOCALIZATION', maxResults: 15 },
  { type: 'TEXT_DETECTION' },
  { type: 'IMAGE_PROPERTIES' },
  { type: 'LOGO_DETECTION', maxResults: 5 },
  { type: 'WEB_DETECTION', maxResults: 20 },
];

/** The vision model waits this long for Google Vision's hints, then goes ahead without them. */
const VISION_HINT_WAIT_MS = 2500;
/** A call with no answer by now has failed: a hung request must not keep the spinner going for good. */
const AI_CALL_TIMEOUT_MS = 25000;

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

/** What `promise` (which never rejects) gives if it does so within `ms`, otherwise null. */
const withinMs = <T>(promise: Promise<T | null>, ms: number): Promise<T | null> =>
  new Promise<T | null>(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    });
  });

/** Google Vision's read of the photo, or null when it could not be had (the cause goes into `failures`). */
const readWithGoogleVision = async (base64: string, failures: unknown[]): Promise<VisionAnalysis | null> => {
  try {
    const response = await withTimeout(
      callAiProxy<any>('vision', {
        requests: [{ image: { content: base64 }, features: VISION_FEATURES }],
      }),
      AI_CALL_TIMEOUT_MS,
    );
    const raw = response?.responses?.[0];
    if (raw && !raw.error) {
      const vision = analyzeVision(raw);
      console.log('[Vision] top labels:', (vision.result.rawLabels || []).slice(0, 5).join(', '),
        '| main item:', vision.mainItem);
      return vision;
    }
    console.warn('[Vision] response error:', JSON.stringify(raw?.error));
  } catch (error: any) {
    failures.push(error);
    console.warn('[Vision] proxy error:', error?.message);
  }
  return null;
};

/** The vision model's read of the photo, or null when it could not be had (the cause goes into `failures`). */
const readWithVisionModel = async (
  base64: string,
  hints: VisionAnalysis | null,
  failures: unknown[],
): Promise<AiAnswer | null> => {
  try {
    const response = await withTimeout(
      callAiProxy<any>('openai-vision', {
        imageBase64: base64,
        visionContext: buildVisionContext(hints),
      }),
      AI_CALL_TIMEOUT_MS,
    );
    const ai = normalizeAiAnswer(parseAiContent(response?.choices?.[0]?.message?.content));
    console.log('[AI Vision] category:', ai?.category, 'colors:', ai?.colors, 'material:', ai?.material);
    return ai;
  } catch (error: any) {
    failures.push(error);
    console.warn('[AI Vision] error:', error?.message);
    return null;
  }
};

/**
 * Analyzes a clothing image and returns predicted attributes.
 *
 * Uses Google Cloud Vision when GOOGLE_VISION_API_KEY is set.
 * Falls back to mock results otherwise.
 */
export const analyzeClothingImage = async (imageUri: string): Promise<RecognitionResult> => {
  console.log('[Vision] analyzeClothingImage called. hasGoogleVision=', hasGoogleVision(),
    'enabled=', env.ENABLE_VISION_API);
  try {
    if (hasGoogleVision()) {
      console.log('[Vision] reading image as base64:', imageUri.substring(0, 80));
      const base64 = await readImageAsBase64(imageUri);
      console.log('[Vision] base64 length:', base64.length);
      const failures: unknown[] = [];

      // A first-time user is asked before the photo leaves the phone. Wait for the answer here, so the
      // time they spend reading the prompt does not count against the calls' timeouts below.
      await ensureAiConsent();

      // Google Vision's labels and localised objects tell the vision model which item to describe,
      // so it doesn't answer for the floor or the other shoes. A slow Vision call must not hold the
      // model back though: it starts as soon as Vision answers or after VISION_HINT_WAIT_MS, whichever
      // is first (without hints in the second case), and Vision's result is still used when it arrives.
      const visionRun = readWithGoogleVision(base64, failures);
      const hints = await withinMs(visionRun, VISION_HINT_WAIT_MS);
      const [vision, ai] = await Promise.all([visionRun, readWithVisionModel(base64, hints, failures)]);

      const result = fuseRecognition(vision, ai);
      if (result) {
        if (vision) {
          const prices = extractPrices(vision.ocrText);
          if (prices.length > 0) result.prices = prices;
        }
        console.log('[Vision] result:', JSON.stringify({
          category: result.category, subtype: result.subtype, brand: result.brand,
          color: result.color, material: result.material, aiEnhanced: result.gpt4Enhanced,
        }));
        return result;
      }

      // Both analyses failed: carry the cause so the screen can say why in plain
      // words (signed out, AI turned off, offline) instead of a developer error.
      return { ...getMockRecognitionResult(), unavailableReason: classifyAiErrors(failures) };
    }

    // ── Mock fallback (proxy not configured) ──
    console.warn('[Vision] SKIPPED — SUPABASE_URL not configured. Check .env and rebuild.');
    await new Promise(resolve => setTimeout(resolve, 300));
    return { ...getMockRecognitionResult(), unavailableReason: 'other' };
  } catch (error: any) {
    console.error('[Vision] Exception in analyze:', error?.message || error);
    return { ...getMockRecognitionResult(), unavailableReason: classifyAiError(error) };
  }
};

// ─── Price extraction (OCR) ─────────────────────────────────────────────────

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR', '₩': 'KRW',
};

const CURRENCY_CODES = [
  'USD', 'CAD', 'AUD', 'NZD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'SEK',
  'INR', 'MXN', 'KRW', 'SGD', 'HKD', 'NOK', 'DKK',
] as const;

/** Keywords that suggest a nearby number is a sale price. */
const SALE_MARKERS = ['sale', 'now', 'reduced', 'markdown', 'clearance', 'discount'];
/** Keywords that suggest a nearby number is the original/retail price. */
const ORIG_MARKERS = ['original', 'retail', 'msrp', 'was', 'regular', 'reg', 'list'];

/**
 * Parse a number that may be in US format (1,298.00) or European (1.298,00).
 * Falls back to a naive parseFloat when both separators aren't present.
 */
const parseLocaleNumber = (s: string): number => {
  const cleaned = s.trim();
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Determine decimal separator by position — whichever comes last.
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      // European: dots are thousands separators, comma is decimal
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    // US: commas are thousands, dot is decimal
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (hasComma) {
    // Single comma — could be decimal (European "85,50") or thousands ("1,298")
    const parts = cleaned.split(',');
    const last = parts[parts.length - 1];
    // If last group has exactly 2 digits, treat comma as decimal
    if (last.length === 2) return parseFloat(cleaned.replace(',', '.'));
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  // Dot or plain integer
  return parseFloat(cleaned);
};

/**
 * Classify a price based on ±40 characters of context. "Sale $128" → sale;
 * "Was $160" → original; otherwise plain.
 */
const classifyPrice = (text: string, matchStart: number, matchEnd: number): PriceKind => {
  const start = Math.max(0, matchStart - 40);
  const end = Math.min(text.length, matchEnd + 40);
  const context = text.substring(start, end).toLowerCase();
  if (SALE_MARKERS.some(m => context.includes(m))) return 'sale';
  if (ORIG_MARKERS.some(m => context.includes(m))) return 'original';
  return 'plain';
};

/**
 * Extract all plausible prices from OCR text. Supports:
 *   - Symbol-prefixed: "$198", "£99.99", "€ 1.298,00", "¥12000"
 *   - Code-suffixed:   "198 USD", "99.95 EUR"
 *   - Code-prefixed:   "USD 198", "EUR 99.95"
 * Classifies each as sale/original/plain based on surrounding words.
 * Dedupes identical (amount, currency) pairs keeping the strongest context.
 */
export const extractPrices = (text: string): DetectedPrice[] => {
  if (!text) return [];
  const prices: DetectedPrice[] = [];
  const codesPattern = CURRENCY_CODES.join('|');

  // 1) Symbol-prefixed — e.g. "$1,298.00" or "€ 85,50"
  const symbolRe = /([$£€¥₹₩])\s?([0-9]{1,3}(?:[,.][0-9]{3})*(?:[.,][0-9]{1,2})?|\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = symbolRe.exec(text)) !== null) {
    const amount = parseLocaleNumber(m[2]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = SYMBOL_TO_CURRENCY[m[1]] || 'USD';
    prices.push({
      raw: `${m[1]}${m[2]}`,
      amount,
      currency,
      kind: classifyPrice(text, m.index, m.index + m[0].length),
    });
  }

  // 2) Code after — e.g. "198 USD", "99.95 EUR"
  const codeAfterRe = new RegExp(
    `(\\d{1,3}(?:[,.]\\d{3})*(?:[.,]\\d{1,2})?)\\s?(${codesPattern})\\b`,
    'gi',
  );
  while ((m = codeAfterRe.exec(text)) !== null) {
    const amount = parseLocaleNumber(m[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    prices.push({
      raw: `${m[1]} ${m[2].toUpperCase()}`,
      amount,
      currency: m[2].toUpperCase(),
      kind: classifyPrice(text, m.index, m.index + m[0].length),
    });
  }

  // 3) Code before — e.g. "USD 198", "EUR 99.95"
  const codeBeforeRe = new RegExp(
    `\\b(${codesPattern})\\s?(\\d{1,3}(?:[,.]\\d{3})*(?:[.,]\\d{1,2})?)`,
    'gi',
  );
  while ((m = codeBeforeRe.exec(text)) !== null) {
    const amount = parseLocaleNumber(m[2]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    prices.push({
      raw: `${m[1].toUpperCase()} ${m[2]}`,
      amount,
      currency: m[1].toUpperCase(),
      kind: classifyPrice(text, m.index, m.index + m[0].length),
    });
  }

  // ── De-dupe by (amount, currency); prefer sale > original > plain for kind ──
  const byKey = new Map<string, DetectedPrice>();
  const kindPriority: Record<PriceKind, number> = { sale: 3, original: 2, plain: 1 };
  for (const p of prices) {
    const key = `${p.amount}_${p.currency}`;
    const existing = byKey.get(key);
    if (!existing || kindPriority[p.kind] > kindPriority[existing.kind]) {
      byKey.set(key, p);
    }
  }

  // ── Filter clearly implausible clothing prices ──
  // < $3 usually means the OCR caught a size tag or SKU digit
  // > $25,000 usually means two numbers got concatenated
  const filtered = Array.from(byKey.values()).filter(
    p => p.amount >= 3 && p.amount <= 25000,
  );

  // ── Sort: sale prices first (most likely what was paid), then by amount asc
  //    within each kind (lowest sale price usually == final price paid)
  return filtered
    .sort((a, b) => {
      const kdiff = kindPriority[b.kind] - kindPriority[a.kind];
      if (kdiff !== 0) return kdiff;
      return a.amount - b.amount;
    })
    .slice(0, 6);
};

/**
 * Format a DetectedPrice for display. Uses the symbol when known for compactness.
 */
export const formatPrice = (p: DetectedPrice): string => {
  const symbols: Record<string, string> = {
    USD: '$', CAD: 'CA$', AUD: 'A$',
    GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩',
  };
  const sym = symbols[p.currency] || `${p.currency} `;
  // Keep 2 decimals if not integer, no trailing zeros
  const amt = Number.isInteger(p.amount)
    ? String(p.amount)
    : p.amount.toFixed(2).replace(/\.?0+$/, '');
  return `${sym}${amt}`;
};

/**
 * Pick the most-likely-paid price from a list of detected prices.
 *   1. If any sale prices → cheapest sale
 *   2. Else cheapest plain
 *   3. Else cheapest original
 * Returns undefined if no prices.
 */
export const pickBestPrice = (prices: DetectedPrice[]): DetectedPrice | undefined => {
  if (!prices || prices.length === 0) return undefined;
  const sales = prices.filter(p => p.kind === 'sale');
  if (sales.length > 0) return sales.reduce((min, p) => (p.amount < min.amount ? p : min));
  const plains = prices.filter(p => p.kind === 'plain');
  if (plains.length > 0) return plains.reduce((min, p) => (p.amount < min.amount ? p : min));
  const origs = prices.filter(p => p.kind === 'original');
  if (origs.length > 0) return origs.reduce((min, p) => (p.amount < min.amount ? p : min));
  return prices[0];
};

// ─── Mock fallback ──────────────────────────────────────────────────────────

// Returns an empty result so we don't invent wrong values that contradict the
// actual photo. The caller (AddClothingScreen) checks `isReal` before
// auto-filling any field; mock results never autofill.
const getMockRecognitionResult = (): RecognitionResult => ({
  confidence: {},
  isReal: false,
});

// ─── Confidence helper ──────────────────────────────────────────────────────

/**
 * Determines if a recognition result is confident enough to autofill.
 * Stricter threshold — use for UI highlighting / "confirm this guess" prompts.
 */
export const isConfidentPrediction = (
  result: RecognitionResult,
  field: 'category' | 'brand' | 'occasion' | 'color' | 'pattern' | 'material',
): boolean => {
  const threshold: Record<string, number> = {
    category: 0.7,
    brand: 0.8,
    occasion: 0.65,
    color: 0.7,
    pattern: 0.65,
    material: 0.7,
  };
  return !!result.confidence[field] && (result.confidence[field] as number) >= threshold[field];
};

const AUTOFILL_THRESHOLD = {
  category: 0.35,
  brand: 0.5,
  occasion: 0.4,
  color: 0.4,
  pattern: 0.4,
  material: 0.4,
};

/**
 * Looser threshold for auto-filling an EMPTY field — we'd rather pre-fill a
 * reasonable guess than leave the form blank. The user can always override.
 */
export const shouldAutofillPrediction = (
  result: RecognitionResult,
  field: 'category' | 'brand' | 'occasion' | 'color' | 'pattern' | 'material',
): boolean =>
  !!result.confidence[field] && (result.confidence[field] as number) >= AUTOFILL_THRESHOLD[field];

// Fibres and fabrics that make an item recognisable; "cotton" or "polyester" would only clutter a name.
const NAME_MATERIALS = new Set([
  'leather', 'suede', 'nubuck', 'patent leather', 'vegan leather', 'faux leather', 'denim', 'canvas',
  'silk', 'satin', 'velvet', 'linen', 'wool', 'cashmere', 'tweed', 'corduroy', 'shearling', 'faux fur',
  'lace', 'straw', 'raffia', 'knit', 'cable knit',
]);

// Patterns that say nothing about the item: "solid" is Vision's default, "other" is whatever the model
// could not name, and "graphic" is what the generic Graphics label turns into.
const UNNAMED_PATTERNS = new Set<string>(['solid', 'other', 'graphic']);

// Sold and worn as a pair, so a name reads "Boots", not "Boot".
const PAIRED_ITEMS = new Set([
  'boot', 'shoe', 'sneaker', 'sandal', 'heel', 'loafer', 'slipper', 'pump', 'mule', 'clog', 'flat', 'wedge',
  'espadrille', 'moccasin', 'trainer', 'earring', 'cufflink', 'glove', 'mitten', 'sock', 'legging',
]);

/**
 * Generate a default item name from the recognition result, e.g.
 *   { color: 'tan', material: 'suede', subtype: 'knee-high boots' } → "Tan Suede Knee-High Boots"
 *   { brand: 'Gucci', color: 'black', subtype: 'jacket' } → "Gucci Black Jacket"
 * Falls back to a generic category label if no subtype is available. A word
 * the parts repeat ("Black" in both colour and subtype) appears once. With
 * neither a category nor a subtype there is no item to name, so no name.
 */
export const generateNameFromRecognition = (result: RecognitionResult): string => {
  if (!result.category && !result.subtype) return '';

  // Capitalise each word, including after a hyphen or slash ("knee-high" -> "Knee-High").
  const titleCase = (s: string) => s.replace(/(^|[\s\-/])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());

  const parts: string[] = [];

  if (result.brand) parts.push(result.brand);
  // A colour the form would not fill in (a guess from the photo's pixels) stays out of the name too.
  const colorConfidence = result.confidence.color;
  if (result.color && (colorConfidence === undefined || colorConfidence >= AUTOFILL_THRESHOLD.color)) {
    parts.push(result.color);
  }
  if (result.material && NAME_MATERIALS.has(result.material.toLowerCase())) parts.push(result.material);

  // Only inject the pattern word when the subtype doesn't already mention it —
  // subtypes like "striped cotton shirt" already embed the pattern.
  const subtype = (result.subtype || '').toLowerCase();
  if (result.pattern && !UNNAMED_PATTERNS.has(result.pattern)) {
    const patternWord = result.pattern.replace('_', ' ');
    if (!subtype.includes(patternWord)) parts.push(patternWord);
  }

  if (subtype) {
    const words = subtype.split(' ');
    const last = words[words.length - 1];
    if (PAIRED_ITEMS.has(last)) words[words.length - 1] = `${last}s`;
    parts.push(words.join(' '));
  } else if (result.category) {
    parts.push(CATEGORY_NOUN[result.category]);
  }

  // Drop any word that already appeared earlier, case-insensitively.
  const seen = new Set<string>();
  const words = parts
    .join(' ')
    .split(' ')
    .filter(w => {
      const key = w.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return titleCase(words.join(' ').trim());
};
