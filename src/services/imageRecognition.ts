/**
 * Image recognition service for clothing analysis.
 *
 * Uses Google Cloud Vision API (LABEL_DETECTION + OBJECT_LOCALIZATION +
 * IMAGE_PROPERTIES + TEXT_DETECTION) when an API key is configured.
 * Falls back to intelligent mock results when no key is available.
 */

import { ClothingCategory } from '../types/clothing';
import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';
import { callAiProxy } from './aiProxy';

// Define pattern types for clothing
export type PatternType = 'solid' | 'striped' | 'plaid' | 'floral' | 'polka_dot' | 'graphic' | 'other';

// Types for the AI image recognition service
export interface DetectedColor {
  name: string;
  /** sRGB hex (e.g. "#8B2131") for UI swatches. */
  hex: string;
  /** 0..1 — fraction of image pixels covered by this color. */
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
  /** Primary color name (e.g. "burgundy") — backwards compat with existing consumers. */
  color?: string;
  /** Top N detected colors ranked by image coverage, with hex + weight. */
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
  /** Raw labels returned by Vision API (empty if mock) */
  rawLabels?: string[];
  /** True when the result came from a real Vision API call, false for mock fallback. */
  isReal?: boolean;
  /** Vision WEB_DETECTION bestGuessLabel — Google's reverse-image-search guess (e.g. "bottega veneta cassette bag"). */
  bestGuess?: string;
  /** Top WEB_DETECTION webEntities, ordered by score. Useful for brand/model inference. */
  webEntities?: string[];
  /** Suitable seasons from GPT-4 Vision semantic analysis. */
  season?: string[];
  /** Style descriptors from GPT-4 Vision (e.g. ["streetwear", "minimalist"]). */
  style?: string[];
  /** Gender targeting from GPT-4 Vision — "men" | "women" | "unisex". */
  gender?: string;
  /** One-sentence natural-language description from GPT-4 Vision. */
  description?: string;
  /** True when GPT-4 Vision enrichment was applied on top of Google Vision. */
  gpt4Enhanced?: boolean;
}

// ─── Category / attribute mapping tables ────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, ClothingCategory> = {
  // Tops
  'shirt': 'tops', 't-shirt': 'tops', 'blouse': 'tops', 'sweater': 'tops',
  'top': 'tops', 'polo': 'tops', 'tank top': 'tops', 'hoodie': 'tops',
  'cardigan': 'tops', 'turtleneck': 'tops', 'crop top': 'tops',
  'sweatshirt': 'tops', 'button-down': 'tops', 'flannel shirt': 'tops',
  'henley': 'tops', 'tunic': 'tops', 'camisole': 'tops', 'bodysuit': 'tops',
  'jersey': 'tops', 'thermal': 'tops',
  // Bottoms
  'pants': 'bottoms', 'jeans': 'bottoms', 'trousers': 'bottoms',
  'shorts': 'bottoms', 'skirt': 'bottoms', 'leggings': 'bottoms', 'chinos': 'bottoms',
  'joggers': 'bottoms', 'sweatpants': 'bottoms', 'cargo pants': 'bottoms',
  'culottes': 'bottoms', 'palazzo': 'bottoms', 'miniskirt': 'bottoms',
  'midi skirt': 'bottoms', 'maxi skirt': 'bottoms', 'bike shorts': 'bottoms',
  // Dresses & one-pieces
  'dress': 'dresses', 'gown': 'dresses', 'jumpsuit': 'dresses', 'romper': 'dresses',
  'maxi dress': 'dresses', 'mini dress': 'dresses', 'wrap dress': 'dresses',
  'sheath dress': 'dresses', 'overalls': 'dresses',
  // Outerwear
  'jacket': 'outerwear', 'coat': 'outerwear', 'blazer': 'outerwear',
  'parka': 'outerwear', 'vest': 'outerwear', 'windbreaker': 'outerwear',
  'puffer jacket': 'outerwear', 'puffer': 'outerwear', 'down jacket': 'outerwear',
  'trench coat': 'outerwear', 'peacoat': 'outerwear', 'overcoat': 'outerwear',
  'raincoat': 'outerwear', 'anorak': 'outerwear', 'fleece jacket': 'outerwear',
  'bomber jacket': 'outerwear', 'denim jacket': 'outerwear', 'leather jacket': 'outerwear',
  // Shoes
  'shoe': 'shoes', 'sneaker': 'shoes', 'boot': 'shoes', 'sandal': 'shoes',
  'heel': 'shoes', 'loafer': 'shoes', 'slipper': 'shoes', 'flat': 'shoes',
  'pump': 'shoes', 'mule': 'shoes', 'derby': 'shoes', 'oxford': 'shoes',
  'platform': 'shoes', 'chelsea boot': 'shoes', 'ankle boot': 'shoes',
  'combat boot': 'shoes', 'stiletto': 'shoes', 'wedge': 'shoes',
  'espadrille': 'shoes', 'clog': 'shoes', 'slides': 'shoes',
  // Accessories
  'hat': 'accessories', 'scarf': 'accessories', 'bag': 'accessories',
  'jewelry': 'accessories', 'watch': 'accessories', 'belt': 'accessories',
  'sunglasses': 'accessories', 'tie': 'accessories', 'purse': 'accessories',
  'backpack': 'accessories', 'necklace': 'accessories', 'bracelet': 'accessories',
  'earring': 'accessories', 'ring': 'accessories',
  'tote': 'accessories', 'tote bag': 'accessories', 'clutch': 'accessories',
  'crossbody': 'accessories', 'crossbody bag': 'accessories', 'wallet': 'accessories',
  'satchel': 'accessories', 'wristlet': 'accessories', 'shoulder bag': 'accessories',
  'baseball cap': 'accessories', 'beanie': 'accessories', 'beret': 'accessories',
  'fedora': 'accessories', 'bucket hat': 'accessories',
  'gloves': 'accessories', 'mittens': 'accessories', 'socks': 'accessories',
  'tie bar': 'accessories', 'bow tie': 'accessories', 'brooch': 'accessories',
  'hair clip': 'accessories', 'headband': 'accessories',
};

