/**
 * Turns the two photo analyses - Google Vision (labels, objects, pixels, text)
 * and the vision model (a semantic read of the item) - into one result.
 *
 * Rules that keep the form from being filled with a wrong guess:
 *   - category comes from whole-word, specificity-weighted label matching, so a
 *     "Flooring" label can't make boots an accessory;
 *   - when both analyses name a category and disagree, the model (which sees the
 *     whole picture) wins but the confidence drops to say so;
 *   - colour describes the item, never the floor behind it (see recognitionColors);
 *   - whatever the model returns is validated first, so a bad answer can't put
 *     garbage in the form.
 */

import type { ClothingCategory } from '../types/clothing';
import type { PatternType, RecognitionResult } from './imageRecognition';
import {
  SPECIFICITY_WEIGHT,
  matchCategoryTerm,
  categoryFromText,
  refineCategory,
} from '../utils/clothingCategories';
import { CLOTHING_COLORS, MULTICOLOR, hexForColorName, normalizeColorName } from '../utils/colorNames';
import {
  CLOTHING_CATEGORIES,
  SEASONS,
  isClothingCategory,
  normalizeOccasion,
  normalizeSeason,
} from '../utils/clothingOptions';
import { containsPhrase, tokenize } from '../utils/wordMatch';
import { readPixelColors, resolveItemColors, type ColorScene, type PixelColor } from './recognitionColors';

// ─── Keyword tables ──────────────────────────────────────────────────────────

// Brands we can name from text, web entities and Google's guess. Order is irrelevant: when several
// are found the longest name wins ("polo ralph lauren" over "ralph lauren").
const BRAND_NAMES = [
  // Luxury (multi-word first)
  'bottega veneta', 'saint laurent', 'yves saint laurent', 'louis vuitton',
  'maison margiela', 'maison kitsuné', 'thom browne', 'jacquemus',
  'jean paul gaultier', 'acne studios', 'isabel marant', 'rick owens',
  'comme des garçons', 'comme des garcons', 'dries van noten',
  'max mara', 'mm6 maison margiela', 'paco rabanne',
  'a.p.c.', 'a p c', 'apc',
  'tory burch', 'tom ford', 'mulberry', 'marc jacobs', 'kate spade',
  'michael kors', 'coach', 'longchamp', 'goyard',
  // Luxury single-word
  'gucci', 'prada', 'chanel', 'dior', 'versace', 'balenciaga',
  'hermès', 'hermes', 'loewe', 'celine', 'céline', 'fendi', 'burberry',
  'bottega', 'valentino', 'givenchy', 'lanvin', 'chloé', 'chloe',
  'miumiu', 'miu miu', 'cartier', 'tiffany', 'bulgari', 'bvlgari',
  'rolex', 'omega', 'patek philippe', 'audemars piguet',
  'ferragamo', 'pucci', 'moschino', 'etro', 'missoni',
  'off-white', 'off white', 'fear of god', 'palm angels', 'amiri',
  'stone island', 'moncler', 'canada goose',
  // Sportswear
  'nike', 'adidas', 'puma', 'reebok', 'converse', 'vans', 'new balance',
  'asics', 'on running', 'hoka', 'salomon', 'fila',
  'jordan', 'air jordan',
  // Premium contemporary
  'zara', 'h&m', 'uniqlo', 'gap', 'old navy', 'banana republic', 'j.crew',
  'jcrew', 'madewell', 'aritzia', 'everlane', 'reformation', 'cos',
  'allsaints', 'theory', 'vince', 'rag & bone', 'rag and bone',
  'common projects', 'sandro', 'maje', 'ganni', 'staud',
  // Denim
  'levi', "levi's", "levis",
  // Designer-adjacent
  'calvin klein', 'tommy hilfiger', 'ralph lauren', 'polo ralph lauren',
  // Outerwear / outdoor
  'north face', 'the north face', 'patagonia', 'columbia', 'under armour',
  'arc\'teryx', 'arcteryx',
  // Streetwear
  'supreme', 'stussy', 'bape', 'kith', 'aimé leon dore', 'aime leon dore',
  'gallery dept', 'rhude', 'pleasures',
  // Athleisure
  'lululemon', 'alo yoga', 'alo', 'gymshark', 'vuori', 'outdoor voices', 'sweaty betty',
  // Emerging / contemporary
  'toteme', 'khaite', 'agolde', 'anine bing', 'bite studios',
  'nanushka', 'réalisation par', 'realisation par',
  // Fast fashion / accessible
  'abercrombie', 'american eagle', 'hollister', 'anthropologie', 'free people',
  'urban outfitters', 'topshop', 'mango', 'massimo dutti',
];

