/**
 * lensSearchService — "Google Lens for clothes".
 *
 * Pipeline:
 *   1. User picks a photo.
 *   2. We call Google Cloud Vision with WEB_DETECTION + LABEL_DETECTION +
 *      IMAGE_PROPERTIES.
 *   3. WEB_DETECTION gives us `visuallySimilarImages`, `pagesWithMatchingImages`,
 *      and `bestGuessLabels` — this IS Google Lens reverse image search.
 *   4. We classify pages as shopping/not-shopping by hostname matching a known
 *      retailer list.
 *   5. For shopping results, we return a structured LensResult with whatever
 *      metadata Vision gave us. (Price parsing via OG tags is deferred — needs
 *      a server-side proxy to get around CORS on web.)
 *
 * Honest by design: results are only ever what the web returned. If the search
 * is not configured, fails, or finds nothing, the response is empty (with a
 * friendly `error` on failure) and the UI says so; nothing is invented.
 */

import { env, hasGoogleVision } from '../config/env';
import { readImageAsBase64 } from '../platform/fileSystem';
import { callAiProxy, classifyAiError, friendlyAiMessage } from './aiProxy';

// Known shopping/retail hostnames. Keep alphabetical.
// Covers: fast fashion, mid-market, contemporary, luxury, department, and
// resale. Subdomain matching in isShoppingHost() means e.g. "shop.gap.com"
// counts as "gap.com" too.
const SHOPPING_HOSTS = new Set([
  // ── Marketplaces + department ──
  'amazon.com', 'amazon.co.uk', 'amazon.ca',
  'ebay.com', 'ebay.co.uk',
  'etsy.com',
  'bloomingdales.com',
  'macys.com',
  'neimanmarcus.com',
  'nordstrom.com',
  'nordstromrack.com',
  'saksfifthavenue.com',
  'saksoff5th.com',
  'target.com',
  'walmart.com',
  'zappos.com',
  'dsw.com',
  'footlocker.com',

  // ── Luxury + designer ──
  'balenciaga.com',
  'bergdorfgoodman.com',
  'bottegaveneta.com',
  'browns-fashion.com',
  'burberry.com',
  'celine.com',
  'chanel.com',
  'dior.com',
  'farfetch.com',
  'fendi.com',
  'givenchy.com',
  'gucci.com',
  'hermes.com',
  'loewe.com',
  'louisvuitton.com',
  'lvmh.com',
  'luisaviaroma.com',
  'matchesfashion.com',
  'mrporter.com',
  'mytheresa.com',
  'net-a-porter.com',
  'prada.com',
  'ssense.com',
  'theoutnet.com',
  'valentino.com',
  'versace.com',
  'yoox.com',
  '24s.com',

  // ── Contemporary + mid-market ──
  'allsaints.com',
  'acnestudios.com',
  'anthropologie.com',
  'apc-us.com',
  'aritzia.com',
  'banana-republic.com',
  'bananarepublic.com',
  'bananarepublic.gap.com',
  'cos.com',
  'everlane.com',
  'express.com',
  'freepeople.com',
  'gap.com',
  'jcrew.com',
  'madewell.com',
  'reformation.com', 'thereformation.com',
  'revolve.com',
  'shopbop.com',
  'theory.com',
  'toteme.com',
  'vince.com',

  // ── Fast fashion ──
  'asos.com',
  'boohoo.com',
  'fashionnova.com',
  'forever21.com',
  'hm.com',
  'hollisterco.com',
  'lulus.com',
  'missguided.com',
  'prettylittlething.com',
  'princesspolly.com',
  'princess-polly.com',
  'shein.com',
  'topshop.com',
  'uniqlo.com',
  'urbanoutfitters.com',
  'zalando.com',
  'zara.com',

  // ── Athletic + active ──
  'alo.com', 'aloyoga.com',
  'athleta.com',
  'gymshark.com',
  'lululemon.com',
  'nike.com',
  'outdoorvoices.com',
  'puma.com',
  'reebok.com',
  'underarmour.com',

  // ── American classic ──
  'abercrombie.com',
  'ae.com',
  'bestsecret.com',
  'kohls.com',
  'levi.com', 'levis.com',
  'oldnavy.gap.com',
  'polo.com', 'ralphlauren.com',
  'victoriassecret.com',

  // ── Outdoor + workwear ──
  'columbia.com',
  'filson.com',
  'patagonia.com',
  'rei.com',

  // ── Resale + secondhand ──
  'depop.com',
  'grailed.com',
  'mercari.com',
  'poshmark.com',
  'realreal.com', 'therealreal.com',
  'thredup.com',
  'vestiairecollective.com',
  'vinted.com',

  // ── Sneakers resale ──
  'goat.com',
  'stadiumgoods.com',
  'stockx.com',

  // ── Home (ignore for clothes queries but harmless) ──
  'marksandspencer.com',
  'wayfair.com',
  'westelm.com',
]);