// Order matters: multi-word brands BEFORE single-word substrings (e.g. "saint laurent" before "saint"),
// so the longest match wins when scanning labels/text/web entities.
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
  'calvin klein', 'tommy hilfiger', 'ralph lauren', 'polo ralph lauren', 'polo',
  // Outerwear / outdoor
  'north face', 'the north face', 'patagonia', 'columbia', 'under armour',
  'arc\'teryx', 'arcteryx', 'salomon', 'hoka',
  // Streetwear
  'supreme', 'stussy', 'bape', 'kith', 'aimé leon dore', 'aime leon dore',
  'gallery dept', 'rhude', 'pleasures',
  // Athleisure
  'lululemon', 'alo yoga', 'alo', 'gymshark', 'vuori', 'outdoor voices', 'sweaty betty',
  // Emerging / contemporary
  'toteme', 'khaite', 'agolde', 'anine bing', 'staud', 'bite studios',
  'nanushka', 'jacquemus', 'réalisation par', 'realisation par',
  // Fast fashion / accessible
  'abercrombie', 'american eagle', 'hollister', 'anthropologie', 'free people',
  'urban outfitters', 'topshop', 'mango', 'massimo dutti',
];

const COLOR_NAMES = [
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'purple', 'pink',
  'orange', 'brown', 'gray', 'grey', 'navy', 'beige', 'cream', 'tan',
  'maroon', 'olive', 'teal', 'coral', 'burgundy', 'khaki', 'ivory',
  'charcoal', 'camel', 'sage', 'mint', 'lavender', 'mauve',
];