// Brands that are also everyday words, garments or places. Web text only vouches for them when it
// leads with the name and names no garment ("Coach", "Jordan 1 high"), not for "Michael Jordan" or
// "coach tabby bag"; text read off the item or a detected logo vouches for them as for any brand.
const WORD_BRANDS: ReadonlySet<string> = new Set([
  'coach', 'jordan', 'cos', 'alo', 'gap', 'theory', 'vince', 'mulberry', 'omega', 'mango', 'supreme',
  'puma', 'on running', 'off white', 'off-white', 'old navy', 'tiffany',
]);

const PATTERN_KEYWORDS: Record<string, PatternType> = {
  'striped': 'striped', 'stripe': 'striped',
  'plaid': 'plaid', 'tartan': 'plaid', 'checkered': 'plaid',
  'floral': 'floral', 'flower': 'floral',
  'polka dot': 'polka_dot', 'dotted': 'polka_dot',
  'graphic': 'graphic', 'print': 'graphic',
  'solid': 'solid', 'plain': 'solid',
};

const PATTERN_TYPES: ReadonlySet<string> = new Set([
  'solid', 'striped', 'plaid', 'floral', 'polka_dot', 'graphic', 'other',
]);

// What a model calls a pattern when it isn't one of ours.
const PATTERN_ALIASES: Record<string, PatternType> = {
  stripe: 'striped', stripes: 'striped', checked: 'plaid', check: 'plaid', checkered: 'plaid',
  gingham: 'plaid', tartan: 'plaid', flower: 'floral', flowers: 'floral', polka: 'polka_dot',
  polka_dots: 'polka_dot', dots: 'polka_dot', dotted: 'polka_dot', print: 'graphic', logo: 'graphic',
  plain: 'solid',
};

const MATERIAL_NAMES = [
  // Natural fibers
  'cotton', 'wool', 'silk', 'linen', 'cashmere', 'alpaca', 'mohair',
  // Synthetics
  'polyester', 'nylon', 'spandex', 'lycra', 'acrylic', 'rayon', 'viscose', 'modal',
  // Leather & suede
  'leather', 'suede', 'nubuck', 'patent leather', 'vegan leather', 'faux leather',
  // Denim & canvas
  'denim', 'canvas', 'twill', 'gabardine', 'chambray', 'poplin',
  // Knits & fleece
  'fleece', 'jersey', 'knit', 'cable knit', 'sherpa', 'terry cloth',
  // Luxury / specialty
  'velvet', 'satin', 'chiffon', 'tweed', 'corduroy', 'flannel', 'shearling',
  'faux fur', 'organza', 'mesh', 'lace', 'brocade',
  // Footwear / bag materials
  'rubber', 'foam', 'straw', 'raffia', 'wicker',
];

// Materials of jewelry, hats and bags. Only the vision model's answer may use them: as Vision labels
// or in a product name they are as likely a colour or hardware ("Metal" on a boot buckle, a "silver sandal").
const MODEL_ONLY_MATERIALS = [
  'gold', 'silver', 'sterling silver', 'pearl', 'metal', 'brass', 'crystal', 'enamel', 'resin', 'ceramic',
  'glass', 'wood', 'plastic', 'felt', 'wool felt', 'cork', 'neoprene', 'sequin', 'tulle', 'calfskin',
];
const MODEL_MATERIALS = [...MATERIAL_NAMES, ...MODEL_ONLY_MATERIALS];

// A Vision "Leather" label next to a "Suede" one is the same material seen twice; the specific name is the answer.
const MATERIAL_FAMILY: Record<string, string> = {
  suede: 'leather', nubuck: 'leather', 'patent leather': 'leather', 'vegan leather': 'leather',
  'faux leather': 'leather', calfskin: 'leather', shearling: 'fur', 'faux fur': 'fur', 'cable knit': 'knit',
  'wool felt': 'wool',
};
const SPECIFIC_MATERIALS: ReadonlySet<string> = new Set(Object.keys(MATERIAL_FAMILY));
const familyOf = (material: string): string => MATERIAL_FAMILY[material] ?? material;

const OCCASION_MAP: Record<string, string[]> = {
  'formal': ['formal', 'tuxedo', 'gown', 'dress shoe', 'suit', 'tie', 'wedding', 'gala', 'black tie'],
  'business': ['business', 'office', 'work', 'professional', 'blazer', 'slacks', 'dress pants'],
  'casual': ['casual', 'everyday', 't-shirt', 'jeans', 'sneaker', 'weekend', 'streetwear', 'loungewear', 'beach'],
  'sports': ['sports', 'athletic', 'workout', 'running', 'gym', 'activewear', 'yoga', 'cycling', 'tennis', 'golf', 'hiking'],
  'party': ['party', 'club', 'evening', 'cocktail', 'sequin', 'glitter', 'going out'],
  'everyday': ['daily', 'errand', 'commute', 'versatile', 'all-day'],
};