/**
 * Hosts that produce noise for clothing-lookup results — video/social/blogs
 * rarely have the structured product data we need. Any match here is never
 * treated as a shopping result and gets dropped during refinement.
 */
const BLOCKED_HOSTS = new Set([
  // Video
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'vimeo.com',
  'dailymotion.com',
  'twitch.tv',
  'tiktok.com', 'vm.tiktok.com',
  // Social
  'instagram.com',
  'pinterest.com', 'pinterest.co.uk',
  'pinimg.com',
  'facebook.com', 'fb.com', 'fbsbx.com', 'fbcdn.net',
  'twitter.com', 'x.com', 't.co',
  'reddit.com', 'redd.it',
  'tumblr.com',
  'snapchat.com',
  'threads.net',
  'bsky.app',
  // Generic blogs / UGC
  'medium.com',
  'substack.com',
  'wikipedia.org', 'wikimedia.org',
  'quora.com',
  'blogspot.com',
  'wordpress.com',
  'squarespace.com',
  'wixsite.com',
  'weebly.com',
  'tripod.com',
  // News
  'nytimes.com', 'wsj.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'theguardian.com', 'huffpost.com', 'buzzfeed.com',
]);

const isBlockedHost = (host: string): boolean => {
  if (BLOCKED_HOSTS.has(host)) return true;
  for (const blocked of BLOCKED_HOSTS) {
    if (host.endsWith('.' + blocked)) return true;
  }
  return false;
};

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
  /** True if source is a known shopping site. */
  isShopping: boolean;
};

export type LensSearchResponse = {
  query: string;
  bestGuessLabels: string[];
  results: LensResult[];
  error?: string;
  /** True if Vision could not be called (no API key, etc). UI should show config hint. */
  notConfigured?: boolean;
};

const normalizeHost = (url: string): string => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** A product-page link: kept exactly as given, but only if it is a real http(s) URL. */
export const toWebUrl = (u: unknown): string => {
  if (typeof u !== 'string') return '';
  const trimmed = u.trim();
  return /^https?:\/\//i.test(trimmed) && normalizeHost(trimmed) ? trimmed : '';
};

/**
 * An image URL the app can actually load. App Transport Security blocks plain
 * http, so http images are upgraded to https; other schemes (data:, file:,
 * javascript:) and junk are dropped. Returns '' when there is no usable URL.
 */
export const toSecureImageUrl = (u: unknown): string =>
  toWebUrl(u).replace(/^http:\/\//i, 'https://');

/**
 * Segments that indicate a URL is a category/shelf page rather than a
 * specific product detail page. We aggressively filter these out because they
 * return generic titles like "Handbags Shop All" that never match a single
 * item the user is adding.
 */
const SHELF_URL_PATTERNS = [
  /\/shop\/([^/?]+\/?)?$/i,
  /\/shop\?/i,
  /\/c\//i,
  /\/category\//i,
  /\/categories\//i,
  /\/browse\//i,
  /\/collection\//i,
  /\/collections\/[^/?]+\/?$/i, // /collections/bags (shelf) but keep /collections/x/products/y
  /\/all-[a-z-]+/i,
  /\/gp\/browse/i,
  /\/s\?k=/i,
  /\/search\?/i,
];

const isShelfUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return SHELF_URL_PATTERNS.some(re => re.test(path));
  } catch {
    return false;
  }
};

/**
 * Titles that indicate a shelf/search page rather than a product listing.
 */
const SHELF_TITLE_PATTERNS = [
  /shop all/i,
  /shop by/i,
  /^all [a-z]+/i,
  /browse/i,
  /category/i,
  /search results/i,
  /collection/i,
];

const isShelfTitle = (title: string): boolean =>
  SHELF_TITLE_PATTERNS.some(re => re.test(title));