const PATTERN_KEYWORDS: Record<string, PatternType> = {
  'striped': 'striped', 'stripe': 'striped',
  'plaid': 'plaid', 'tartan': 'plaid', 'checkered': 'plaid',
  'floral': 'floral', 'flower': 'floral',
  'polka dot': 'polka_dot', 'dotted': 'polka_dot',
  'graphic': 'graphic', 'print': 'graphic', 'logo': 'graphic',
  'solid': 'solid', 'plain': 'solid',
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

const OCCASION_MAP: Record<string, string[]> = {
  'formal': ['formal', 'tuxedo', 'gown', 'dress shoe', 'suit', 'tie', 'wedding', 'gala', 'black tie'],
  'business': ['business', 'office', 'work', 'professional', 'blazer', 'slacks', 'dress pants'],
  'casual': ['casual', 'everyday', 't-shirt', 'jeans', 'sneaker', 'weekend', 'streetwear', 'loungewear', 'beach'],
  'sports': ['sports', 'athletic', 'workout', 'running', 'gym', 'activewear', 'yoga', 'cycling', 'tennis', 'golf', 'hiking'],
  'party': ['party', 'club', 'evening', 'cocktail', 'sequin', 'glitter', 'going out'],
  'everyday': ['daily', 'errand', 'commute', 'versatile', 'all-day'],
};

// ─── RGB to color name ──────────────────────────────────────────────────────

const rgbToColorName = (r: number, g: number, b: number): string => {
  // ── Neutrals ──
  if (r > 240 && g > 240 && b > 240) return 'white';
  if (r > 220 && g > 210 && b > 190 && Math.abs(r - g) < 20 && r > b) return 'ivory';
  if (r < 25 && g < 25 && b < 25) return 'black';
  if (r < 55 && g < 55 && b < 55) return 'charcoal';
  if (r > 190 && g > 190 && b > 190 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15) return 'gray';

  // ── Red / pink family (r dominant) ──
  if (r > g + 40 && r > b + 40) {
    // Burgundy / maroon: deep dark red with hint of blue/brown
    if (r < 160 && g < 70 && b < 70) return 'burgundy';
    if (r < 190 && g < 80 && b < 80) return 'maroon';
    if (r > 200 && g < 100 && b < 100) return 'red';
    // Wine: rich dark red with purple lean
    if (r < 180 && g < 60 && b > 40 && b < 100) return 'burgundy';
    // Pink
    if (r > 200 && g > 140 && b > 140) return 'pink';
    // Coral / salmon
    if (r > 220 && g > 120 && g < 180 && b < 140) return 'coral';
    // Rust / terracotta: warm brown-red
    if (r > 140 && r < 210 && g > 70 && g < 130 && b < 80) return 'rust';
    return 'red';
  }

  // ── Purple / violet family (r and b dominant over g) ──
  if (r > g + 30 && b > g + 30) {
    if (r > 150 && b > 150) return 'purple';
    if (r < 120 && b < 120) return 'plum';
    if (r > 180 && b > 140 && g < 140) return 'mauve';
    return 'purple';
  }

  // ── Green family (g dominant) ──
  if (g > r + 40 && g > b + 40) {
    if (g > 200 && r < 140) return 'green';
    if (r > 80 && g > 100 && b < 80 && g < 180) return 'olive';
    if (g > 140 && b > 140 && r < 140) return 'teal';
    return 'green';
  }

  // ── Blue family (b dominant) ──
  if (b > r + 40 && b > g + 40) {
    if (b > 180 && r < 100 && g < 160) return 'blue';
    if (b < 130 && r < 60 && g < 80) return 'navy';
    if (b > 200 && g > 140) return 'sky blue';
    return 'blue';
  }

  // ── Yellow / gold / orange (r+g high, b low) ──
  if (r > 180 && g > 140 && b < 100) {
    if (r > 220 && g > 200) return 'yellow';
    if (r > 200 && g > 140 && b < 70) return 'orange';
    if (r > 170 && g > 140 && b < 110) return 'gold';
    return 'mustard';
  }

  // ── Brown / tan / beige (warm earth tones) ──
  if (r > g && g > b && r < 200) {
    // Dark brown
    if (r < 140 && g < 100 && b < 80) return 'brown';
    // Camel / caramel
    if (r > 150 && r < 210 && g > 110 && g < 170 && b < 120) return 'camel';
    // Tan
    if (r > 180 && g > 140 && b > 100 && b < 150) return 'tan';
    // Beige
    if (r > 200 && g > 180 && b > 140) return 'beige';
    return 'brown';
  }

  // ── Champagne / cream (very light warm) ──
  if (r > 220 && g > 210 && b > 180 && r > b) return 'champagne';

  // Nothing matched — pick the dominant channel rather than "multicolor"
  const max = Math.max(r, g, b);
  if (max === r) return 'red';
  if (max === g) return 'green';
  return 'blue';
};

// ─── Process Vision API response ────────────────────────────────────────────

const processVisionResponse = (response: any): RecognitionResult => {
  const labels: Array<{ description: string; score: number }> =
    response.labelAnnotations || [];
  const objects: Array<{ name: string; score: number }> =
    response.localizedObjectAnnotations || [];
  const textAnnotations: Array<{ description: string }> =
    response.textAnnotations || [];
  const imageProperties = response.imagePropertiesAnnotation || {};
  const logos: Array<{ description: string; score: number }> =
    response.logoAnnotations || [];
  const webDetection = response.webDetection || {};
  const webEntities: Array<{ description?: string; score: number }> =
    (webDetection.webEntities || []).filter((e: any) => e.description);
  const bestGuessLabel: string | undefined =
    webDetection.bestGuessLabels?.[0]?.label;

  const allDescriptions = [
    ...labels.map(l => l.description.toLowerCase()),
    ...objects.map(o => o.name.toLowerCase()),
    ...webEntities.map(e => (e.description || '').toLowerCase()),
    ...(bestGuessLabel ? [bestGuessLabel.toLowerCase()] : []),
  ];
  const joined = allDescriptions.join(' ');
  const allText = textAnnotations.map(t => t.description).join(' ').toLowerCase();
  // Brand-search corpus: logos + OCR text + web entities + best-guess label. Web entities
  // are where Vision surfaces specific brand names for objects without visible logos
  // (e.g. Bottega's intrecciato weave → webEntity "Bottega Veneta").
  const brandCorpus = [
    ...logos.map(l => l.description.toLowerCase()),
    allText,
    ...webEntities.map(e => (e.description || '').toLowerCase()),
    bestGuessLabel?.toLowerCase() || '',
  ].join(' ');

  const result: RecognitionResult = {
    confidence: {},
    rawLabels: labels.map(l => l.description),
    bestGuess: bestGuessLabel,
    webEntities: webEntities
      .slice(0, 8)
      .map(e => e.description!)
      .filter(Boolean),
  };

  // ── Brand from logo detection (strongest signal) ──
  if (logos.length > 0) {
    const top = logos[0];
    result.brand = top.description;
    result.confidence.brand = Math.min(0.98, top.score ?? 0.9);
  }

  // ── Category ──
  let bestCatScore = 0;
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    const match = labels.find(l => l.description.toLowerCase().includes(keyword))
      || objects.find(o => o.name.toLowerCase().includes(keyword));
    if (match) {
      const score = 'score' in match ? match.score : 0;
      if (score > bestCatScore) {
        bestCatScore = score;
        result.category = category;
        result.subtype = keyword;
        result.confidence.category = score;
      }
    }
  }

  // ── Brand (from OCR text + web entities + best-guess label) ──
  // Only override the logo-detected brand if we get a stronger multi-word hit.
  if (!result.brand) {
    // BRAND_NAMES is ordered longest-first; first hit wins.
    for (const brand of BRAND_NAMES) {
      if (brandCorpus.includes(brand)) {
        const titled = brand
          .split(' ')
          .map(w => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
          .join(' ');
        result.brand = titled;
        // Higher confidence when the hit came from web entities (Google's reverse
        // image search) vs raw OCR — web entities know about the *product*, not
        // just legible text on it.
        const fromWeb = webEntities.some(e => (e.description || '').toLowerCase().includes(brand));
        const fromGuess = (bestGuessLabel || '').toLowerCase().includes(brand);
        result.confidence.brand = fromWeb || fromGuess ? 0.9 : 0.7;
        break;
      }
    }
  }

  // ── Subtype refinement from best-guess label ──
  // "bottega veneta cassette bag" → keep "bag" as category, surface "cassette bag" as subtype hint.
  if (bestGuessLabel && !result.subtype) {
    result.subtype = bestGuessLabel;
  }

  // ── Prices (from text detection) ──
  const rawText = textAnnotations[0]?.description || '';
  const detectedPrices = extractPrices(rawText);
  if (detectedPrices.length > 0) {
    result.prices = detectedPrices;
  }

  // ── Color (from image properties) ──
  // Extract the top N dominant colors — weighted mix gives accent colors too,
  // which we expose as chips so the user can pick (e.g. "gold hardware" on a
  // burgundy bag). When there's a salient object (the subject is distinct from
  // the background), demote near-neutral background colors so the actual product
  // color isn't shadowed by a studio backdrop.
  const dominantColors = imageProperties.dominantColors?.colors || [];
  if (dominantColors.length > 0) {
    const hasSubject = objects.length > 0; // OBJECT_LOCALIZATION found a foreground thing
    // Saturation in HSL space: ≈ 0 means neutral (white/gray/black), → 1 means vivid.
    const saturation = (r: number, g: number, b: number) => {
      const mx = Math.max(r, g, b) / 255;
      const mn = Math.min(r, g, b) / 255;
      const l = (mx + mn) / 2;
      if (mx === mn) return 0;
      return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
    };

    const sorted = [...dominantColors]
      .filter((c: any) => (c.pixelFraction ?? 0) > 0.02)
      .map((c: any) => {
        const r = c.color?.red ?? 0;
        const g = c.color?.green ?? 0;
        const b = c.color?.blue ?? 0;
        const sat = saturation(r, g, b);
        const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
        // Background suspicion: a near-neutral very-light or very-dark color is
        // usually a studio backdrop, not the product.
        const isBackgroundish =
          hasSubject && sat < 0.08 && (lightness > 0.85 || lightness < 0.15);
        return { c, r, g, b, isBackgroundish };
      })
      .sort((a, b) => {
        // Backgroundish colors get demoted: a colored option with any weight
        // beats a near-neutral background, but only if the colored option is
        // also reasonably weighted.
        const aw = (a.c.pixelFraction ?? a.c.score ?? 0) * (a.isBackgroundish ? 0.3 : 1);
        const bw = (b.c.pixelFraction ?? b.c.score ?? 0) * (b.isBackgroundish ? 0.3 : 1);
        return bw - aw;
      })
      .slice(0, 5);

    const detected: DetectedColor[] = sorted.map(({ c, r, g, b }) => {
      const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return {
        name: rgbToColorName(r, g, b),
        hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
        weight: c.pixelFraction ?? c.score ?? 0,
      };
    });

    // De-dupe by color name (keep highest weight)
    const byName = new Map<string, DetectedColor>();
    for (const d of detected) {
      const existing = byName.get(d.name);
      if (!existing || d.weight > existing.weight) byName.set(d.name, d);
    }
    result.colors = Array.from(byName.values()).sort((a, b) => b.weight - a.weight).slice(0, 4);

    if (result.colors.length > 0) {
      result.color = result.colors[0].name;
      // High confidence — we trust pixel-level color analysis more than label text.
      result.confidence.color = Math.min(0.95, 0.7 + result.colors[0].weight);
    }
  }

  // Fallback: check labels for color names
  if (!result.color) {
    for (const color of COLOR_NAMES) {
      if (joined.includes(color)) {
        result.color = color;
        result.colors = [{ name: color, hex: '', weight: 0.5 }];
        result.confidence.color = 0.65;
        break;
      }
    }
  }

  // ── Pattern ──
  for (const [keyword, pattern] of Object.entries(PATTERN_KEYWORDS)) {
    if (joined.includes(keyword)) {
      result.pattern = pattern;
      result.confidence.pattern = 0.7;
      break;
    }
  }
  if (!result.pattern) {
    result.pattern = 'solid';
    result.confidence.pattern = 0.5;
  }

  // ── Material ──
  for (const material of MATERIAL_NAMES) {
    if (joined.includes(material)) {
      result.material = material;
      result.confidence.material = 0.7;
      break;
    }
  }

  // ── Occasion ──
  for (const [occasion, keywords] of Object.entries(OCCASION_MAP)) {
    for (const kw of keywords) {
      if (joined.includes(kw)) {
        result.occasion = occasion;
        result.confidence.occasion = 0.65;
        break;
      }
    }
    if (result.occasion) break;
  }

  return result;
};

// ─── GPT-4 Vision result fusion ─────────────────────────────────────────────

const VALID_CATEGORIES = new Set<ClothingCategory>([
  'tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories',
]);

/**
 * Merge a GPT-4 Vision structured response into a Google Vision result.
 * Strategy:
 *   - Colors: keep Vision's pixel-level analysis (most accurate)
 *   - Brand: Vision logo detection wins when high-confidence; GPT-4 fills gaps
 *   - Category / subtype / pattern / material / occasion: prefer GPT-4 (semantic)
 *   - Season / style / gender / description: GPT-4 only (Vision can't detect these)
 *   - Confidence: boosted when both models agree
 */
const mergeGPT4Result = (
  vision: RecognitionResult,
  gpt4: any,
): RecognitionResult => {
  const merged: RecognitionResult = { ...vision };
  const g = gpt4 || {};
  const gConf: number = typeof g.confidence === 'number' ? g.confidence : 0.8;

  // Category
  if (g.category && VALID_CATEGORIES.has(g.category as ClothingCategory)) {
    const vCat = merged.confidence.category || 0;
    if (!merged.category || vCat < 0.6) {
      merged.category = g.category as ClothingCategory;
      merged.confidence.category = gConf * 0.9;
    } else if (merged.category === g.category) {
      // Agreement → boost
      merged.confidence.category = Math.min(0.98, (vCat + gConf) / 2 * 1.15);
    }
  }

  // Subcategory — prefer whichever is more specific (longer)
  if (g.subcategory) {
    const vSub = merged.subtype || '';
    const gSub = String(g.subcategory);
    if (!vSub || gSub.length > vSub.length) merged.subtype = gSub;
  }

  // Brand — logo detection (Vision) wins at ≥ 0.85; otherwise GPT-4 fills
  if (!merged.brand && g.brand && g.brand !== 'null') {
    merged.brand = String(g.brand);
    merged.confidence.brand = gConf * 0.85;
  } else if (merged.brand && g.brand &&
    merged.brand.toLowerCase() === String(g.brand).toLowerCase()) {
    merged.confidence.brand = Math.min(0.98, (merged.confidence.brand || 0) * 1.1);
  } else if (merged.brand && (merged.confidence.brand || 0) < 0.85 &&
    g.brand && g.brand !== 'null') {
    merged.brand = String(g.brand);
    merged.confidence.brand = Math.max(merged.confidence.brand || 0, gConf * 0.8);
  }

  // Colors — Vision's pixel-level analysis stays primary
  if ((!merged.colors || merged.colors.length === 0) && Array.isArray(g.colors) && g.colors.length) {
    merged.colors = (g.colors as string[]).map((name: string, i: number) => ({
      name: name.toLowerCase(),
      hex: '',
      weight: Math.max(0.1, 0.7 - i * 0.2),
    }));
    merged.color = merged.colors[0].name;
    merged.confidence.color = gConf * 0.75;
  }

  // Pattern — prefer non-solid over solid; boost when both agree.
  // Vision's keyword scan defaults everything to "solid" at 0.5 confidence,
  // so we shouldn't let that stale default beat GPT-4's specific detection.
  if (g.pattern) {
    const gPat = g.pattern as PatternType;
    const vPat = merged.pattern;
    const vConf = merged.confidence.pattern || 0;
    const gPConf = gConf * 0.85;

    if (!vPat || vPat === 'solid') {
      // Vision defaulted → always take GPT-4
      merged.pattern = gPat;
      merged.confidence.pattern = gPConf;
    } else if (vPat === gPat) {
      // Agreement → boost
      merged.confidence.pattern = Math.min(0.95, (vConf + gPConf) / 2 * 1.15);
    } else if (gPat !== 'solid' && gPConf > vConf) {
      // GPT-4 sees a specific pattern and is more confident → trust it
      merged.pattern = gPat;
      merged.confidence.pattern = gPConf;
    }
    // else: Vision found a specific non-solid pattern at higher confidence → keep it
  }

  // Material — GPT-4 infers from texture; Vision gets it from text/labels
  if (g.material) {
    if (!merged.material) {
      merged.material = String(g.material).toLowerCase();
      merged.confidence.material = gConf * 0.8;
    } else if (String(g.material).toLowerCase() === merged.material.toLowerCase()) {
      merged.confidence.material = Math.min(0.95, (merged.confidence.material || 0) * 1.2);
    } else if (gConf * 0.8 > (merged.confidence.material || 0)) {
      // GPT-4 has higher confidence on a different material → trust it
      merged.material = String(g.material).toLowerCase();
      merged.confidence.material = gConf * 0.8;
    }
  }

  // Occasion — GPT-4 semantic understanding is more reliable than Vision's
  // keyword-in-label scan, so let it override low-confidence Vision results.
  if (g.occasion) {
    const vOccConf = merged.confidence.occasion || 0;
    if (!merged.occasion || vOccConf < 0.6) {
      merged.occasion = String(g.occasion);
      merged.confidence.occasion = gConf * 0.8;
    } else if (merged.occasion === g.occasion) {
      merged.confidence.occasion = Math.min(0.95, vOccConf * 1.1);
    }
  }

  // GPT-4-only semantic fields
  if (Array.isArray(g.season) && g.season.length) merged.season = g.season as string[];
  if (Array.isArray(g.style) && g.style.length) merged.style = g.style as string[];
  if (g.gender) merged.gender = String(g.gender);
  if (g.description) merged.description = String(g.description);

  merged.gpt4Enhanced = true;
  return merged;
};

/**
 * Construct a RecognitionResult directly from a GPT-4 Vision response, used
 * when Google Vision fails entirely but GPT-4 succeeds.
 */
const convertGPT4ToResult = (gpt4: any): RecognitionResult => {
  const g = gpt4 || {};
  const gConf: number = typeof g.confidence === 'number' ? g.confidence : 0.7;
  const result: RecognitionResult = { confidence: {}, isReal: true, gpt4Enhanced: true };

  if (g.category && VALID_CATEGORIES.has(g.category as ClothingCategory)) {
    result.category = g.category as ClothingCategory;
    result.confidence.category = gConf * 0.9;
  }
  if (g.subcategory) result.subtype = String(g.subcategory);
  if (g.brand && g.brand !== 'null') {
    result.brand = String(g.brand);
    result.confidence.brand = gConf * 0.8;
  }
  if (Array.isArray(g.colors) && g.colors.length) {
    result.colors = (g.colors as string[]).map((name: string, i: number) => ({
      name: name.toLowerCase(),
      hex: '',
      weight: Math.max(0.1, 0.7 - i * 0.2),
    }));
    result.color = result.colors[0].name;
    result.confidence.color = gConf * 0.75;
  }
  if (g.pattern) { result.pattern = g.pattern as PatternType; result.confidence.pattern = gConf * 0.85; }
  if (g.material) { result.material = String(g.material).toLowerCase(); result.confidence.material = gConf * 0.8; }
  if (g.occasion) { result.occasion = String(g.occasion); result.confidence.occasion = gConf * 0.8; }
  if (Array.isArray(g.season)) result.season = g.season as string[];
  if (Array.isArray(g.style)) result.style = g.style as string[];
  if (g.gender) result.gender = String(g.gender);
  if (g.description) result.description = String(g.description);

  return result;
};

// ─── Main analysis function ─────────────────────────────────────────────────

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

      // Run Google Vision and GPT-4 Vision in parallel — Vision is fast for
      // pixel-level data (colors, logos, text); GPT-4 adds semantic understanding
      // (season, style, nuanced subtype, better material inference).
      const [visionSettled, gpt4Settled] = await Promise.allSettled([
        callAiProxy<any>('vision', {
          requests: [{
            image: { content: base64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 30 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 15 },
              { type: 'TEXT_DETECTION' },
              { type: 'IMAGE_PROPERTIES' },
              { type: 'LOGO_DETECTION', maxResults: 5 },
              { type: 'WEB_DETECTION', maxResults: 20 },
              { type: 'CROP_HINTS' },
            ],
          }],
        }),
        callAiProxy<any>('openai-vision', { imageBase64: base64 }),
      ]);

      // Process Google Vision result
      let visionResult: RecognitionResult | null = null;
      if (visionSettled.status === 'fulfilled') {
        const raw = visionSettled.value?.responses?.[0];
        if (raw && !raw.error) {
          const labelCount = (raw.labelAnnotations || []).length;
          const objCount = (raw.localizedObjectAnnotations || []).length;
          console.log('[Vision] got', labelCount, 'labels,', objCount, 'objects');
          console.log('[Vision] top labels:', (raw.labelAnnotations || [])
            .slice(0, 5).map((l: any) => `${l.description}(${l.score?.toFixed(2)})`).join(', '));
          visionResult = processVisionResponse(raw);
          visionResult.isReal = true;
        } else {
          console.warn('[Vision] response error:', JSON.stringify(raw?.error));
        }
      } else {
        console.warn('[Vision] proxy error:', (visionSettled as PromiseRejectedResult).reason?.message);
      }

      // Parse GPT-4 Vision result
      let gpt4Data: any = null;
      if (gpt4Settled.status === 'fulfilled') {
        try {
          const content = gpt4Settled.value?.choices?.[0]?.message?.content;
          gpt4Data = typeof content === 'string' ? JSON.parse(content) : content;
          console.log('[GPT-4 Vision] category:', gpt4Data?.category,
            'material:', gpt4Data?.material, 'season:', gpt4Data?.season,
            'confidence:', gpt4Data?.confidence);
        } catch (parseErr) {
          console.warn('[GPT-4 Vision] JSON parse error:', parseErr);
        }
      } else {
        console.warn('[GPT-4 Vision] error:', (gpt4Settled as PromiseRejectedResult).reason?.message);
      }

      // Merge results — Vision base + GPT-4 semantic enrichment
      if (visionResult && gpt4Data) {
        const merged = mergeGPT4Result(visionResult, gpt4Data);
        console.log('[Vision] merged:', JSON.stringify({
          category: merged.category, subtype: merged.subtype,
          brand: merged.brand, color: merged.color,
          season: merged.season, style: merged.style,
          gpt4Enhanced: merged.gpt4Enhanced,
        }));
        return merged;
      }
      if (visionResult) {
        console.log('[Vision] GPT-4 unavailable, returning Vision-only result');
        return visionResult;
      }
      if (gpt4Data) {
        console.log('[Vision] Google Vision unavailable, returning GPT-4-only result');
        return convertGPT4ToResult(gpt4Data);
      }

      return getMockRecognitionResult(imageUri);
    }

    // ── Mock fallback (proxy not configured) ──
    console.warn('[Vision] SKIPPED — SUPABASE_URL not configured. Check .env and rebuild.');
    await new Promise(resolve => setTimeout(resolve, 300));
    return getMockRecognitionResult(imageUri);
  } catch (error: any) {
    console.error('[Vision] Exception in analyze:', error?.message || error);
    return getMockRecognitionResult(imageUri);
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

const getMockRecognitionResult = (imageUri: string): RecognitionResult => {
  const seed = imageUri.split('/').pop() || '';
  const seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Pair each category with a representative subtype keyword
  const categoryPicks: Array<{ category: ClothingCategory; subtype: string }> = [
    { category: 'tops', subtype: 'shirt' },
    { category: 'bottoms', subtype: 'jeans' },
    { category: 'dresses', subtype: 'dress' },
    { category: 'outerwear', subtype: 'jacket' },
    { category: 'shoes', subtype: 'sneaker' },
    { category: 'accessories', subtype: 'handbag' },
  ];
  const pick = categoryPicks[seedNum % categoryPicks.length];
  const brands = ['Nike', 'Adidas', 'Zara', 'H&M', 'Uniqlo', "Levi's", 'Gap', 'Gucci', 'Everlane', undefined];
  const occasions = ['casual', 'formal', 'business', 'sports', 'party', 'everyday'];
  const colors = ['black', 'white', 'red', 'blue', 'green', 'navy', 'beige', 'brown', 'gray', 'pink', 'olive'];
  const patterns: PatternType[] = ['solid', 'solid', 'solid', 'striped', 'plaid', 'floral', 'graphic'];
  const materials = ['cotton', 'wool', 'polyester', 'leather', 'denim', 'silk', 'linen'];

  // Mock fallback — returns empty result so we don't invent wrong values that
  // contradict the actual photo. The caller (AddClothingScreen) checks
  // `isReal` before auto-filling any field; mock results never autofill.
  return {
    confidence: {},
    isReal: false,
  };
};

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

/**
 * Looser threshold for auto-filling an EMPTY field — we'd rather pre-fill a
 * reasonable guess than leave the form blank. The user can always override.
 */
export const shouldAutofillPrediction = (
  result: RecognitionResult,
  field: 'category' | 'brand' | 'occasion' | 'color' | 'pattern' | 'material',
): boolean => {
  const threshold: Record<string, number> = {
    category: 0.35,
    brand: 0.5,
    occasion: 0.4,
    color: 0.4,
    pattern: 0.4,
    material: 0.4,
  };
  return !!result.confidence[field] && (result.confidence[field] as number) >= threshold[field];
};

/**
 * Generate a default item name from the recognition result, e.g.
 *   { color: 'burgundy', subtype: 'handbag' } → "Burgundy Handbag"
 *   { brand: 'Gucci', color: 'black', subtype: 'jacket' } → "Gucci Black Jacket"
 * Falls back to a generic category label if no subtype/color is available.
 */
export const generateNameFromRecognition = (result: RecognitionResult): string => {
  // Title-case a string, preserving existing uppercase runs (e.g. "APC", "H&M").
  const titleCase = (s: string) =>
    s.replace(/\b\w/g, c => c.toUpperCase());

  const parts: string[] = [];

  if (result.brand) parts.push(result.brand);
  if (result.color) parts.push(titleCase(result.color));

  // Only inject the pattern word when the subtype doesn't already mention it —
  // GPT-4's subtypes like "striped cotton shirt" already embed the pattern.
  const subtypeLower = (result.subtype || '').toLowerCase();
  if (result.pattern && result.pattern !== 'solid') {
    const patternWord = result.pattern.replace('_', ' ');
    if (!subtypeLower.includes(patternWord)) {
      parts.push(titleCase(patternWord));
    }
  }

  const categoryNouns: Record<ClothingCategory, string> = {
    tops: 'Top', bottoms: 'Bottoms', dresses: 'Dress',
    outerwear: 'Outerwear', shoes: 'Shoes', accessories: 'Accessory',
  } as any;

  if (result.subtype) {
    parts.push(titleCase(result.subtype));
  } else if (result.category && categoryNouns[result.category]) {
    parts.push(categoryNouns[result.category]);
  }

  return parts.join(' ').trim();
};
