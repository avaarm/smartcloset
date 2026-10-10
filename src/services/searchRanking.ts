/**
 * searchRanking — the pure part of product search: building the web query,
 * deciding which results are real, relevant products, and putting them in
 * order (shops first, second-hand last).
 *
 * No network or React in here, so every rule is unit-tested directly.
 * lensSearchService runs the searches and feeds the results through these.
 */

import type { ClothingCategory } from '../types/clothing';
import {
  RESALE_QUERY_EXCLUSIONS,
  hostnameOf,
  isKidsOnlyHost,
  registrableDomain,
  sourceKindOf,
  sourceTier,
  type SourceKind,
} from './retailerDomains';

// ─── Text helpers ───────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y',
};

const stripAccents = (s: string): string => s.replace(/[à-ÿ]/g, c => ACCENTS[c] ?? c);

/** Crude singular form, applied to both sides of a comparison so "boots" matches "boot". */
const singular = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(?:ch|sh|x|s|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** Lower-case words with accents, apostrophes, punctuation and plurals removed. */
export const tokenize = (text: string): string[] =>
  stripAccents(text.toLowerCase())
    .replace(/&/g, ' and ')
    .replace(/['’`]s\b/g, '')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);

/** `text` with hyphens and slashes as spaces and apostrophes gone, for matching whole phrases. */
const phraseText = (text: string): string =>
  stripAccents(text.toLowerCase()).replace(/['’`]/g, '').replace(/[-–—_/]+/g, ' ');

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ',
};

const clipAtWord = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
};

const compactLower = (s: string): string => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]/g, '');

/**
 * A result title as a person would write it: entities decoded, gallery counters
 * ("Picture 4 of 6") and the trailing "| eBay" / "- Zara United States" site
 * name removed. The title becomes the wardrobe item's name, so it has to read well.
 */
export const cleanResultTitle = (title: string, source: string, max = 80): string => {
  const original = title.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, m => ENTITIES[m]).trim();
  const withoutCounter = original
    .replace(/[\s\-–—|,:·•]*\(?\b(?:picture|image|photo|pic)\s+\d+\s+of\s+\d+\b\)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = compactLower(registrableDomain(source)?.name ?? '');
  const parts = withoutCounter.split(/\s+[|\-–—·•]\s+/);
  while (parts.length > 1 && name.length >= 3 && compactLower(parts[parts.length - 1]).includes(name)) {
    parts.pop();
  }
  const cleaned = parts.join(' - ').trim();
  return clipAtWord(cleaned || original || source, max);
};

/** The words that identify a product, for spotting the same product listed twice. */
export const normalizeTitle = (title: string, source = ''): string =>
  tokenize(cleanResultTitle(title, source, 200)).join(' ');

// ─── Adult or children's listings ───────────────────────────────────────────

export type Audience = 'adult' | 'kids';

// Applied to phraseText(), so apostrophes are already gone ("children's" -> "childrens").
// "kid suede" and "kid leather" are materials, not a child's boot.
const KIDS_WORDS =
  /\b(?:kids|kid(?! ?(?:suede|leather|skin|gloves?|mohair|calf))|child|childs|childrens?|children|toddlers?|babies|infants?|newborns?|boys?|girls?|youth|preschool|tweens?|(?:little|big) (?:boys?|girls?|kids?)|baby(?! ?(?:blue|pink|doll|soft|yellow|alpaca|phat|lock))|\d{1,2}t|\d{1,2} ?(?:months?|mos))\b/;
const ADULT_WORDS = /\b(?:womens?|mens?|ladies|lady|adults?)\b/;
const KIDS_PATH_SEGMENT =
  /(?:^|[-_])(?:kids|kid(?![-_]?(?:suede|leather|skin|glove|mohair|calf))|child|childs|childrens?|children|toddlers?|babies|infants?|newborns?|boys?|girls?|youth|tweens?)(?:[-_]|$)|(?:^|[-_])baby(?![-_]?(?:blue|pink|doll|soft|yellow|alpaca))(?:[-_]|$)/;

/** True when the text names children's clothing ("toddler boys' boot", "size 2T"). */
export const hasKidsWords = (text: string): boolean => KIDS_WORDS.test(phraseText(text));

const hasAdultWords = (text: string): boolean => ADULT_WORDS.test(phraseText(text));

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
};