/**
 * Score a lens result by how well its title/source matches the detected
 * attributes from the initial photo. Returns a 0..∞ score (higher = better).
 *
 * Much more effective than Vision's raw similarity score for our use case
 * because we're filtering out same-category-different-product noise.
 */
export const scoreLensResultByAttributes = (
  result: { title: string; source: string; similarity: number },
  attrs: {
    color?: string;
    subtype?: string;
    category?: string;
    material?: string;
    brand?: string;
  },
): number => {
  const t = result.title.toLowerCase();
  const s = result.source.toLowerCase();
  let score = result.similarity * 2; // base from Vision

  // Strong signal: specific detected color appears in title
  if (attrs.color && t.includes(attrs.color.toLowerCase())) score += 5;
  // Related color synonyms get a smaller boost
  const colorSynonyms: Record<string, string[]> = {
    burgundy: ['maroon', 'wine', 'oxblood', 'merlot', 'dark red'],
    maroon: ['burgundy', 'wine', 'oxblood'],
    wine: ['burgundy', 'maroon', 'merlot'],
    navy: ['dark blue', 'midnight'],
    charcoal: ['dark gray', 'dark grey', 'graphite'],
    camel: ['tan', 'beige', 'caramel', 'nude'],
    champagne: ['cream', 'ivory', 'off-white', 'nude'],
    gray: ['grey'],
    grey: ['gray'],
  };
  if (attrs.color) {
    const syns = colorSynonyms[attrs.color.toLowerCase()] || [];
    if (syns.some(syn => t.includes(syn))) score += 3;
  }

  // Subtype match (handbag, sneaker, jeans...)
  if (attrs.subtype && t.includes(attrs.subtype.toLowerCase())) score += 4;

  // Category match (fallback if subtype not detected)
  if (attrs.category && t.includes(attrs.category.toLowerCase())) score += 2;

  // Material match
  if (attrs.material && t.includes(attrs.material.toLowerCase())) score += 2;

  // Brand match
  if (attrs.brand && (t.includes(attrs.brand.toLowerCase()) || s.includes(attrs.brand.toLowerCase()))) {
    score += 3;
  }

  // Heavy penalty for shelf titles we already try to filter — belt & braces
  if (isShelfTitle(result.title)) score -= 10;

  return score;
};

/**
 * Filter + rank lens results against detected attributes. Drops shelf pages,
 * dedupes by (title+source), then ranks by attribute-match score. Returns
 * only the top N that actually look like they could be the user's item.
 */