// Labels for what the item sits on. They colour the pixels around it, not the item.
const SURFACE_LABELS = [
  'floor', 'flooring', 'hardwood', 'wood', 'wood stain', 'wood flooring', 'laminate', 'laminate flooring',
  'parquet', 'plank', 'lumber', 'table', 'desk', 'furniture', 'countertop', 'cabinetry', 'shelf', 'tile',
  'carpet',
];
// Other scene words that say nothing about the item itself.
const SCENE_LABELS = ['wall', 'room', 'ceiling', 'ground', 'grass', 'sky', 'pavement', 'asphalt', 'road', 'interior design'];
/** A surface label this sure means the surface fills a good part of the frame. */
const SURFACE_MIN_SCORE = 0.6;

const MODEL_BRAND_NONE = /^(null|none|n\/a|na|unknown|unbranded|no brand|generic|not visible|undefined|-)$/i;

// ─── Vision (labels, objects, pixels, text) ──────────────────────────────────

interface Scored {
  text: string;
  score: number;
}

/** left, top, right, bottom as fractions of the frame. */
type Rect = readonly [number, number, number, number];

interface LocalizedObject extends Scored {
  rect: Rect;
  /** Fraction of the frame the box covers. */
  area: number;
}

export interface VisionAnalysis {
  /** What Vision alone could read, except colour (see pixels) and prices (see ocrText). */
  result: RecognitionResult;
  pixels: PixelColor[];
  scene: ColorScene;
  /** The largest, most certain clothing object, e.g. "Boot". */
  mainItem?: string;
  /** Surface/scene labels dropped from the item's labels, e.g. "Hardwood". */
  backgroundLabels: string[];
  /** First text block Vision read off the photo, for price extraction. */
  ocrText: string;
  /** A colour word among the item's labels - the last resort when nothing was measured and no surface is in view. */
  labelColor?: string;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const unit = (n: number): number => Math.min(1, Math.max(0, n));

/** The box a polygon of normalised vertices spans, kept inside the frame; empty without two vertices. */
const boxRect = (poly: any): Rect => {
  const verts: any[] = poly?.normalizedVertices ?? [];
  if (verts.length < 2) return [0, 0, 0, 0];
  const xs = verts.map(v => unit(num(v?.x)));
  const ys = verts.map(v => unit(num(v?.y)));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const rectArea = ([left, top, right, bottom]: Rect): number => (right - left) * (bottom - top);

/**
 * Area covered by at least one of the boxes. Google often boxes one boot as "Boot", "Footwear" and
 * "Shoe", so adding the areas up would count the same ground twice. Slices the frame at every box
 * edge and measures the stretch of each slice that some box spans.
 */
const unionArea = (rects: Rect[]): number => {
  const edges = Array.from(new Set(rects.flatMap(r => [r[0], r[2]]))).sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < edges.length; i++) {
    const [left, right] = [edges[i], edges[i + 1]];
    const spans = rects
      .filter(r => r[0] <= left && r[2] >= right)
      .map(r => [r[1], r[3]])
      .sort((a, b) => a[0] - b[0]);
    let reached = 0;
    let covered = 0;
    for (const [top, bottom] of spans) {
      covered += Math.max(0, bottom - Math.max(top, reached));
      reached = Math.max(reached, bottom);
    }
    area += covered * (right - left);
  }
  return area;
};

const isSurfaceLabel = (text: string): boolean => SURFACE_LABELS.some(p => containsPhrase(text, p));
const isSceneLabel = (text: string): boolean =>
  isSurfaceLabel(text) || SCENE_LABELS.some(p => containsPhrase(text, p));

interface CategoryRead {
  category?: ClothingCategory;
  confidence?: number;
  subtype?: string;
  mainItem?: string;
  coverage?: number;
}

interface Tally {
  total: number;
  top: number;
  terms: Array<{ phrase: string; specificity: number; value: number; fromMain: boolean }>;
}

/**
 * Category from labels, localised objects, web entities and Google's best
 * guess. Every signal is a whole-word term lookup weighted by how specific the
 * term is, so generic labels ("Footwear", "Fashion accessory") add little and
 * can't outweigh "Boot". Confidence reflects the best single signal and how
 * much of the total evidence the winner holds.
 */
const readCategory = (
  labels: Scored[],
  objects: LocalizedObject[],
  web: Scored[],
  bestGuess?: string,
): CategoryRead => {
  // The item the photo is about: the category whose boxes carry the most (certainty x size).
  const boxes = objects.flatMap(o => {
    const m = matchCategoryTerm(o.text);
    return m ? [{ o, category: m.category }] : [];
  });
  const boxWeight = new Map<ClothingCategory, number>();
  for (const { o, category } of boxes) {
    boxWeight.set(category, (boxWeight.get(category) ?? 0) + o.score * o.area);
  }
  const mainCategory = Array.from(boxWeight.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mainBoxes = boxes.filter(b => b.category === mainCategory);
  const mainObject = [...mainBoxes].sort((a, b) => b.o.area - a.o.area)[0]?.o;
  const coverage = mainBoxes.length ? unionArea(mainBoxes.map(b => b.o.rect)) : undefined;

  const tallies = new Map<ClothingCategory, Tally>();
  const add = (text: string, strength: number, multiplier: number, fromMain = false) => {
    const m = matchCategoryTerm(text);
    if (!m) return;
    const base = strength * SPECIFICITY_WEIGHT[m.specificity];
    const t = tallies.get(m.category) ?? { total: 0, top: 0, terms: [] };
    t.total += base * multiplier;
    t.top = Math.max(t.top, Math.min(1, base));
    if (m.nameable) {
      t.terms.push({ phrase: m.phrase, specificity: m.specificity, value: base * multiplier, fromMain });
    }
    tallies.set(m.category, t);
  };

  labels.forEach(l => add(l.text, l.score, 1));
  // Localised objects count for more, and big ones for more than small ones.
  objects.forEach(o => add(o.text, o.score, 1.5 * (0.6 + 0.4 * Math.min(1, o.area * 4)), o === mainObject));
  web.forEach(e => add(e.text, Math.min(1, e.score), 0.5));
  if (bestGuess) add(bestGuess, 0.7, 0.6);

  const ranked = Array.from(tallies.entries()).sort((a, b) => b[1].total - a[1].total || b[1].top - a[1].top);
  if (ranked.length === 0) return { mainItem: mainObject?.text, coverage };

  const [winner, t] = ranked[0];
  const sum = ranked.reduce((acc, [, x]) => acc + x.total, 0);
  const share = sum > 0 ? t.total / sum : 1;
  const confidence = Math.min(0.85, t.top * (0.55 + 0.45 * share));

  // The most specific nameable term wins; the main object breaks ties, then the strongest signal.
  const best = [...t.terms].sort(
    (a, b) => b.specificity - a.specificity || Number(b.fromMain) - Number(a.fromMain) || b.value - a.value,
  )[0];

  return { category: winner, confidence, subtype: best?.phrase, mainItem: mainObject?.text, coverage };
};

const leadsWith = (text: string, phrase: string): boolean => {
  const words = tokenize(text);
  return tokenize(phrase).every((w, i) => words[i] === w);
};

/** Does this web entity or Google's guess name `brand` as the maker? */
const webNamesBrand = (text: string, brand: string): boolean =>
  WORD_BRANDS.has(brand) ? leadsWith(text, brand) && !matchCategoryTerm(text) : containsPhrase(text, brand, false);

interface BrandHit {
  name: string;
  /** Named in the text read off the item. */
  fromText: boolean;
  /** Named by a web entity or Google's best guess. */
  fromWeb: boolean;
}

/** The brand named in the text read off the photo or in web text, preferring the longest name found. */
const findBrand = (ocrText: string, webTexts: string[]): BrandHit | undefined => {
  // "Made in Jordan" on a care label is where it was sewn, not who made it.
  const ocr = ocrText.replace(/\bmade\s+in\s+[a-z]+/gi, ' ');
  let best: { brand: string; fromText: boolean; fromWeb: boolean } | undefined;
  for (const brand of BRAND_NAMES) {
    const fromText = containsPhrase(ocr, brand, false);
    const fromWeb = webTexts.some(t => webNamesBrand(t, brand));
    if ((fromText || fromWeb) && (!best || brand.length > best.brand.length)) best = { brand, fromText, fromWeb };
  }
  if (!best) return undefined;
  const name = best.brand
    .split(' ')
    .map(w => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
  return { name, fromText: best.fromText, fromWeb: best.fromWeb };
};

const pickMaterial = (text: string, names: readonly string[] = MATERIAL_NAMES): string | undefined => {
  const found = names
    .filter(m => containsPhrase(text, m))
    .map(m => ({ m, at: text.toLowerCase().indexOf(m) }))
    .sort((a, b) => a.at - b.at || b.m.length - a.m.length);
  if (found.length === 0) return undefined;
  const first = found[0].m;
  const specific = found.find(f => SPECIFIC_MATERIALS.has(f.m) && familyOf(f.m) === familyOf(first));
  return specific ? specific.m : first;
};

/** The material named by the strongest label, naming the specific kind ("suede") over its family ("leather"). */
const readMaterial = (labels: Scored[], web: Scored[], bestGuess?: string): { material: string; confidence: number } | undefined => {
  const hits: Array<{ material: string; strength: number }> = [];
  for (const l of labels) {
    for (const m of MATERIAL_NAMES) if (containsPhrase(l.text, m)) hits.push({ material: m, strength: l.score });
  }
  const best = hits.sort((a, b) => b.strength - a.strength)[0];
  if (best) {
    const family = familyOf(best.material);
    const specific = hits.find(h => SPECIFIC_MATERIALS.has(h.material) && familyOf(h.material) === family);
    return {
      material: specific ? specific.material : best.material,
      confidence: Math.min(0.85, 0.45 + 0.45 * best.strength),
    };
  }
  // Web entities and Google's guess know the product, but name materials less reliably.
  const fromWeb = pickMaterial([...web.map(e => e.text), bestGuess ?? ''].join(' '));
  return fromWeb ? { material: fromWeb, confidence: 0.55 } : undefined;
};

const colorWordIn = (texts: string[]): string | undefined => {
  for (const text of texts) {
    const hit = CLOTHING_COLORS.find(c => containsPhrase(text, c.name));
    if (hit) return hit.name;
    if (containsPhrase(text, 'grey')) return 'gray';
  }
  return undefined;
};

/** Read one Google Vision `responses[0]` into what it says about the item. */
export const analyzeVision = (raw: any): VisionAnalysis => {
  const allLabels: Scored[] = list(raw.labelAnnotations)
    .filter((l: any) => typeof l?.description === 'string')
    .map((l: any) => ({ text: l.description, score: num(l.score) }));
  const objects: LocalizedObject[] = list(raw.localizedObjectAnnotations)
    .filter((o: any) => typeof o?.name === 'string')
    .map((o: any) => {
      const rect = boxRect(o.boundingPoly);
      return { text: o.name, score: num(o.score), rect, area: rectArea(rect) };
    });
  const logos: Scored[] = list(raw.logoAnnotations)
    .filter((l: any) => typeof l?.description === 'string')
    .map((l: any) => ({ text: l.description, score: num(l.score, 0.9) }));
  const webDetection = raw.webDetection || {};
  const web: Scored[] = list(webDetection.webEntities)
    .filter((e: any) => typeof e?.description === 'string' && e.description)
    .map((e: any) => ({ text: e.description, score: num(e.score) }));
  const bestGuess: string | undefined = webDetection.bestGuessLabels?.[0]?.label || undefined;
  const textAnnotations: Array<{ description?: string }> = list(raw.textAnnotations);

  // Labels about the room are not labels about the item.
  const labels = allLabels.filter(l => !isSceneLabel(l.text));
  const backgroundLabels = allLabels.filter(l => isSceneLabel(l.text)).map(l => l.text).slice(0, 5);

  const result: RecognitionResult = {
    confidence: {},
    rawLabels: labels.map(l => l.text),
    bestGuess,
    webEntities: web.slice(0, 8).map(e => e.text),
  };

  // ── Category + subtype ──
  const read = readCategory(labels, objects, web, bestGuess);
  if (read.category) {
    result.category = read.category;
    result.confidence.category = read.confidence;
    if (read.subtype) result.subtype = read.subtype;
  }

  // ── Brand: a detected logo is the strongest signal, then text/web/guess ──
  if (logos.length > 0) {
    result.brand = logos[0].text;
    result.confidence.brand = Math.min(0.98, logos[0].score);
  } else {
    // Web entities are where Vision surfaces brand names for objects without a visible logo
    // (e.g. Bottega's intrecciato weave -> webEntity "Bottega Veneta").
    const found = findBrand(
      textAnnotations.map(t => t.description ?? '').join(' '),
      [...web.map(e => e.text), bestGuess ?? ''],
    );
    if (found) {
      result.brand = found.name;
      // Web entities know the *product*, and text on the item corroborates them. A web entity alone
      // stays under the 0.85 bar so the model, which sees the item, can correct it.
      result.confidence.brand = found.fromWeb ? (found.fromText ? 0.9 : 0.8) : 0.7;
    }
  }

  // ── Pattern, material, occasion ──
  const itemText = [...labels.map(l => l.text), ...objects.map(o => o.text), ...web.map(e => e.text), bestGuess ?? ''];
  const joined = itemText.join(' ');
  for (const [keyword, pattern] of Object.entries(PATTERN_KEYWORDS)) {
    if (containsPhrase(joined, keyword)) {
      result.pattern = pattern;
      result.confidence.pattern = 0.7;
      break;
    }
  }
  if (!result.pattern) {
    result.pattern = 'solid';
    result.confidence.pattern = 0.5;
  }

  const material = readMaterial(labels, web, bestGuess);
  if (material) {
    result.material = material.material;
    result.confidence.material = material.confidence;
  }

  for (const [occasion, keywords] of Object.entries(OCCASION_MAP)) {
    if (keywords.some(kw => containsPhrase(joined, kw))) {
      result.occasion = occasion;
      result.confidence.occasion = 0.65;
      break;
    }
  }

  const woodSurface = allLabels.some(l => l.score >= SURFACE_MIN_SCORE && isSurfaceLabel(l.text));
  return {
    result,
    pixels: readPixelColors(raw.imagePropertiesAnnotation),
    scene: { woodSurface, coverage: read.coverage, hasSubject: objects.length > 0 },
    mainItem: read.mainItem,
    backgroundLabels,
    ocrText: textAnnotations[0]?.description || '',
    // With a floor in the frame, a "Red" or "Brown" label is as likely the floor as the item.
    labelColor: woodSurface ? undefined : colorWordIn(labels.map(l => l.text)),
  };
};

// The proxy's prompt asks for the same item, categories and colours (supabase/functions/ai-proxy). These
// hints, appended to it as "Hints from Google Vision", repeat that so an older deployment answers alike.
const FOCUS =
  'Describe ONLY the single main garment or accessory (mainItem when given: the largest one in the photo). ' +
  'Ignore floors, walls, furniture, hands, people, mannequins and every other item in the frame. ' +
  'category must be exactly one of allowedCategories (boots, sneakers, heels and flats are shoes; ' +
  'handbags, totes and backpacks are bags). colors lists the item\'s own colours, most prominent first, ' +
  'at most 3, each exactly one of allowedColors; never the colour of the background or floor.';

const ALLOWED_COLORS = [...CLOTHING_COLORS.map(c => c.name), MULTICOLOR];

/**
 * Facts for the vision model's prompt: which item Vision found and which labels are
 * only the room, so it describes the boots and not the floor or the flats beside
 * them, and the vocabulary its answer must use. Kept small: the server rejects over
 * 4000 chars.
 */
export const buildVisionContext = (vision: VisionAnalysis | null): Record<string, unknown> => {
  const clip = (s: string) => s.slice(0, 40);
  const ctx: Record<string, unknown> = { focus: FOCUS };
  if (vision?.mainItem) ctx.mainItem = clip(vision.mainItem);
  const labels = (vision?.result.rawLabels ?? []).slice(0, 8).map(clip);
  if (labels.length) ctx.labels = labels;
  if (vision?.backgroundLabels.length) ctx.background = vision.backgroundLabels.map(clip);
  if (vision?.result.bestGuess) ctx.bestGuess = clip(vision.result.bestGuess);
  ctx.allowedCategories = CLOTHING_CATEGORIES;
  ctx.allowedColors = ALLOWED_COLORS;
  return ctx;
};

// ─── The vision model's answer ───────────────────────────────────────────────

export interface AiAnswer {
  category?: ClothingCategory;
  subtype?: string;
  brand?: string;
  /** Palette names or MULTICOLOR, most prominent first. */
  colors: string[];
  pattern?: PatternType;
  material?: string;
  season?: string[];
  occasion?: string;
  style?: string[];
  gender?: string;
  description?: string;
  confidence: number;
}

/** Parse the model's message content: JSON text, JSON wrapped in prose or a code fence, or an object already. */
export const parseAiContent = (content: unknown): unknown => {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    const braces = /\{[\s\S]*\}/.exec(content);
    if (!braces) return null;
    try {
      return JSON.parse(braces[0]);
    } catch {
      return null;
    }
  }
};

const cleanString = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/\s+/g, ' ');
  return s && s.length <= max ? s : undefined;
};