const hasKidsPath = (url: string): boolean =>
  pathOf(url).split('/').some(seg => KIDS_PATH_SEGMENT.test(seg));

type Listing = { title: string; source: string; url: string };

const isKidsListing = (r: Listing): boolean => {
  if (hasKidsWords(r.title) || hasKidsPath(r.url)) return true;
  const host = hostnameOf(r.url) || r.source;
  return isKidsOnlyHost(host) || /^(?:kids|baby|boys|girls)\./.test(host);
};

const isAdultListing = (r: Listing): boolean =>
  hasAdultWords(r.title) || pathOf(r.url).split('/').some(seg => /^(?:women|womens|men|mens|ladies)$/.test(seg));

// ─── Product types ──────────────────────────────────────────────────────────

export type Family =
  | 'boots' | 'sneakers' | 'sandals' | 'heels' | 'flats'
  | 'bags'
  | 'necklaces' | 'earrings' | 'rings' | 'bracelets' | 'watches'
  | 'hats'
  | 'tops' | 'knitwear' | 'pants' | 'shorts' | 'skirts' | 'dresses' | 'outerwear' | 'swimwear'
  | 'belts' | 'scarves' | 'gloves' | 'sunglasses' | 'wallets';

type FamilyDef = { family: Family; category: ClothingCategory; re: RegExp };

// Matched against phraseText(): lower-case, hyphens as spaces, no apostrophes.
const FAMILIES: FamilyDef[] = [
  { family: 'boots', category: 'shoes', re: /\b(?:boots?|booties|bootie|chelsea|wellingtons?|wellies)\b/g },
  { family: 'sneakers', category: 'shoes', re: /\b(?:sneakers?|trainers?|runners?|running shoes?|tennis shoes?|kicks)\b/g },
  { family: 'sandals', category: 'shoes', re: /\b(?:sandals?|slides?|flip ?flops?|espadrilles?|clogs?|mules?|slippers?)\b/g },
  { family: 'heels', category: 'shoes', re: /\b(?:pumps?|stilettos?|heels?|wedges?)\b/g },
  { family: 'flats', category: 'shoes', re: /\b(?:flats|ballet|ballerinas?|loafers?|moccasins?|oxfords?|derbys?|brogues?|slingbacks?|mary janes?)\b/g },
  { family: 'bags', category: 'bags', re: /\b(?:bags?|handbags?|purses?|totes?|clutch(?:es)?|satchels?|crossbody|backpacks?|rucksacks?|shoppers?|hobos?|pouch(?:es)?|duffel|duffle|messenger|baguette|minaudiere)\b/g },
  { family: 'necklaces', category: 'jewelry', re: /\b(?:necklaces?|pendants?|chokers?)\b/g },
  { family: 'earrings', category: 'jewelry', re: /\b(?:earrings?|studs?|hoops?|huggies)\b/g },
  { family: 'rings', category: 'jewelry', re: /\brings?\b/g },
  { family: 'bracelets', category: 'jewelry', re: /\b(?:bracelets?|bangles?|cuffs?)\b/g },
  { family: 'watches', category: 'jewelry', re: /\bwatch(?:es)?\b/g },
  { family: 'hats', category: 'hats', re: /\b(?:hats?|caps?(?! ?(?:toe|sleeves?))|beanies?|berets?|fedoras?|visors?|bonnets?)\b/g },
  { family: 'tops', category: 'tops', re: /\b(?:t ?shirts?|tees?|shirts?|blouses?|tops|(?:crop|halter|tube|knit|peplum|bandeau|tank) top|tanks?|camis?|camisoles?|bodysuits?|henley|polos?|tunics?|bralettes?|corsets?)\b/g },
  { family: 'knitwear', category: 'tops', re: /\b(?:sweaters?|cardigans?|jumpers?|pullovers?|hoodies?|sweatshirts?|turtlenecks?|knitwear|fleece)\b/g },
  { family: 'pants', category: 'bottoms', re: /\b(?:pants|trousers?|jeans|chinos?|joggers?|sweatpants|slacks|culottes?|cargos?|leggings?|jeggings?|palazzos?|capris?)\b/g },
  { family: 'shorts', category: 'bottoms', re: /\bshorts\b/g },
  { family: 'skirts', category: 'bottoms', re: /\b(?:skirts?|skorts?)\b/g },
  { family: 'dresses', category: 'dresses', re: /\b(?:dress(?:es)?(?! ?(?:shoes?|boots?|pants?|shirts?|socks?|sandals?|belts?|watch|code))|gowns?|jumpsuits?|rompers?|playsuits?|sundress(?:es)?|minidress(?:es)?)\b/g },
  { family: 'outerwear', category: 'outerwear', re: /\b(?:coats?|jackets?|blazers?|parkas?|trench(?:es)?|puffers?|gilets?|vests?|capes?|ponchos?|bombers?|anoraks?|windbreakers?|overcoats?|peacoats?|shackets?|kimonos?|cloaks?)\b/g },
  { family: 'swimwear', category: 'swimwear', re: /\b(?:bikinis?|swimsuits?|swimwear|swim trunks|bathing suits?|tankinis?)\b/g },
  { family: 'belts', category: 'accessories', re: /\bbelts?\b/g },
  { family: 'scarves', category: 'accessories', re: /\b(?:scarf|scarves|shawls?|bandanas?)\b/g },
  { family: 'gloves', category: 'accessories', re: /\b(?:gloves?|mittens?)\b/g },
  { family: 'sunglasses', category: 'accessories', re: /\b(?:sunglasses|eyewear)\b/g },
  { family: 'wallets', category: 'accessories', re: /\b(?:wallets?|cardholders?|card holders?|card cases?|coin purses?)\b/g },
];

