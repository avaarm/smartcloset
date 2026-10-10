/**
 * lensSearchService — "Google Lens for clothes".
 *
 * Photo pipeline:
 *   1. User picks a photo.
 *   2. We call Google Cloud Vision with WEB_DETECTION + LABEL_DETECTION +
 *      IMAGE_PROPERTIES.
 *   3. WEB_DETECTION gives us `pagesWithMatchingImages` and `bestGuessLabels`
 *      — this IS Google Lens reverse image search. `visuallySimilarImages` are
 *      pictures with no page or title behind them, so they are only ever used
 *      as a thumbnail for a page, never as results.
 *   4. A photo of someone's own boots rarely has matching pages, so when that
 *      finds few shops we also run a text search for what was detected
 *      (brand + colour + product type).
 *
 * Every result is classified by site (retailerDomains) and ordered shops first,
 * second-hand marketplaces last; searchRanking holds the rules for dropping
 * children's items, wrong product types, category pages and repeats.
 *
 * Honest by design: results are only ever what the web returned. If the search
 * is not configured, fails, or finds nothing, the response is empty (with a
 * friendly `error` on failure) and the UI says so; nothing is invented.
 */

import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';
import { callAiProxy, classifyAiError, friendlyAiMessage } from './aiProxy';
import { classifyHost, hostnameOf, sourceKindOf, type SourceKind } from './retailerDomains';
import {
  BRAVE_QUERY_MAX,
  COMPACT_QUERY_MAX,
  MIN_SHOP_RESULTS,
  SEARCH_RESULT_COUNT,
  brandCandidates,
  buildBraveQuery,
  cleanResultTitle,
  countShopResults,
  dedupeResults,
  deriveImageQuery,
  headFamily,
  isNonProductTitle,
  passesRelevance,
  productFamilies,
  queryTokens,
  relevanceContext,
  sanitizeQueryText,
  selectVisibleResults,
  sortByTier,
  titleCoverage,
  tokenize,
  type Audience,
  type RelevanceContext,
} from './searchRanking';

export type LensResult = {
  id: string;
  title: string;
  /** Best guess at merchant, from the hostname. */
  source: string;
  url: string;
  imageUrl: string;
  price?: string;
  /** 0..1, higher = more similar. Comes from Vision's score. */
  similarity: number;
  /** True if source is a known shop (retail, resale or marketplace). */
  isShopping: boolean;
  /**
   * What kind of site this is (retail, resale...). Absent on results built
   * elsewhere: read it with sourceKindOf(), which works it out from `source`.
   */
  sourceKind?: SourceKind;
};

export type LensSearchResponse = {
  query: string;
  bestGuessLabels: string[];
  results: LensResult[];
  error?: string;
  /** True if Vision could not be called (no API key, etc). UI should show config hint. */
  notConfigured?: boolean;
};

/** What the app already knows about the item in the photo (from its own analysis). */
export type LensHints = {
  brand?: string;
  color?: string;
  subtype?: string;
  category?: string;
  audience?: Audience;
};

export type TextSearchOptions = {
  /** Category noun added to a short search that names no product. */
  category?: string;
  /** A brand the person is after: that brand's own site counts as a shop. */
  brand?: string;
  audience?: Audience;
  /** Also fetch second-hand listings, instead of excluding them at the source. Default false. */
  includeResale?: boolean;
};

const isShoppingKind = (kind: SourceKind): boolean =>
  kind === 'retail' || kind === 'resale' || kind === 'marketplace';

/** A product-page link: kept exactly as given, but only if it is a real http(s) URL. */
export const toWebUrl = (u: unknown): string => {
  if (typeof u !== 'string') return '';
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) && hostnameOf(trimmed) ? trimmed : '';
};

/**
 * An image URL the app can actually load. App Transport Security blocks plain
 * http, so http images are upgraded to https; other schemes (data:, file:,
 * javascript:) and junk are dropped. Returns '' when there is no usable URL.
 */