const cleanSubtype = (v: unknown): string | undefined => {
  const s = cleanString(v, 40)?.toLowerCase();
  if (!s || /[^a-z0-9 '&/-]/.test(s)) return undefined;
  const words = s.split(' ');
  return words.length <= 4 ? s : undefined;
};

const cleanMaterial = (v: unknown): string | undefined => {
  const s = cleanString(v, 60);
  return s ? pickMaterial(s, MODEL_MATERIALS) : undefined;
};

/** One of our eleven categories, including the obvious synonyms a model reaches for ("footwear", "handbag"). */
const cleanCategory = (v: unknown): ClothingCategory | undefined => {
  const s = cleanString(v, 24)?.toLowerCase();
  if (!s) return undefined;
  return isClothingCategory(s) ? s : categoryFromText(s);
};

const cleanPattern = (v: unknown): PatternType | undefined => {
  const s = cleanString(v, 30)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return undefined;
  if (PATTERN_TYPES.has(s)) return s as PatternType;
  return PATTERN_ALIASES[s] ?? 'other';
};

const cleanGender = (v: unknown): string | undefined => {
  const s = cleanString(v, 20)?.toLowerCase();
  if (s === 'men' || s === 'male' || s === 'mens') return 'men';
  if (s === 'women' || s === 'female' || s === 'womens') return 'women';
  if (s === 'unisex') return 'unisex';
  return undefined;
};

const cleanSeasons = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const wholeYear = v.some(
    s => typeof s === 'string' && /^(all|all[- ]seasons?|year[- ]round)$/i.test(s.trim()),
  );
  if (wholeYear) return [...SEASONS];
  const seasons = Array.from(new Set(v.map(normalizeSeason).filter((s): s is NonNullable<typeof s> => !!s)));
  return seasons.length ? seasons : undefined;
};

/**
 * Validate and normalise the model's JSON into values the form can take:
 * a category outside our eleven becomes the one it names, or is dropped (labels
 * decide); a colour becomes the nearest clothing colour name; anything
 * unrecognisable is dropped.
 */
export const normalizeAiAnswer = (raw: unknown): AiAnswer | null => {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, any>;

  let confidence = typeof g.confidence === 'number' && Number.isFinite(g.confidence) ? g.confidence : 0.8;
  if (confidence > 1 && confidence <= 100) confidence /= 100;
  confidence = Math.max(0, Math.min(1, confidence));

  const subtype = cleanSubtype(g.subcategory ?? g.subtype);
  const category = refineCategory(cleanCategory(g.category), subtype);

  const colorList: unknown[] = Array.isArray(g.colors) ? g.colors : [g.colors ?? g.color ?? g.dominantColor];
  const colors = Array.from(
    new Set(colorList.map(normalizeColorName).filter((c): c is string => !!c)),
  ).slice(0, 3);

  const brand = cleanString(g.brand, 40);
  const style = Array.isArray(g.style)
    ? Array.from(
        new Set(
          g.style
            .map((s: unknown) => cleanString(s, 24)?.toLowerCase())
            .filter((s: string | undefined): s is string => !!s && /^[a-z0-9 '&/-]+$/.test(s)),
        ),
      ).slice(0, 3) as string[]
    : undefined;

  const answer: AiAnswer = {
    category,
    subtype,
    brand: brand && !MODEL_BRAND_NONE.test(brand) && /[a-z]/i.test(brand) ? brand : undefined,
    colors,
    pattern: cleanPattern(g.pattern),
    material: cleanMaterial(g.material),
    season: cleanSeasons(g.season),
    occasion: normalizeOccasion(g.occasion) ?? undefined,
    style: style && style.length ? style : undefined,
    gender: cleanGender(g.gender),
    description: cleanString(g.description, 300),
    confidence,
  };

  const saidAnything = answer.category || answer.subtype || answer.colors.length || answer.material || answer.brand;
  return saidAnything ? answer : null;
};

// ─── Fusion ──────────────────────────────────────────────────────────────────

const noisyOr = (a: number, b: number): number => 1 - (1 - a) * (1 - b);

const sameBrand = (a: string, b: string): boolean => containsPhrase(a, b, false) || containsPhrase(b, a, false);

/** "tan suede knee-high boots" with colour tan and material suede: the type is "knee-high boots". */
const stripLeadingModifiers = (subtype: string, color?: string, material?: string): string => {
  const words = subtype.split(' ');
  while (words.length > 1 && (words[0] === material || (color && normalizeColorName(words[0]) === color))) {
    words.shift();
  }
  return words.join(' ');
};

/**
 * One result from whatever analyses succeeded. Returns null when neither did.
 */
export const fuseRecognition = (
  vision: VisionAnalysis | null,
  ai: AiAnswer | null,
): RecognitionResult | null => {
  if (!vision && !ai) return null;
  const v = vision?.result;
  const result: RecognitionResult = { confidence: {}, isReal: true };
  const conf = result.confidence;

  if (v) {
    result.rawLabels = v.rawLabels;
    result.bestGuess = v.bestGuess;
    result.webEntities = v.webEntities;
  }

  // ── Category ──
  const vCat = v?.category;
  const vConf = v?.confidence.category ?? 0;
  const aCat = ai?.category;
  const aConf = (ai?.confidence ?? 0) * 0.9;
  if (vCat && aCat) {
    if (vCat === aCat) {
      result.category = aCat;
      conf.category = Math.min(0.95, noisyOr(vConf, aConf));
    } else {
      // The model sees the whole picture and Vision's labels cover the whole scene, so the model
      // wins - except when it only said the catch-all "accessories" and Vision named something specific.
      const visionWins = aCat === 'accessories' && vConf >= 0.7;
      result.category = visionWins ? vCat : aCat;
      conf.category = Math.min(0.6, (visionWins ? vConf : aConf) * 0.7);
    }
  } else if (aCat) {
    result.category = aCat;
    conf.category = aConf;
  } else if (vCat) {
    result.category = vCat;
    conf.category = vConf;
  }

  // ── Colour (the item's, not the room's) ──
  // With no garment found (a dog on the grass) the frame's pixels and colour labels only describe the
  // room, so only a colour the model itself gave can stand.
  const garmentFound = !!result.category;
  const colorResult = resolveItemColors({
    pixels: garmentFound ? vision?.pixels ?? [] : [],
    scene: vision?.scene ?? { woodSurface: false, hasSubject: false },
    aiColors: ai?.colors ?? [],
    aiConfidence: ai?.confidence ?? 0,
  });
  if (colorResult.color) {
    result.color = colorResult.color;
    result.colors = colorResult.colors;
    conf.color = colorResult.confidence;
  } else if (garmentFound && vision?.labelColor) {
    result.color = vision.labelColor;
    result.colors = [{ name: vision.labelColor, hex: hexForColorName(vision.labelColor) ?? '', weight: 0.5 }];
    conf.color = 0.5;
  }

  // ── Material: a specific kind beats its family; otherwise the model, unless Vision is surer ──
  const vMat = v?.material;
  const aMat = ai?.material;
  const aMatConf = (ai?.confidence ?? 0) * 0.8;
  if (vMat && aMat) {
    const vMatConf = v?.confidence.material ?? 0;
    if (vMat === aMat) {
      result.material = vMat;
      conf.material = Math.min(0.95, vMatConf * 1.2);
    } else if (familyOf(vMat) === familyOf(aMat)) {
      result.material = SPECIFIC_MATERIALS.has(aMat) ? aMat : vMat;
      conf.material = Math.max(vMatConf, aMatConf);
    } else if (aMatConf > vMatConf) {
      result.material = aMat;
      conf.material = aMatConf;
    } else {
      result.material = vMat;
      conf.material = vMatConf;
    }
  } else if (aMat) {
    result.material = aMat;
    conf.material = aMatConf;
  } else if (vMat) {
    result.material = vMat;
    conf.material = v?.confidence.material;
  }

  // ── Subtype: the model's description when it fits the category, else Vision's term if that fits ──
  const fits = (s: string) => {
    const c = categoryFromText(s);
    return !c || c === result.category;
  };
  const rawSubtype = [ai?.subtype, v?.subtype].find((s): s is string => !!s && fits(s));
  if (rawSubtype) result.subtype = stripLeadingModifiers(rawSubtype, result.color, result.material);

  // ── Brand: a logo or text on the item (Vision, >= 0.85) wins; otherwise the model fills or corrects ──
  let brand = v?.brand;
  let brandConf = v?.confidence.brand ?? 0;
  const aBrand = ai?.brand;
  if (aBrand) {
    const aiBrandConf = (ai?.confidence ?? 0);
    if (!brand) {
      brand = aBrand;
      brandConf = aiBrandConf * 0.85;
    } else if (sameBrand(brand, aBrand)) {
      // "Bottega" and "Bottega Veneta" are one brand; show the fuller name.
      if (aBrand.length > brand.length) brand = aBrand;
      brandConf = Math.min(0.98, brandConf * 1.1);
    } else if (brandConf < 0.85) {
      brand = aBrand;
      brandConf = Math.max(brandConf, aiBrandConf * 0.8);
    }
  }
  if (brand) {
    result.brand = brand;
    conf.brand = brandConf;
  }

  // ── Pattern: Vision defaults everything to "solid", and its "Graphics" label says little about the
  // item, so neither beats an answer from the model that looked at the item ──
  const aPat = ai?.pattern;
  const aPatConf = (ai?.confidence ?? 0) * 0.85;
  const vPat = v?.pattern;
  const vPatConf = v?.confidence.pattern ?? 0;
  if (aPat && (!vPat || vPat === 'solid' || (vPat === 'graphic' && aPat !== 'graphic'))) {
    result.pattern = aPat;
    conf.pattern = aPatConf;
  } else if (aPat && vPat === aPat) {
    result.pattern = vPat;
    conf.pattern = Math.min(0.95, ((vPatConf + aPatConf) / 2) * 1.15);
  } else if (aPat && aPat !== 'solid' && aPatConf > vPatConf) {
    result.pattern = aPat;
    conf.pattern = aPatConf;
  } else if (vPat) {
    result.pattern = vPat;
    conf.pattern = vPatConf;
  }

  // ── Occasion: the model reads context; Vision's keyword scan only fills gaps ──
  const vOcc = v?.occasion;
  const vOccConf = v?.confidence.occasion ?? 0;
  const aOcc = ai?.occasion;
  if (aOcc && vOcc === aOcc) {
    result.occasion = vOcc;
    conf.occasion = Math.min(0.95, vOccConf * 1.1);
  } else if (aOcc) {
    result.occasion = aOcc;
    conf.occasion = (ai?.confidence ?? 0) * 0.8;
  } else if (vOcc) {
    result.occasion = vOcc;
    conf.occasion = vOccConf;
  }

  if (ai) {
    if (ai.season) result.season = ai.season;
    if (ai.style) result.style = ai.style;
    if (ai.gender) result.gender = ai.gender;
    if (ai.description) result.description = ai.description;
    result.gpt4Enhanced = true;
  }

  return result;
};