const CATEGORY_OF_FAMILY = new Map<Family, ClothingCategory>(
  FAMILIES.map(f => [f.family, f.category] as [Family, ClothingCategory]),
);

type FamilyHit = { family: Family; index: number };

const familyHits = (text: string): FamilyHit[] => {
  const t = phraseText(text);
  const hits: FamilyHit[] = [];
  for (const def of FAMILIES) {
    def.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = def.re.exec(t)) !== null) {
      hits.push({ family: def.family, index: m.index });
      if (m[0].length === 0) def.re.lastIndex += 1;
    }
  }
  return hits.sort((a, b) => a.index - b.index);
};

/** Every product type the text names, in the order it names them. */
export const productFamilies = (text: string): Family[] => {
  const seen = new Set<Family>();
  for (const h of familyHits(text)) seen.add(h.family);
  return [...seen];
};

/** What the text is about: the last product noun in it ("block heel boots" is boots, not heels). */
export const headFamily = (text: string): Family | undefined => {
  const hits = familyHits(text);
  return hits.length > 0 ? hits[hits.length - 1].family : undefined;
};

// ─── Real products only ─────────────────────────────────────────────────────

// URL shapes of search and editorial pages rather than one product. Shelf
// pages (/shop/, /browse/, /categories/...) need the path's shape, so see isShelfPath.
const NON_PRODUCT_URL_PATTERNS = [
  /\/shop\?/i,
  /\/collection\//i,
  /\/collections\/[^/?]+\/?$/i, // /collections/bags (shelf) but keep /collections/x/products/y
  /\/gp\/browse/i,
  /\/s\?k=/i,
  /\/search\/?(?:\?|$)/i,
  /\/sch\//i, // eBay search
  /\/b\/[^/]+\/\d+/i, // eBay category
  /\/market\//i, // Etsy search
  /\/brands?\/?$/i,
  /\/brands?\/[^/]+\/?$/i,
  /\/(?:blogs?|news|articles?|guides?|stories|story|magazine|journal|editorial|inspiration|lookbooks?|how-to|forums?|wiki|boards?|pins?|topics?|tags?)\//i,
];

// A picture file is never a product page, whatever site it is on.
const IMAGE_FILE = /\.(?:jpe?g|png|gif|webp|avif|bmp|svg)$/i;