export const refineLensResults = (
  results: LensResult[],
  attrs: {
    color?: string;
    subtype?: string;
    category?: string;
    material?: string;
    brand?: string;
  },
  limit = 6,
): LensResult[] => {
  // ── Drop junk ──
  const cleaned = results.filter(r => {
    if (!/^https?:\/\//i.test(r.imageUrl || '')) return false;
    if (isBlockedHost(r.source)) return false;   // YouTube / Pinterest / blogs
    if (isShelfUrl(r.url)) return false;
    if (isShelfTitle(r.title)) return false;
    // Require a shopping host — after the block filter, this keeps ONLY real
    // retailers (clothes brands, marketplaces, resale). Lens results from
    // random one-off pages rarely have usable product data.
    if (!r.isShopping) return false;
    return true;
  });

  // ── De-dupe by (title + source) ──
  const seen = new Set<string>();
  const deduped: LensResult[] = [];
  for (const r of cleaned) {
    const key = `${r.title.trim().toLowerCase()}|${r.source.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  // ── Rank ──
  const scored = deduped
    .map(r => ({ r, s: scoreLensResultByAttributes(r, attrs) }))
    .sort((a, b) => b.s - a.s);

  // Require a minimum score so we don't return junk when nothing really matches
  const passing = scored.filter(x => x.s > 0);

  return passing.slice(0, limit).map(x => x.r);
};

const isShoppingHost = (host: string): boolean => {
  if (SHOPPING_HOSTS.has(host)) return true;
  // Subdomain match
  for (const known of SHOPPING_HOSTS) {
    if (host.endsWith('.' + known)) return true;
  }
  return false;
};

export const searchByImage = async (imageUri: string): Promise<LensSearchResponse> => {
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
    const labels = (first.labelAnnotations ?? []).map((l: any) => l.description);

    const bestGuessLabels: string[] = (web.bestGuessLabels ?? []).map(
      (g: any) => g.label,
    );
    const query = bestGuessLabels[0] || labels.slice(0, 3).join(' ');

    // Build results from pagesWithMatchingImages + visuallySimilarImages.
    // Prefer pages with matching images (they link to actual pages) over
    // standalone images.
    const pages: any[] = web.pagesWithMatchingImages ?? [];
    const similarImages: any[] = web.visuallySimilarImages ?? [];

    const results: LensResult[] = [];
    const seen = new Set<string>();

    pages.forEach((p, idx) => {
      const pageUrl = toWebUrl(p?.url);
      if (!pageUrl) return;
      const host = normalizeHost(pageUrl);
      if (!host || seen.has(pageUrl)) return;
      if (isBlockedHost(host)) return;
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

      results.push({
        id: `page-${idx}`,
        title: (p.pageTitle || host).substring(0, 80),
        source: host,
        url: pageUrl,
        imageUrl,
        similarity: p.score ?? 0,
        isShopping: isShoppingHost(host),
      });
    });

    // Fall back to visuallySimilarImages if we got almost no pages
    if (results.length < 4) {
      similarImages.forEach((img, idx) => {
        const imgUrl = toWebUrl(img?.url);
        if (!imgUrl || seen.has(imgUrl)) return;
        const host = normalizeHost(imgUrl);
        if (isBlockedHost(host)) return;
        seen.add(imgUrl);
        results.push({
          id: `sim-${idx}`,
          title: host || 'Similar image',
          source: host,
          url: imgUrl,
          imageUrl: toSecureImageUrl(imgUrl),
          similarity: img.score ?? 0.5,
          isShopping: isShoppingHost(host),
        });
      });
    }

    // Sort: shopping results first, then by similarity descending
    results.sort((a, b) => {
      if (a.isShopping !== b.isShopping) return a.isShopping ? -1 : 1;
      return b.similarity - a.similarity;
    });

    return {
      query,
      bestGuessLabels,
      results: results.slice(0, 30),
    };
  } catch (error: any) {
    console.warn('[lens] image search error:', error?.message);
    return failed(friendlyAiMessage('other', 'search'));
  }
};

// ─── Text-based product search ──────────────────────────────────────────────

/**
 * Search for products by text query via Brave Image Search (proxied). Returns
 * only what the web returned; when the search fails or finds nothing the
 * response is empty (with a friendly `error` on failure) so the UI can say so
 * rather than show invented products.
 *
 * Previously used Google Custom Search JSON API — Google closed that API to
 * any project/key created after 2026-01-20 (hard 403 regardless of billing
 * or enablement status), so it's no longer usable for new setups.
 */
export const searchProductsByText = async (
  query: string,
): Promise<LensSearchResponse> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: '', bestGuessLabels: [], results: [] };
  }

  // Brave config lives server-side in Supabase Secrets; clients only need
  // to be signed in to invoke the proxy.
  let data: any;
  try {
    data = await callAiProxy<any>('brave', {
      q: trimmed,
      num: 10,
      safe: 'active',
    });
  } catch (err: any) {
    console.warn('[lens] text search failed:', err?.message?.substring(0, 120));
    return {
      query: trimmed,
      bestGuessLabels: [trimmed],
      results: [],
      error: friendlyAiMessage(classifyAiError(err), 'search'),
    };
  }

  const items: any[] = Array.isArray(data?.results) ? data.results : [];
  const results: LensResult[] = [];
  items.forEach((it, idx) => {
    const pageUrl = toWebUrl(it?.url);
    if (!pageUrl) return;
    const host = normalizeHost(pageUrl);
    // Drop YouTube / Pinterest / blogs — we want actual shoppable items.
    if (!host || isBlockedHost(host)) return;
    results.push({
      id: `brave-${idx}`,
      title: (it.title || host).substring(0, 80),
      source: host,
      url: pageUrl,
      // Brave's thumbnail is its own https proxy URL and sized for a card; the
      // original image URL is often http or hotlink-protected, so it's the backup.
      imageUrl: toSecureImageUrl(it.thumbnail?.src) || toSecureImageUrl(it.properties?.url),
      similarity: 1 - idx * 0.05,
      isShopping: isShoppingHost(host),
    });
  });
  // Shopping first
  results.sort((a, b) => {
    if (a.isShopping !== b.isShopping) return a.isShopping ? -1 : 1;
    return b.similarity - a.similarity;
  });

  return {
    query: trimmed,
    bestGuessLabels: [trimmed],
    results,
  };
};