export const toSecureImageUrl = (u: unknown): string =>
  toWebUrl(u).replace(/^http:\/\//i, 'https://');

// ─── Scoring against what was detected ──────────────────────────────────────

export type LensAttrs = {
  color?: string;
  subtype?: string;
  category?: string;
  material?: string;
  brand?: string;
  audience?: Audience;
};

// Every colour name the app can detect (utils/colorNames) has an entry unless a title
// can only say it one way. Words are what shops write for the same colour.
export const COLOR_SYNONYMS: Record<string, string[]> = {
  ivory: ['cream', 'off white', 'ecru'],
  cream: ['ivory', 'off white', 'ecru', 'champagne'],
  beige: ['tan', 'camel', 'nude', 'sand', 'oatmeal', 'taupe'],
  tan: ['camel', 'beige', 'taupe', 'sand', 'khaki', 'caramel', 'cognac'],
  camel: ['tan', 'beige', 'caramel', 'nude', 'cognac'],
  khaki: ['tan', 'beige', 'sand', 'stone'],
  taupe: ['tan', 'beige', 'greige', 'mushroom', 'stone'],
  brown: ['chocolate', 'espresso', 'mocha', 'chestnut', 'cognac'],
  'dark brown': ['brown', 'espresso', 'chocolate', 'mocha'],
  'light gray': ['gray', 'grey', 'silver'],
  gray: ['grey'],
  grey: ['gray'],
  silver: ['gray', 'grey', 'metallic'],
  charcoal: ['dark gray', 'dark grey', 'graphite'],
  red: ['scarlet', 'crimson', 'cherry'],
  burgundy: ['maroon', 'wine', 'oxblood', 'merlot', 'dark red'],
  maroon: ['burgundy', 'wine', 'oxblood'],
  wine: ['burgundy', 'maroon', 'merlot'],
  rust: ['terracotta', 'burnt orange', 'copper', 'cinnamon'],
  terracotta: ['rust', 'clay', 'burnt orange'],
  coral: ['salmon', 'peach'],
  pink: ['blush', 'rose'],
  blush: ['pink', 'nude', 'rose', 'dusty rose'],
  'hot pink': ['fuchsia', 'magenta', 'pink'],
  orange: ['burnt orange'],
  peach: ['apricot', 'coral'],
  mustard: ['yellow', 'ochre'],
  yellow: ['lemon'],
  gold: ['golden', 'brass', 'bronze'],
  olive: ['army green', 'khaki'],
  sage: ['sage green', 'olive'],
  green: ['emerald', 'kelly green', 'jade'],
  'forest green': ['dark green', 'hunter green'],
  lime: ['chartreuse'],
  mint: ['mint green', 'light green', 'seafoam'],
  teal: ['turquoise', 'aqua'],
  turquoise: ['teal', 'aqua'],
  navy: ['dark blue', 'midnight'],
  blue: ['cobalt', 'royal blue', 'denim'],
  'light blue': ['sky blue', 'baby blue', 'powder blue', 'pale blue'],
  purple: ['violet', 'plum'],
  lavender: ['lilac', 'light purple'],
  plum: ['purple', 'eggplant', 'aubergine'],
  mauve: ['dusty rose', 'lilac'],
  champagne: ['cream', 'ivory', 'off white', 'nude'],
};

const joined = (text: string): string => tokenize(text).join(' ');
const hasPhrase = (haystack: string, phrase: string): boolean =>
  phrase.length > 0 && ` ${haystack} `.includes(` ${phrase} `);

// A knee-high boot is not an ankle boot, though both are boots. Words are the
// tokenize() forms ("booties" becomes "booty").
const TALL_BOOT_PHRASES = ['knee high', 'over the knee', 'thigh high', 'tall'];
const SHORT_BOOT_PHRASES = ['ankle', 'chelsea', 'bootie', 'booty', 'short'];
const mentionsAny = (haystack: string, phrases: string[]): boolean =>
  phrases.some(p => hasPhrase(haystack, p));
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type MatchSignals = {
  score: number;
  /** How many of the product-defining attributes (type, brand) the title matched; colour and material do not count. */
  evidence: number;
};

const matchSignals = (
  result: { title: string; source: string; similarity: number },
  attrs: LensAttrs,
): MatchSignals => {
  const title = joined(result.title);
  const titleWords = new Set(title.split(' '));
  let score = result.similarity * 2; // base from Vision
  let evidence = 0;

  if (attrs.color) {
    const color = joined(attrs.color);
    if (hasPhrase(title, color)) score += 5;
    else if ((COLOR_SYNONYMS[color] ?? []).some(syn => hasPhrase(title, joined(syn)))) score += 3;
  }

  // Product type: every word of "knee-high boots" in the title is a full match,
  // so a plain "Chelsea boot" gets only the share it has.
  if (attrs.subtype) {
    const words = [...new Set(tokenize(attrs.subtype))];
    if (words.length > 0) {
      const share = words.filter(w => titleWords.has(w)).length / words.length;
      score += 4 * share;
      if (share > 0) evidence += 1;
    }
    const head = headFamily(attrs.subtype);
    if (head && productFamilies(result.title).includes(head)) {
      score += 2;
      evidence += 1;
      if (head === 'boots') {
        const wantsTall = mentionsAny(joined(attrs.subtype), TALL_BOOT_PHRASES);
        const wantsShort = mentionsAny(joined(attrs.subtype), SHORT_BOOT_PHRASES);
        const isTall = mentionsAny(title, TALL_BOOT_PHRASES);
        const isShort = mentionsAny(title, SHORT_BOOT_PHRASES);
        if ((wantsTall && !wantsShort && isShort && !isTall) || (wantsShort && !wantsTall && isTall && !isShort)) {
          score -= 3;
        }
      }
    }
  } else if (attrs.category && attrs.category !== 'accessories') {
    if (hasPhrase(title, joined(attrs.category))) score += 2;
  }

  if (attrs.material && hasPhrase(title, joined(attrs.material))) score += 2;

  if (attrs.brand) {
    const brand = compact(attrs.brand);
    if (brand.length >= 3 && (compact(result.title).includes(brand) || compact(result.source).includes(brand))) {
      score += 3;
      evidence += 1;
    }
  }

  // Heavy penalty for shelf titles we already try to filter — belt & braces
  if (isNonProductTitle(result.title)) score -= 10;

  return { score, evidence };
};

/**
 * Score a lens result by how well its title/source matches the detected
 * attributes from the initial photo. Returns a 0..∞ score (higher = better).
 *
 * Much more effective than Vision's raw similarity score for our use case
 * because we're filtering out same-category-different-product noise.
 */
export const scoreLensResultByAttributes = (
  result: { title: string; source: string; similarity: number },
  attrs: LensAttrs,
): number => matchSignals(result, attrs).score;

/**
 * Filter + rank lens results against detected attributes. Drops category
 * pages, children's items (unless the item is one), the wrong product type
 * and repeats, then orders shops first and second-hand sites last, best
 * attribute match first within each. Resale is dropped once there are enough
 * shop results, unless `includeResale`. Returns only the top N that look like
 * they could be the user's item.
 */
export const refineLensResults = (
  results: LensResult[],
  attrs: LensAttrs,
  limit = 6,
  options: { includeResale?: boolean } = {},
): LensResult[] => {
  const ctx = relevanceContext({
    audience: attrs.audience,
    subtype: attrs.subtype,
    category: attrs.category,
  });
  // With a product type or brand to go on, a page from a site we know nothing
  // about has to show it in its title; otherwise it is just a page.
  const needsEvidence = !!(attrs.subtype || attrs.brand);

  const scores = new Map<LensResult, number>();
  const kept: LensResult[] = [];
  for (const r of results) {
    if (!/^https?:\/\//i.test(r.imageUrl || '')) continue;
    const kind = r.sourceKind && r.sourceKind !== 'unknown'
      ? r.sourceKind
      : classifyHost(r.source, { brand: attrs.brand });
    if (kind === 'social') continue; // YouTube / Pinterest / blogs
    if (!passesRelevance(r, ctx)) continue;
    const { score, evidence } = matchSignals(r, attrs);
    // A minimum score so we don't return junk when nothing really matches
    if (score <= 0) continue;
    if ((kind === 'unknown' || kind === 'marketplace') && needsEvidence && evidence === 0) continue;
    const next = { ...r, sourceKind: kind };
    scores.set(next, score);
    kept.push(next);
  }

  const ranked = dedupeResults(sortByTier(kept, r => scores.get(r) ?? 0));
  return selectVisibleResults(ranked, !!options.includeResale).slice(0, limit);
};

// ─── Ranking a fresh search ─────────────────────────────────────────────────

/**
 * Drops what is not a right-sized product page, orders shops first (best
 * `scoreOf` first within a group) and removes repeats.
 */
const rankForDisplay = (
  results: LensResult[],
  ctx: RelevanceContext,
  scoreOf: (r: LensResult) => number,
): LensResult[] =>
  dedupeResults(sortByTier(results.filter(r => passesRelevance(r, ctx)), scoreOf));

// ─── Photo search ───────────────────────────────────────────────────────────

const IMAGE_RESULT_LIMIT = 30;

/**
 * Search the web for a photo. Returns everything usable, shops first and
 * second-hand last, so callers can show or hide resale (selectVisibleResults)
 * without searching again. `hints` is what the app already detected in the
 * photo; without it the search goes on what Vision made of the picture.
 */
export const searchByImage = async (
  imageUri: string,
  hints: LensHints = {},
): Promise<LensSearchResponse> => {
  if (!hasGoogleVision() || !env.ENABLE_REVERSE_IMAGE_SEARCH) {
    return {
      query: '',
      bestGuessLabels: [],
      results: [],
      notConfigured: true,
    };
  }

  const failed = (error: string): LensSearchResponse => ({
    query: '',
    bestGuessLabels: [],
    results: [],
    error,
  });

  try {
    const base64 = await readImageAsBase64(imageUri);

    let data: any;
    try {
      data = await callAiProxy<any>('vision', {
        requests: [
          {
            image: { content: base64 },
            features: [
              { type: 'WEB_DETECTION', maxResults: 20 },
              { type: 'LABEL_DETECTION', maxResults: 8 },
              { type: 'IMAGE_PROPERTIES' },
            ],
          },
        ],
      });
    } catch (err: any) {
      console.warn('[lens] image search failed:', err?.message?.substring(0, 120));
      return failed(friendlyAiMessage(classifyAiError(err), 'search'));
    }
    const first = data?.responses?.[0] ?? {};
    const web = first.webDetection ?? {};
    const labels: string[] = (first.labelAnnotations ?? []).map((l: any) => l.description);

    const bestGuessLabels: string[] = (web.bestGuessLabels ?? []).map(
      (g: any) => g.label,
    );
    const query = deriveImageQuery({ ...hints, bestGuess: bestGuessLabels[0], labels });
    const ctx = relevanceContext({
      audience: hints.audience,
      subtype: hints.subtype,
      text: query,
      category: hints.category,
    });
    const tokens = queryTokens(query);
    const relevance = (r: LensResult) => titleCoverage(r.title, tokens) * 6 + r.similarity * 2;

    // Results are the pages that hold a matching picture. visuallySimilarImages
    // are image files (titled by nothing but their host), so they would show as
    // cards named after a CDN and count as shops: they only lend a thumbnail.
    const pages: any[] = web.pagesWithMatchingImages ?? [];
    const similarImages: any[] = web.visuallySimilarImages ?? [];

    const found: LensResult[] = [];
    const seen = new Set<string>();

    pages.forEach((p, idx) => {
      const pageUrl = toWebUrl(p?.url);
      if (!pageUrl) return;
      const host = hostnameOf(pageUrl);
      const kind = classifyHost(host, { brand: hints.brand });
      if (!host || seen.has(pageUrl) || kind === 'social') return;
      seen.add(pageUrl);

      // Pick a thumbnail: matching full image > partial > similar image.
      // NOTE: never fall back to p.pageTitle here — it's a TITLE, not a URL,
      // and would be resolved against the bundle if passed to <Image>.
      const candidates = [
        p.fullMatchingImages?.[0]?.url,
        p.partialMatchingImages?.[0]?.url,
        similarImages[idx]?.url,
      ];
      const imageUrl = candidates.map(toSecureImageUrl).find(Boolean) ?? '';

      found.push({
        id: `page-${idx}`,
        title: cleanResultTitle(p.pageTitle || host, host),
        source: host,
        url: pageUrl,
        imageUrl,
        similarity: p.score ?? 0,
        isShopping: isShoppingKind(kind),
        sourceKind: kind,
      });
    });

    let ranked = rankForDisplay(found, ctx, relevance);

    // A photo of your own boots has few matching pages. Searching the web for
    // what was detected finds the shops that sell that kind of boot.
    if (query && countShopResults(ranked) < MIN_SHOP_RESULTS) {
      try {
        const fromText = await searchWeb(query, {
          category: hints.category,
          brand: hints.brand,
          audience: ctx.audience,
        });
        ranked = rankForDisplay([...ranked, ...fromText], ctx, relevance);
      } catch (err: any) {
        console.warn('[lens] text search for photo failed:', err?.message?.substring(0, 120));
      }
    }

    return {
      query,
      bestGuessLabels,
      results: ranked.slice(0, IMAGE_RESULT_LIMIT),
    };
  } catch (error: any) {
    console.warn('[lens] image search error:', error?.message);
    return failed(friendlyAiMessage('other', 'search'));
  }
};

// ─── Text-based product search ──────────────────────────────────────────────

const TEXT_RESULT_LIMIT = 30;

/**
 * One Brave Image Search through the proxy. Resale hosts are excluded at the
 * source with `-site:` when asked. A proxy that predates the longer query limit
 * answers "q too long"; the search is then repeated with the compact query.
 */
const braveSearch = async (
  text: string,
  opts: { category?: string; excludeResale: boolean },
): Promise<{ items: any[]; excludedAtSource: boolean }> => {
  const run = async (maxLength: number) => {
    const built = buildBraveQuery(text, {
      category: opts.category,
      excludeResale: opts.excludeResale,
      maxLength,
    });
    const data = await callAiProxy<any>('brave', {
      q: built.q,
      num: SEARCH_RESULT_COUNT,
      safe: 'active',
    });
    return {
      items: Array.isArray(data?.results) ? (data.results as any[]) : [],
      excludedAtSource: built.excluded.length > 0,
    };
  };
  try {
    return await run(BRAVE_QUERY_MAX);
  } catch (err: any) {
    if (/q too long/i.test(String(err?.message))) return run(COMPACT_QUERY_MAX);
    throw err;
  }
};

const resultsFromBrave = (items: any[], brands: string[], idPrefix: string): LensResult[] => {
  const out: LensResult[] = [];
  items.forEach((it, idx) => {
    const pageUrl = toWebUrl(it?.url);
    if (!pageUrl) return;
    const host = hostnameOf(pageUrl);
    const kind = classifyHost(host, { brand: brands });
    // Drop YouTube / Pinterest / blogs — we want actual shoppable items.
    if (!host || kind === 'social') return;
    out.push({
      id: `${idPrefix}-${idx}`,
      title: cleanResultTitle(it.title || host, host),
      source: host,
      url: pageUrl,
      // Brave's thumbnail is its own https proxy URL and sized for a card; the
      // original image URL is often http or hotlink-protected, so it's the backup.
      imageUrl: toSecureImageUrl(it.thumbnail?.src) || toSecureImageUrl(it.properties?.url),
      // Brave returns them best first; spread over (0.1, 1] so 50 results don't go negative.
      similarity: 1 - (idx / Math.max(items.length, 1)) * 0.9,
      isShopping: isShoppingKind(kind),
      sourceKind: kind,
    });
  });
  return out;
};

/**
 * The text search pipeline: ranked results with resale last, not yet cut down
 * (see selectVisibleResults). Throws when the search itself fails.
 */
const searchWeb = async (
  text: string,
  opts: TextSearchOptions,
): Promise<LensResult[]> => {
  const brands = brandCandidates(text, opts.brand);
  const ctx = relevanceContext({ audience: opts.audience, text, category: opts.category });
  const tokens = queryTokens(text);
  const relevance = (r: LensResult) => titleCoverage(r.title, tokens) * 6 + r.similarity * 2;
  const rank = (results: LensResult[]): LensResult[] =>
    rankForDisplay(
      // Brave matches on the picture's page, so a shop's title may not repeat the
      // search words; a page from anywhere else that shares none of them is noise.
      results.filter(
        r =>
          sourceKindOf(r) === 'retail' ||
          tokens.length < 2 ||
          titleCoverage(r.title, tokens) > 0,
      ),
      ctx,
      relevance,
    );

  let first: Awaited<ReturnType<typeof braveSearch>>;
  try {
    first = await braveSearch(text, { category: opts.category, excludeResale: !opts.includeResale });
  } catch (err: any) {
    // An engine that refuses the -site: form must not take the whole search
    // down with it. Anything else (signed out, rate limit, offline) fails as before.
    if (opts.includeResale || !/\bbrave(?:-direct)? (?:400|422)\b/.test(String(err?.message))) throw err;
    first = await braveSearch(text, { category: opts.category, excludeResale: false });
  }
  const firstResults = resultsFromBrave(first.items, brands, 'brave');
  let ranked = rank(firstResults);

  // Brave documents -site: for web search, not for image search, and an
  // exclusion that backfires returns nothing or only the excluded sites. Too few
  // shops back means asking again without it; the filters above still apply.
  if (first.excludedAtSource && countShopResults(ranked) < MIN_SHOP_RESULTS) {
    try {
      const plain = await braveSearch(text, { category: opts.category, excludeResale: false });
      ranked = rank([...firstResults, ...resultsFromBrave(plain.items, brands, 'brave-plain')]);
    } catch (err: any) {
      console.warn('[lens] retry without exclusions failed:', err?.message?.substring(0, 120));
    }
  }
  return ranked;
};

/**
 * Search for products by text via Brave Image Search (proxied). Returns
 * only what the web returned, shops first and second-hand listings last, and
 * without resale at all once there are enough shop results (unless
 * `includeResale`). When the search fails or finds nothing the response is
 * empty (with a friendly `error` on failure) so the UI can say so rather than
 * show invented products.
 *
 * Previously used Google Custom Search JSON API — Google closed that API to
 * any project/key created after 2026-01-20 (hard 403 regardless of billing
 * or enablement status), so it's no longer usable for new setups.
 */
export const searchProductsByText = async (
  query: string,
  options: TextSearchOptions = {},
): Promise<LensSearchResponse> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: '', bestGuessLabels: [], results: [] };
  }
  // Only operator characters typed: there is nothing to ask the web for.
  if (!sanitizeQueryText(trimmed)) {
    return { query: trimmed, bestGuessLabels: [trimmed], results: [] };
  }

  // Brave config lives server-side in Supabase Secrets; clients only need
  // to be signed in to invoke the proxy.
  let ranked: LensResult[];
  try {
    ranked = await searchWeb(trimmed, options);
  } catch (err: any) {
    console.warn('[lens] text search failed:', err?.message?.substring(0, 120));
    return {
      query: trimmed,
      bestGuessLabels: [trimmed],
      results: [],
      error: friendlyAiMessage(classifyAiError(err), 'search'),
    };
  }

  return {
    query: trimmed,
    bestGuessLabels: [trimmed],
    results: selectVisibleResults(ranked, !!options.includeResale).slice(0, TEXT_RESULT_LIMIT),
  };
};