// The words a department or category page's URL is made of. A product's URL has
// a name in it ("pilcro-lucy-boots"), which is how the two are told apart.
// Plural or mass nouns only: "chelsea-boot" is a product, "boots" is a shelf.
const SHELF_WORDS = new Set([
  'women', 'womens', 'woman', 'men', 'mens', 'man', 'ladies', 'kids', 'girls', 'boys', 'baby',
  'unisex', 'juniors', 'plus',
  'new', 'arrivals', 'sale', 'clearance', 'outlet', 'all', 'shop', 'best', 'sellers', 'bestsellers',
  'trending', 'featured', 'gifts', 'essentials', 'collection', 'collections', 'brands', 'designers',
  'and',
  'clothing', 'clothes', 'apparel', 'shoes', 'footwear', 'boots', 'booties', 'sandals', 'sneakers',
  'heels', 'flats', 'loafers', 'slippers', 'bags', 'handbags', 'purses', 'clutches', 'totes',
  'backpacks', 'accessories', 'jewelry', 'jewellery', 'necklaces', 'earrings', 'bracelets', 'rings',
  'watches', 'hats', 'scarves', 'gloves', 'belts', 'sunglasses', 'wallets', 'dresses', 'tops',
  'shirts', 'tees', 'blouses', 'sweaters', 'knitwear', 'cardigans', 'hoodies', 'jackets', 'coats',
  'outerwear', 'blazers', 'pants', 'trousers', 'jeans', 'shorts', 'skirts', 'leggings', 'swimwear',
  'swimsuits', 'activewear', 'loungewear', 'sleepwear', 'lingerie', 'denim', 'suits',
  'ankle', 'knee', 'high', 'tall', 'thigh', 'over', 'western', 'cowboy', 'combat', 'chelsea', 'block',
  'heel', 'platform', 'wide', 'leg', 'mini', 'midi', 'maxi',
  'leather', 'suede', 'knit', 'cotton', 'linen', 'silk', 'wool', 'cashmere', 'faux', 'vegan',
]);

const isShelfSlug = (segment: string): boolean => {
  const words = segment.split(/[-_]+/).filter(Boolean);
  return words.length > 0 && words.every(w => SHELF_WORDS.has(w) || COLOR_WORDS.has(w));
};

const PRODUCT_MARKERS = new Set(['p', 'product', 'products']);
const CATEGORY_MARKERS = new Set(['c', 'category', 'categories']);
const isIdSegment = (segment: string): boolean =>
  /^\d{5,}$/.test(segment) || /^[a-z]{1,3}\d{3,}[a-z0-9]*$/i.test(segment);

/** The path goes through /p/ or /product/, or ends in a product's name and its id (.../piper-suede-boot/AB123). */
const looksLikeProductPath = (segs: string[]): boolean => {
  if (segs.some(seg => PRODUCT_MARKERS.has(seg))) return true;
  const n = segs.length;
  return n >= 2 && isIdSegment(segs[n - 1]) && !isShelfSlug(segs[n - 2]);
};

// A locale folder like /us/ or /en-gb/.
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i;

/**
 * A department, category or "shop" page rather than a product, on sites that use
 * the same folder for both: Anthropologie's /shop/<name> and Gap's /browse/product.do
 * are products, /shop/womens-boots and /browse/category.do are shelves.
 */
const isShelfPath = (segs: string[]): boolean => {
  const after = (marker: string): string[] | null => {
    const i = segs.indexOf(marker);
    return i < 0 ? null : segs.slice(i + 1);
  };
  const shop = after('shop');
  if (shop && (shop.length === 0 || (isShelfSlug(shop[0]) && !looksLikeProductPath(shop)))) return true;
  const browse = after('browse');
  if (browse && browse[0] !== 'product.do') return true;
  // J.Crew product pages sit under /categories/ too: it is a shelf only without a product name and id.
  if (segs.some(seg => CATEGORY_MARKERS.has(seg)) && !looksLikeProductPath(segs)) return true;
  // "/all-boots" starts the path; "/products/all-weather-tan-boot" is a product.
  const first = segs.find(seg => !LOCALE_SEGMENT.test(seg));
  return !!first && /^all-[a-z-]+/.test(first);
};

const NON_PRODUCT_TITLE_PATTERNS = [
  /shop all/i,
  /shop by/i,
  /^shop\b/i,
  /^all (?!saints\b)[a-z]+/i,
  /browse/i,
  /category/i,
  /search results/i,
  // A shelf is called "Fall Collection 2026" or "Boots Collection | Zappos"; a brand line
  // inside a product title ("Ralph Lauren Collection Suede Boots") is a product.
  /^collections?\b/i,
  /\bcollections?\s*(?:\d{4}|[|:\u00b7\u2022\u2013\u2014-]|$)/i,
  /\b(?:best|top)\s+\d+\b/i,
  /^\d+\s+(?:best|top|ways|outfits?|looks?)\b/i,
  /\bhow to (?:wear|style|choose)\b/i,
  /\b(?:outfit|style) (?:ideas|inspiration|guide)\b/i,
  /\bbuying guide\b/i,
  /\blookbook\b/i,
  /\bwhat to wear\b/i,
  /\bnew arrivals\b/i,
];

// A site's front page: no path, or only a locale like /us/en/.
const isHomepage = (u: URL): boolean =>
  !u.search && u.pathname.split('/').filter(Boolean).every(seg => LOCALE_SEGMENT.test(seg));

/** A category, search, blog or front page, or a picture file, rather than one product page. */
export const isNonProductUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (isHomepage(u) || IMAGE_FILE.test(u.pathname)) return true;
    if (isShelfPath(u.pathname.toLowerCase().split('/').filter(Boolean))) return true;
    return NON_PRODUCT_URL_PATTERNS.some(re => re.test(u.pathname + u.search));
  } catch {
    return false;
  }
};

/** A shelf, search-results or editorial title rather than one product's. */
export const isNonProductTitle = (title: string): boolean =>
  NON_PRODUCT_TITLE_PATTERNS.some(re => re.test(title));

// ─── Relevance ──────────────────────────────────────────────────────────────

export type RelevanceContext = {
  audience: Audience;
  /** The product type being looked for. A result of any other type is dropped. */
  head?: Family;
  /** Fallback when the type is unknown. 'accessories' and 'activewear' are catch-alls and never filter. */
  category?: string;
};

/**
 * What a search is looking for. Adult unless the subtype or text says children's:
 * a grown-up's tan boot must never come back as a toddler's.
 */
export const relevanceContext = (parts: {
  audience?: Audience;
  subtype?: string;
  text?: string;
  category?: string;
}): RelevanceContext => ({
  audience:
    parts.audience ??
    (hasKidsWords(`${parts.subtype ?? ''} ${parts.text ?? ''}`) ? 'kids' : 'adult'),
  head: (parts.subtype ? headFamily(parts.subtype) : undefined) ?? headFamily(parts.text ?? ''),
  category: parts.category,
});

export type Listable = {
  title: string;
  source: string;
  url: string;
  imageUrl: string;
  similarity: number;
  sourceKind?: SourceKind;
};

const slugOf = (url: string): string => {
  const segs = pathOf(url).split('/').filter(Boolean);
  return (segs[segs.length - 1] ?? '').replace(/\.\w+$/, '');
};

const hasCompatibleType = (r: Listing, ctx: RelevanceContext): boolean => {
  const found = productFamilies(`${r.title} ${slugOf(r.url)}`);
  if (found.length === 0) return true;
  if (ctx.head) return found.includes(ctx.head);
  if (ctx.category && ctx.category !== 'accessories' && ctx.category !== 'activewear') {
    return found.some(f => CATEGORY_OF_FAMILY.get(f) === ctx.category);
  }
  return true;
};

/** Kept only if it is a product page for the right kind of item, for the right age group. */
export const passesRelevance = (r: Listing, ctx: RelevanceContext): boolean => {
  if (isNonProductUrl(r.url) || isNonProductTitle(r.title)) return false;
  const kids = isKidsListing(r);
  if (ctx.audience === 'adult' && kids) return false;
  if (ctx.audience === 'kids' && !kids && isAdultListing(r)) return false;
  return hasCompatibleType(r, ctx);
};

/** Drops repeats, keeping the first (so sort best-first before calling): same picture, or same product title on one site. */
export const dedupeResults = <T extends { title: string; source: string; imageUrl: string }>(
  items: T[],
): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of items) {
    const image = r.imageUrl ? `img|${r.imageUrl.replace(/[?#].*$/, '')}` : '';
    const norm = normalizeTitle(r.title, r.source);
    const words = norm ? norm.split(' ').length : 0;
    const siteKey = words >= 2 ? `site|${registrableDomain(r.source)?.domain ?? r.source}|${norm}` : '';
    // A long, specific title listed on two sites is the same product; a short generic one is not.
    const anyKey = words >= 5 ? `any|${norm}` : '';
    const keys = [image, siteKey, anyKey].filter(Boolean);
    if (keys.some(k => seen.has(k))) continue;
    keys.forEach(k => seen.add(k));
    out.push(r);
  }
  return out;
};

// ─── Ordering ───────────────────────────────────────────────────────────────

/** Fewer than this many shop results and second-hand ones stay in (at the end). */
export const MIN_SHOP_RESULTS = 6;

/** Retail first, then unknown sites, then marketplaces, then resale; `scoreOf` (higher first) orders each tier. */
export const sortByTier = <T extends { source: string; sourceKind?: SourceKind }>(
  items: T[],
  scoreOf: (item: T) => number = () => 0,
): T[] =>
  items
    .map((item, index) => ({ item, index, tier: sourceTier(sourceKindOf(item)), score: scoreOf(item) }))
    .sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index)
    .map(x => x.item);

/** How many results come from shops or sites we have no reason to distrust. */
export const countShopResults = (items: ReadonlyArray<{ source: string; sourceKind?: SourceKind }>): number =>
  items.filter(r => {
    const kind = sourceKindOf(r);
    return kind === 'retail' || kind === 'unknown';
  }).length;

/**
 * What to show. Resale listings are demoted, not hidden, until there are enough
 * shop results that they would only be noise; then they go unless the person
 * asked for them.
 */
export const selectVisibleResults = <T extends { source: string; sourceKind?: SourceKind }>(
  items: T[],
  includeResale: boolean,
): T[] => {
  if (includeResale || countShopResults(items) < MIN_SHOP_RESULTS) return items;
  return items.filter(r => sourceKindOf(r) !== 'resale');
};

// ─── Matching words ─────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'in', 'of', 'to', 'by', 'on', 'at', 'from',
  'new', 'shop', 'buy', 'online', 'sale', 'women', 'woman', 'men', 'man', 'ladies', 'size',
]);

const COLOR_WORDS = new Set([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'brown',
  'gray', 'grey', 'beige', 'tan', 'camel', 'cream', 'ivory', 'navy', 'burgundy', 'maroon',
  'olive', 'khaki', 'gold', 'silver', 'teal', 'turquoise', 'lavender', 'coral', 'taupe',
  'nude', 'charcoal', 'cognac', 'chocolate', 'rust', 'mustard', 'blush', 'sage',
  'terracotta', 'peach', 'lime', 'mint', 'plum', 'mauve',
]);

/** The words in a search that must show up in a good result. */
export const queryTokens = (text: string): string[] => [
  ...new Set(tokenize(text).filter(t => t.length > 1 && !STOPWORDS.has(t))),
];

/** Share (0..1) of the search words found in the title. */
export const titleCoverage = (title: string, tokens: readonly string[]): number => {
  if (tokens.length === 0) return 1;
  const have = new Set(tokenize(title));
  return tokens.filter(t => have.has(t)).length / tokens.length;
};

// ─── Building the web query ─────────────────────────────────────────────────

/** Brave's own limit is 400 characters and 50 words per query. */
export const BRAVE_QUERY_MAX = 400;
export const BRAVE_QUERY_MAX_WORDS = 50;
/** What a proxy that predates the 400 limit accepts. */
export const COMPACT_QUERY_MAX = 200;
/** How many web results to ask for: many get dropped (resale, children's, non-products). */
export const SEARCH_RESULT_COUNT = 50;

const MAX_USER_WORDS = 20;
const MAX_USER_CHARS = 160;

const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/**
 * The person's words, safe to send: search-operator syntax (quotes, brackets,
 * colons, a leading - or +, AND/OR/NOT) is removed so typing "site:" or "-gucci"
 * cannot change what we ask for, and the length is bounded.
 */
export const sanitizeQueryText = (text: string): string => {
  const words = text
    .replace(/[()"“”:]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[-+]+/, ''))
    .filter(w => w && !/^(?:AND|OR|NOT)$/.test(w))
    .slice(0, MAX_USER_WORDS);
  return clipAtWord(words.join(' '), MAX_USER_CHARS);
};

/**
 * Words of a search that could be a brand name (single words and neighbouring
 * pairs, "bottega veneta"), so a host that is exactly that brand counts as a shop.
 */
export const brandCandidates = (text: string, brand?: string): string[] => {
  const words = sanitizeQueryText(text).split(' ').filter(Boolean);
  const usable = words.map(w => {
    const t = tokenize(w)[0];
    return !!t && t.length >= 3 && !STOPWORDS.has(t) && !COLOR_WORDS.has(t) && productFamilies(w).length === 0;
  });
  const out = new Set<string>();
  if (brand) out.add(brand);
  words.forEach((w, i) => {
    if (!usable[i]) return;
    out.add(w);
    if (i + 1 < words.length && usable[i + 1]) out.add(`${w} ${words[i + 1]}`);
  });
  return [...out];
};

const CATEGORY_NOUN: Record<string, string> = {
  tops: 'top',
  bottoms: 'pants',
  dresses: 'dress',
  outerwear: 'jacket',
  shoes: 'shoes',
  bags: 'bag',
  jewelry: 'jewelry',
  hats: 'hat',
  activewear: 'activewear',
  swimwear: 'swimsuit',
};

/** A short search that names no product ("gucci") gets the category's noun so it does not return anything gucci. */
const withCategoryWord = (text: string, category?: string): string => {
  const noun = category ? CATEGORY_NOUN[category] : undefined;
  if (!noun || !text || wordCount(text) > 3 || productFamilies(text).length > 0) return text;
  return `${text} ${noun}`;
};

export type BuiltQuery = {
  /** What is sent to the search engine. */
  q: string;
  /** The person's words (plus a category noun), without operators. */
  text: string;
  /** The hosts excluded with -site:. */
  excluded: string[];
};

/**
 * The query for the web search: the cleaned words, then `-site:` for as many of
 * the main resale hosts as fit under `maxLength` (most common first).
 */
export const buildBraveQuery = (
  text: string,
  opts: { category?: string; excludeResale?: boolean; maxLength?: number } = {},
): BuiltQuery => {
  const maxLength = opts.maxLength ?? BRAVE_QUERY_MAX;
  const base = clipAtWord(withCategoryWord(sanitizeQueryText(text), opts.category), maxLength);
  let q = base;
  const excluded: string[] = [];
  if (opts.excludeResale && base) {
    for (const host of RESALE_QUERY_EXCLUSIONS) {
      const next = `${q} -site:${host}`;
      if (next.length > maxLength || wordCount(next) > BRAVE_QUERY_MAX_WORDS) break;
      q = next;
      excluded.push(host);
    }
  }
  return { q, text: base, excluded };
};

/**
 * The product search for a photo, from what was detected: brand + colour +
 * product type. Falls back to the web's best guess, then to the one label that
 * names a product; never a string of every label. Empty when nothing names a product.
 */
export const deriveImageQuery = (p: {
  brand?: string;
  color?: string;
  subtype?: string;
  category?: string;
  bestGuess?: string;
  labels?: readonly string[];
}): string => {
  const subtype = sanitizeQueryText(p.subtype ?? '');
  let core = subtype || (p.category ? CATEGORY_NOUN[p.category] ?? '' : '');
  if (!core) {
    core = clipAtWord(sanitizeQueryText(p.bestGuess ?? ''), 80);
  }
  if (!core) {
    const labels = (p.labels ?? []).map(l => sanitizeQueryText(l));
    const product = labels.find(l => productFamilies(l).length > 0);
    const color = labels.find(l => tokenize(l).some(t => COLOR_WORDS.has(t)));
    core = product ? [color, product].filter(Boolean).join(' ') : '';
  }
  if (!core) return '';

  const have = new Set(tokenize(core));
  const hasColor = [...have].some(t => COLOR_WORDS.has(t));
  const extra: string[] = [];
  const brand = sanitizeQueryText(p.brand ?? '');
  if (brand && !tokenize(brand).every(t => have.has(t))) extra.push(brand);
  const color = sanitizeQueryText(p.color ?? '');
  if (color && !hasColor && !tokenize(color).every(t => have.has(t))) extra.push(color);
  return [...extra, core].join(' ');
};
